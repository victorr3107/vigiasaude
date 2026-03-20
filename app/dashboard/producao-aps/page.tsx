'use client'

/**
 * APSProducaoValidacao — tela unificada de Produção APS + Validação SISAB
 * Rotas: /dashboard/producao-aps?tab=geral|producao|validacao|indicadores
 */

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TabNavigation, { TabItem } from '@/app/components/TabNavigation'
import {
  LineChart, Line, BarChart, Bar, ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ReferenceDot, Cell, LabelList,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Municipio {
  id: string          // UUID
  nome: string
  uf: string
  ibge7: string       // 7 dígitos (para APIs SISAB)
  ibge6: string       // 6 dígitos (para benchmarks)
}

interface ProducaoMensal {
  municipio_id: string
  municipio_nome: string
  uf: string
  ano: number
  competencia: string
  competencia_label: string
  atendimento_individual: number
  atendimento_odonto: number
  procedimentos: number
  visita_domiciliar: number
  total_producao: number
}

interface BenchmarksTipo { mediana: number; p25: number; p75: number; p90: number }
interface BenchmarksMun {
  at_individual_percentil: number; at_individual_quartil: number
  odonto_percentil: number;        odonto_quartil: number
  procedimentos_percentil: number; procedimentos_quartil: number
  visita_percentil: number;        visita_quartil: number
}
interface Benchmarks {
  ano: number
  total_municipios_sp: number
  at_individual: BenchmarksTipo
  odonto: BenchmarksTipo
  procedimentos: BenchmarksTipo
  visita: BenchmarksTipo
  municipio: BenchmarksMun | null
}

interface SisabEvolucao {
  competencia: string
  total: number
  aprovado: number
  reprovado: number
  duplicado: number
  nao_aplicado: number
  pendente: number
  taxa_aprovacao: number
  taxa_reprovacao: number
}
interface SisabMotivo { motivo: string; fichas: number; pct: number }
interface SisabMotivoData { total_reprovado: number; por_motivo: SisabMotivo[]; evolucao_temporal: Array<Record<string, number | string>> }
interface SisabStats {
  ibge: string; municipio: string; uf: string
  total: number; aprovado: number; reprovado: number
  duplicado: number; nao_aplicado: number; pendente: number; outros: number
  taxa_aprovacao: number; taxa_reprovacao: number
  principal_motivo: string | null
  motivos: Record<string, number> | null
  critico: { principal_motivo: string; motivos: Record<string, number>; rank_reprovacao: number } | null
  pendentes: { fichas: number; competencias: string[] } | null
}

// ── Constantes ────────────────────────────────────────────────────────────────

const TIPOS = [
  { key: 'atendimento_individual', label: 'At. Individual', cor: 'var(--chart-green)',  bench: 'at_individual'  as const },
  { key: 'procedimentos',          label: 'Procedimentos',  cor: 'var(--chart-blue)',   bench: 'procedimentos'  as const },
  { key: 'visita_domiciliar',      label: 'Visita ACS',     cor: 'var(--chart-amber)',  bench: 'visita'         as const },
  { key: 'atendimento_odonto',     label: 'Odontológico',   cor: 'var(--chart-purple)', bench: 'odonto'         as const },
]

const MESES: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
}

const CORES_MOTIVO: Record<string, string> = {
  PROF: 'var(--danger)', CNES: 'var(--chart-amber)',
  INE: 'var(--chart-blue)', CBO: 'var(--chart-purple)',
  'MÚLTIPLOS': 'var(--chart-indigo)', OUTROS: 'var(--chart-slate)',
}
const MOTIVO_CAUSA: Record<string, string> = {
  PROF: 'Profissional sem vínculo ativo no CNES',
  CNES: 'Unidade inativa ou incorreta no CNES',
  INE: 'Identificador Nacional de Equipe inválido',
  CBO: 'Ocupação incompatível com o tipo de ficha',
  'MÚLTIPLOS': 'Múltiplos problemas cadastrais simultâneos',
  OUTROS: 'Outros erros de validação',
}
const MOTIVO_ACAO: Record<string, string> = {
  PROF: 'Atualize os vínculos profissionais no CNES antes do fechamento da competência',
  CNES: 'Verifique se a unidade está ativa e corretamente cadastrada no CNES',
  INE: 'Confira o Identificador Nacional de Equipe no cadastro da equipe',
  CBO: 'Verifique se o CBO do profissional é compatível com o tipo de ficha',
  'MÚLTIPLOS': 'Múltiplos problemas cadastrais — acione a gestão do CNES',
  OUTROS: 'Verifique os detalhes no relatório de validação do SISAB',
}

const TABS: TabItem[] = [
  { id: 'geral',      label: 'Visão Geral' },
  { id: 'producao',   label: 'Produção' },
  { id: 'validacao',  label: 'Validação SISAB' },
  { id: 'indicadores', label: 'Indicadores', badge: 'Em breve', disabled: true },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString('pt-BR') }
function fmtK(v: number) { return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v) }
function fmtM(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace('.', ',')}K`
  return n.toString()
}
function labelMes(c: string)  { return MESES[c.slice(5, 7)] ?? c.slice(5, 7) }
function labelComp(c: string) {
  const [ano, mes] = c.split('-')
  const arr = Object.values(MESES)
  return `${arr[(parseInt(mes) - 1) % 12]}/${ano.slice(2)}`
}
function taxaEfetiva(aprovado: number, total: number, nao_ap: number, dup: number) {
  const base = total - nao_ap - dup
  return base > 0 ? (aprovado / base) * 100 : 0
}
function quartilLabel(q: number) {
  if (q >= 75) return { label: 'Top 25% SP',         cor: 'var(--success)',  bg: 'var(--success-subtle)' }
  if (q >= 50) return { label: 'Acima da mediana SP', cor: 'var(--chart-blue)', bg: 'var(--info-subtle)' }
  if (q >= 25) return { label: 'Abaixo da mediana SP',cor: 'var(--chart-amber)', bg: 'var(--warning-subtle)' }
  return       { label: 'Quartil inferior SP',       cor: 'var(--danger)',   bg: 'var(--danger-subtle)' }
}

// ── Componentes base ──────────────────────────────────────────────────────────

function Spinner({ msg }: { msg?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 0' }}>
      <div style={{ width: 36, height: 36, border: '3px solid var(--accent-subtle)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      {msg && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{msg}</span>}
    </div>
  )
}

function ChartCard({ title, subtitle, children, badge }: {
  title: string; subtitle?: string; badge?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
          {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>{subtitle}</p>}
        </div>
        {badge}
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </div>
  )
}

function TooltipCustom({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '12px 16px', boxShadow: 'var(--shadow-md)', fontSize: 12 }}>
      <p style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 3 }}>
          <span style={{ color: p.color, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
            {p.name}
          </span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Total</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmt(payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0))}</span>
        </div>
      )}
    </div>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 20px' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  )
}

// ── ABA VISÃO GERAL ───────────────────────────────────────────────────────────

function FunilNarrativo({
  anoSel, municipio, apsData, sisabSerie, sisabStats, onGoToValidacao
}: {
  anoSel: number
  municipio: Municipio
  apsData: ProducaoMensal[]
  sisabSerie: SisabEvolucao[]
  sisabStats: SisabStats | null
  onGoToValidacao: () => void
}) {
  // Total produzido APS no ano
  const totalProduzido = apsData.reduce((s, d) => s + d.total_producao, 0)

  // Dados SISAB do ano selecionado (acumulado)
  const sisabAno = useMemo(() => {
    const slice = sisabSerie.filter(d => d.competencia.startsWith(String(anoSel)))
    if (!slice.length) return null
    return slice.reduce((acc, e) => ({
      competencia: String(anoSel),
      total:       acc.total + e.total,
      aprovado:    acc.aprovado + e.aprovado,
      reprovado:   acc.reprovado + e.reprovado,
      duplicado:   acc.duplicado + e.duplicado,
      nao_aplicado:acc.nao_aplicado + e.nao_aplicado,
      pendente:    acc.pendente + e.pendente,
      taxa_aprovacao: 0, taxa_reprovacao: 0,
    }))
  }, [sisabSerie, anoSel])

  const fichasEnviadas  = sisabAno?.total ?? 0
  const fichasAprovadas = sisabAno?.aprovado ?? 0
  const taxaAprov       = sisabAno
    ? taxaEfetiva(sisabAno.aprovado, sisabAno.total, sisabAno.nao_aplicado, sisabAno.duplicado)
    : null

  const etapas = [
    { label: 'Total Produzido',   valor: totalProduzido,  cor: 'var(--accent)',       pct: null },
    { label: 'Fichas Enviadas',   valor: fichasEnviadas,  cor: 'var(--chart-blue)',   pct: totalProduzido > 0 ? fichasEnviadas / totalProduzido * 100 : null },
    { label: 'Aprovadas SISAB',   valor: fichasAprovadas, cor: 'var(--success)',      pct: fichasEnviadas > 0 ? fichasAprovadas / fichasEnviadas * 100 : null },
    { label: 'Conta p/ Indicadores', valor: fichasAprovadas, cor: 'var(--success)',   pct: fichasEnviadas > 0 ? fichasAprovadas / fichasEnviadas * 100 : null },
  ]

  const statusIcon = (pct: number | null) => {
    if (pct === null) return null
    if (pct >= 98) return <span style={{ color: 'var(--success)', fontSize: 14 }}>✓</span>
    if (pct >= 95) return <span style={{ color: 'var(--chart-amber)', fontSize: 14 }}>⚠</span>
    return <span style={{ color: 'var(--danger)', fontSize: 14 }}>✗</span>
  }

  // Narrativa
  let narrativa = ''
  if (totalProduzido > 0 && taxaAprov !== null) {
    const classif = taxaAprov >= 99 ? 'Excelente' : taxaAprov >= 97 ? 'Bom' : taxaAprov >= 95 ? 'Atenção' : 'Crítico'
    narrativa = `Em ${anoSel}, ${municipio.nome} registrou ${fmt(totalProduzido)} atendimentos na APS. ${taxaAprov.toFixed(1).replace('.', ',')}% das fichas enviadas ao SISAB foram aprovadas — ${classif}.`
    if (taxaAprov >= 99) {
      narrativa += ` Praticamente toda a produção será contabilizada para os indicadores do Previne Brasil.`
    } else if (sisabAno && sisabAno.reprovado > 0) {
      const motivo = sisabStats?.principal_motivo
      narrativa += ` ${fmt(sisabAno.reprovado)} fichas foram reprovadas${motivo ? `, principalmente por ${motivo}` : ''}.`
    }
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px', boxShadow: 'var(--shadow-sm)', marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18 }}>
        Ciclo da Produção APS — {anoSel}
      </h3>

      {/* Funil horizontal */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginBottom: 16, overflowX: 'auto' }}>
        {etapas.map((e, i) => (
          <div key={e.label} style={{ flex: 1, minWidth: 130, display: 'flex', alignItems: 'stretch' }}>
            <div style={{ flex: 1, padding: '14px 12px', background: `${e.cor}10`, border: `1px solid ${e.cor}30`, borderRadius: i === 0 ? '10px 0 0 10px' : i === etapas.length - 1 ? '0 10px 10px 0' : 0, borderLeft: i > 0 ? 'none' : undefined, textAlign: 'center', position: 'relative' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, lineHeight: 1.3 }}>{e.label}</div>
              <div style={{ fontSize: 'clamp(16px, 2.5vw, 22px)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', lineHeight: 1 }}>
                {e.valor > 0 ? fmtM(e.valor) : '—'}
              </div>
              {e.pct !== null && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 5 }}>
                  {statusIcon(e.pct)}
                  <span style={{ fontSize: 11, fontWeight: 600, color: e.pct >= 98 ? 'var(--success)' : e.pct >= 95 ? 'var(--chart-amber)' : 'var(--danger)' }}>
                    {e.pct.toFixed(1).replace('.', ',')}%
                  </span>
                </div>
              )}
            </div>
            {i < etapas.length - 1 && (
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', color: 'var(--text-dim)', fontSize: 18, flexShrink: 0 }}>›</div>
            )}
          </div>
        ))}
      </div>

      {/* Badge de aprovação */}
      {taxaAprov !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          {taxaAprov >= 98 ? (
            <span style={{ fontSize: 12, fontWeight: 700, background: 'var(--success-subtle)', color: 'var(--success)', borderRadius: 20, padding: '4px 12px', border: '1px solid var(--success)' }}>
              ✓ Aprovação integral — toda a produção será contabilizada
            </span>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, background: 'var(--warning-subtle)', color: 'var(--warning)', borderRadius: 20, padding: '4px 12px', border: '1px solid var(--warning)', cursor: 'pointer' }} onClick={onGoToValidacao}>
              ⚠ Taxa {taxaAprov.toFixed(1).replace('.', ',')}% — Ver causas →
            </span>
          )}
        </div>
      )}

      {/* Narrativa */}
      {narrativa && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          {narrativa}
        </p>
      )}
    </div>
  )
}

function KpisGeral({ anoSel, municipio, apsData, sisabSerie, sisabStats, benchmarks }: {
  anoSel: number; municipio: Municipio
  apsData: ProducaoMensal[]; sisabSerie: SisabEvolucao[]
  sisabStats: SisabStats | null; benchmarks: Benchmarks | null
}) {
  const totais = useMemo(() => TIPOS.reduce((acc, t) => {
    acc[t.key] = apsData.reduce((s, d) => s + (d[t.key as keyof ProducaoMensal] as number ?? 0), 0)
    return acc
  }, {} as Record<string, number>), [apsData])

  const totalGeral = Object.values(totais).reduce((s, v) => s + v, 0)

  const sisabAno = useMemo(() => {
    const slice = sisabSerie.filter(d => d.competencia.startsWith(String(anoSel)))
    if (!slice.length) return null
    return slice.reduce((acc, e) => ({ ...acc, total: acc.total + e.total, aprovado: acc.aprovado + e.aprovado, reprovado: acc.reprovado + e.reprovado, nao_aplicado: acc.nao_aplicado + e.nao_aplicado, duplicado: acc.duplicado + e.duplicado }), { total: 0, aprovado: 0, reprovado: 0, nao_aplicado: 0, duplicado: 0 })
  }, [sisabSerie, anoSel])

  const taxaAprov = sisabAno ? taxaEfetiva(sisabAno.aprovado, sisabAno.total, sisabAno.nao_aplicado, sisabAno.duplicado) : null
  const munBench  = benchmarks?.municipio

  // Percentil total (média dos percentis dos 4 tipos)
  const percentilTotal = munBench
    ? Math.round((munBench.at_individual_percentil + munBench.odonto_percentil + munBench.procedimentos_percentil + munBench.visita_percentil) / 4)
    : null

  // Composição
  const tipoMax = TIPOS.reduce((a, b) => totais[a.key] > totais[b.key] ? a : b)
  const pctMax  = totalGeral > 0 ? totais[tipoMax.key] / totalGeral * 100 : 0
  const compText = pctMax > 40
    ? (tipoMax.key === 'procedimentos' ? 'Perfil orientado a procedimentos'
      : tipoMax.key === 'atendimento_individual' ? 'Forte atenção clínica individual'
      : tipoMax.key === 'visita_domiciliar' ? 'Alta cobertura de visitas domiciliares'
      : 'Destaque em saúde bucal')
    : 'Produção equilibrada entre tipos'

  // Odontológico
  const odontoPct   = totalGeral > 0 ? totais['atendimento_odonto'] / totalGeral * 100 : 0
  const odontoPerc  = munBench?.odonto_percentil ?? null

  // ClassBadge SISAB
  const sisabClass = taxaAprov === null ? null
    : taxaAprov >= 99 ? { label: 'Excelente', cor: 'var(--success)', bg: 'var(--success-subtle)' }
    : taxaAprov >= 97 ? { label: 'Bom',       cor: 'var(--chart-blue)', bg: 'var(--info-subtle)' }
    : taxaAprov >= 95 ? { label: 'Atenção',   cor: 'var(--warning)',  bg: 'var(--warning-subtle)' }
    : { label: 'Crítico', cor: 'var(--danger)', bg: 'var(--danger-subtle)' }

  const totalQLabel = percentilTotal !== null ? quartilLabel(percentilTotal) : null

  const cards = [
    {
      label: 'Produção Total',
      value: fmt(totalGeral),
      sub: `Atendimentos em ${anoSel}`,
      badge: totalQLabel ? (
        <span style={{ fontSize: 11, fontWeight: 700, background: totalQLabel.bg, color: totalQLabel.cor, borderRadius: 20, padding: '2px 8px' }}>
          {totalQLabel.label}
        </span>
      ) : null,
      nota: percentilTotal !== null ? `Percentil ${percentilTotal} em SP` : null,
    },
    {
      label: 'Taxa de Aprovação SISAB',
      value: taxaAprov !== null ? `${taxaAprov.toFixed(1).replace('.', ',')}%` : '—',
      sub: 'Fichas contabilizáveis',
      badge: sisabClass ? (
        <span style={{ fontSize: 11, fontWeight: 700, background: sisabClass.bg, color: sisabClass.cor, borderRadius: 20, padding: '2px 8px' }}>
          {sisabClass.label}
        </span>
      ) : null,
      nota: null,
    },
    {
      label: 'Composição da Produção',
      value: `${tipoMax.label} · ${pctMax.toFixed(0)}%`,
      sub: compText,
      badge: null,
      nota: null,
      extra: (
        <div style={{ marginTop: 8, height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', gap: 1 }}>
          {TIPOS.map(t => {
            const pct = totalGeral > 0 ? totais[t.key] / totalGeral * 100 : 0
            return <div key={t.key} style={{ height: '100%', width: `${pct}%`, background: t.cor, transition: 'width 0.5s ease' }} title={`${t.label}: ${pct.toFixed(1)}%`} />
          })}
        </div>
      ),
    },
    {
      label: 'Odontológico',
      value: fmt(totais['atendimento_odonto']),
      sub: `${odontoPct.toFixed(1)}% do total`,
      badge: odontoPerc !== null ? (
        <span style={{ fontSize: 11, fontWeight: 700,
          background: odontoPerc < 25 ? 'var(--warning-subtle)' : 'var(--success-subtle)',
          color: odontoPerc < 25 ? 'var(--warning)' : 'var(--success)',
          borderRadius: 20, padding: '2px 8px' }}>
          Percentil {odontoPerc} SP
        </span>
      ) : null,
      nota: odontoPerc !== null && odontoPerc < 25
        ? `Abaixo de ${100 - odontoPerc}% dos municípios SP`
        : null,
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
      {cards.map(c => (
        <div key={c.label} className="kpi-card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, fontWeight: 600 }}>{c.label}</div>
          <div style={{ fontSize: 'clamp(17px, 3vw, 26px)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', lineHeight: 1.1, marginBottom: 4 }}>{c.value}</div>
          {c.sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{c.sub}</div>}
          {c.badge && <div style={{ marginBottom: 6 }}>{c.badge}</div>}
          {c.nota && <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>{c.nota}</div>}
          {'extra' in c && c.extra}
        </div>
      ))}
    </div>
  )
}

function MiniTimeline({ apsData, sisabSerie }: { apsData: ProducaoMensal[]; sisabSerie: SisabEvolucao[] }) {
  const ultimos6 = apsData.slice(-6)
  if (ultimos6.length < 2) return null

  const chartData = ultimos6.map(d => {
    const sis = sisabSerie.find(s => s.competencia === d.competencia)
    const taxa = sis ? taxaEfetiva(sis.aprovado, sis.total, sis.nao_aplicado, sis.duplicado) : null
    return {
      mes:     labelMes(d.competencia),
      comp:    d.competencia,
      volume:  d.total_producao,
      taxa:    taxa !== null ? parseFloat(taxa.toFixed(1)) : null,
      alerta:  taxa !== null && taxa < 95,
    }
  })

  return (
    <ChartCard title="Últimos 6 meses" subtitle="Produção e taxa de aprovação SISAB">
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 50, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="vol" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={40} />
          <YAxis yAxisId="taxa" orientation="right" domain={[90, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={40} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
            formatter={(v: any, name: any) => [name === 'taxa' ? `${v}%` : fmt(v), name === 'taxa' ? 'Aprovação' : 'Produção']}
          />
          <Bar yAxisId="vol" dataKey="volume" name="volume" fill="var(--accent)" opacity={0.25} radius={[3, 3, 0, 0]} />
          <Line yAxisId="taxa" type="monotone" dataKey="taxa" name="taxa" stroke="var(--chart-green)" strokeWidth={2} dot={(p: any) => {
            if (!p.payload?.alerta) return <circle key={p.key} cx={p.cx} cy={p.cy} r={3} fill="var(--chart-green)" />
            return <text key={p.key} x={p.cx - 6} y={p.cy - 8} fontSize={12}>⚠</text>
          }} activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function AbaGeral({ anoSel, municipio, apsData, sisabSerie, sisabStats, benchmarks, onGoToValidacao }: {
  anoSel: number; municipio: Municipio
  apsData: ProducaoMensal[]; sisabSerie: SisabEvolucao[]
  sisabStats: SisabStats | null; benchmarks: Benchmarks | null
  onGoToValidacao: () => void
}) {
  if (apsData.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Nenhum dado de produção APS para {municipio.nome} em {anoSel}.</p>
      </div>
    )
  }

  return (
    <div>
      <FunilNarrativo anoSel={anoSel} municipio={municipio} apsData={apsData} sisabSerie={sisabSerie} sisabStats={sisabStats} onGoToValidacao={onGoToValidacao} />
      <KpisGeral anoSel={anoSel} municipio={municipio} apsData={apsData} sisabSerie={sisabSerie} sisabStats={sisabStats} benchmarks={benchmarks} />
      <MiniTimeline apsData={apsData} sisabSerie={sisabSerie} />
    </div>
  )
}

// ── ABA PRODUÇÃO ──────────────────────────────────────────────────────────────

interface InsightAPS { tipo: 'alerta' | 'positivo' | 'neutro' | 'info'; titulo: string; descricao: string; icon: string }

function gerarInsights(dados: ProducaoMensal[], bench?: Benchmarks | null): InsightAPS[] {
  if (dados.length < 2) return []
  const insights: InsightAPS[] = []
  const media = dados.reduce((s, d) => s + d.total_producao, 0) / dados.length
  const ultimo = dados[dados.length - 1]
  const penultimo = dados[dados.length - 2]
  const melhor = dados.reduce((a, b) => a.total_producao > b.total_producao ? a : b)
  const pior   = dados.reduce((a, b) => a.total_producao < b.total_producao ? a : b)

  const pct = (a: number, b: number) => b === 0 ? null : ((a - b) / b) * 100
  const varUlt = pct(ultimo.total_producao, penultimo.total_producao)
  if (varUlt !== null && varUlt <= -15) {
    insights.push({ tipo: 'alerta', icon: '📉', titulo: `Queda de ${Math.abs(varUlt).toFixed(1)}% em ${labelMes(ultimo.competencia)}`, descricao: `Produção caiu de ${fmt(penultimo.total_producao)} para ${fmt(ultimo.total_producao)} atendimentos.` })
  } else if (varUlt !== null && varUlt >= 10) {
    insights.push({ tipo: 'positivo', icon: '📈', titulo: `Alta de ${varUlt.toFixed(1)}% em ${labelMes(ultimo.competencia)}`, descricao: `Crescimento expressivo: de ${fmt(penultimo.total_producao)} para ${fmt(ultimo.total_producao)} atendimentos.` })
  }
  insights.push({ tipo: 'info', icon: '🏆', titulo: `Pico em ${labelMes(melhor.competencia)}: ${fmt(melhor.total_producao)}`, descricao: `${((melhor.total_producao / media - 1) * 100).toFixed(1)}% acima da média mensal de ${fmt(Math.round(media))} atendimentos.` })
  const varPior = pct(pior.total_producao, media)
  if (varPior !== null && varPior < -10) {
    insights.push({ tipo: varPior < -25 ? 'alerta' : 'neutro', icon: varPior < -25 ? '⚠️' : 'ℹ️', titulo: `Menor produção em ${labelMes(pior.competencia)}: ${fmt(pior.total_producao)}`, descricao: `${Math.abs(varPior).toFixed(1)}% abaixo da média anual.` })
  }
  // Quartil inferior de algum tipo
  if (bench?.municipio) {
    const m = bench.municipio
    const baixo = TIPOS.find(t => m[`${t.bench}_percentil` as keyof BenchmarksMun] as number < 25)
    if (baixo) {
      const p = m[`${baixo.bench}_percentil` as keyof BenchmarksMun] as number
      insights.push({ tipo: 'alerta', icon: '⚠️', titulo: `${baixo.label} está no percentil ${p} em SP`, descricao: `Abaixo de ${100 - p}% dos municípios paulistas — verificar capacidade instalada.` })
    }
  }
  const mesesAcima = dados.filter(d => d.total_producao >= media).length
  const pctAcima = (mesesAcima / dados.length) * 100
  insights.push({ tipo: pctAcima >= 50 ? 'positivo' : 'neutro', icon: pctAcima >= 50 ? '✅' : '📊', titulo: `${mesesAcima} de ${dados.length} meses acima da média`, descricao: `Média: ${fmt(Math.round(media))} atendimentos/mês. ${pctAcima >= 60 ? 'Produção regularmente acima da média.' : 'Produção com variações sazonais.'}` })
  return insights
}

function AbaProducao({ anoSel, municipio, apsData, benchmarks }: {
  anoSel: number; municipio: Municipio; apsData: ProducaoMensal[]; benchmarks: Benchmarks | null
}) {
  const [tiposVisiveis, setTiposVisiveis] = useState<Set<string>>(new Set(TIPOS.map(t => t.key)))
  const [tabelaExpandida, setTabelaExpandida] = useState(false)

  const totais = useMemo(() => TIPOS.reduce((acc, t) => {
    acc[t.key] = apsData.reduce((s, d) => s + (d[t.key as keyof ProducaoMensal] as number ?? 0), 0)
    return acc
  }, {} as Record<string, number>), [apsData])
  const totalGeral = Object.values(totais).reduce((s, v) => s + v, 0)
  const media = apsData.length > 0 ? Math.round(totalGeral / apsData.length) : 0

  const insights = useMemo(() => gerarInsights(apsData, benchmarks), [apsData, benchmarks])

  const chartData = useMemo(() => apsData.map(d => ({
    mes: labelMes(d.competencia), comp: d.competencia,
    atendimento_individual: d.atendimento_individual,
    atendimento_odonto:     d.atendimento_odonto,
    procedimentos:          d.procedimentos,
    visita_domiciliar:      d.visita_domiciliar,
    total:                  d.total_producao,
  })), [apsData])

  const piorMes = apsData.length > 0
    ? apsData.reduce((a, b) => a.total_producao < b.total_producao ? a : b)
    : null

  const tabelaDados = tabelaExpandida ? apsData : apsData.slice(-6)
  const munBench = benchmarks?.municipio
  const totalMunicipiosSP = benchmarks?.total_municipios_sp ?? null

  const coresTipo: Record<string, string> = { alerta: 'var(--danger)', positivo: 'var(--success)', neutro: 'var(--text-muted)', info: 'var(--chart-blue)' }

  const toggleTipo = (key: string) => setTiposVisiveis(prev => {
    const next = new Set(prev)
    if (next.has(key)) { if (next.size > 1) next.delete(key) } else next.add(key)
    return next
  })

  if (apsData.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <p style={{ color: 'var(--text-muted)' }}>Nenhum dado para {municipio.nome} em {anoSel}.</p>
    </div>
  )

  return (
    <div>
      {/* KPIs linha única */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Anual', valor: totalGeral, cor: 'var(--accent)', bench: null as string | null },
          ...TIPOS.map(t => ({ label: t.label, valor: totais[t.key], cor: t.cor, bench: t.bench as string })),
        ].map(c => {
          const p = c.bench && munBench ? munBench[`${c.bench}_percentil` as keyof BenchmarksMun] as number : null
          const ql = p !== null ? quartilLabel(p) : null
          return (
            <div key={c.label} className="kpi-card" style={{ padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -30, right: -20, width: 80, height: 80, background: c.cor, opacity: 0.06, borderRadius: '50%', filter: 'blur(20px)', pointerEvents: 'none' }} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontSize: 'clamp(16px, 2.5vw, 24px)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', lineHeight: 1 }}>{fmt(c.valor)}</div>
              {p !== null && ql && (
                <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, background: ql.bg, color: ql.cor, borderRadius: 20, padding: '2px 7px', display: 'inline-block' }}>P{p}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <>
          <SectionDivider label="Análise do período" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginBottom: 24 }}>
            {insights.map((ins, i) => {
              const c = { alerta: { bg: 'var(--danger-subtle)', border: 'var(--danger)' }, positivo: { bg: 'var(--success-subtle)', border: 'var(--success)' }, neutro: { bg: 'var(--bg-surface-2)', border: 'var(--border)' }, info: { bg: 'var(--info-subtle)', border: 'var(--info)' } }[ins.tipo]
              return (
                <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12 }}>
                  <span style={{ fontSize: 18, lineHeight: 1.3, flexShrink: 0 }}>{ins.icon}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{ins.titulo}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{ins.descricao}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Gráfico evolução */}
      <SectionDivider label="Evolução mensal" />
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Exibir:</span>
        {TIPOS.map(t => (
          <button key={t.key} onClick={() => toggleTipo(t.key)}
            style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${tiposVisiveis.has(t.key) ? t.cor + '66' : 'var(--border-input)'}`, background: tiposVisiveis.has(t.key) ? t.cor + '22' : 'transparent', color: tiposVisiveis.has(t.key) ? t.cor : 'var(--text-dim)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: tiposVisiveis.has(t.key) ? t.cor : 'var(--border-strong)', display: 'inline-block' }} />
            {t.label}
          </button>
        ))}
      </div>
      <ChartCard title="Evolução mensal" subtitle={`Média ${fmt(media)} atendimentos/mês`} badge={
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{municipio.nome} · {anoSel}</span>
      }>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={40} />
            <Tooltip content={<TooltipCustom />} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} formatter={v => <span style={{ color: 'var(--text-secondary)' }}>{v}</span>} />
            <ReferenceLine y={media} stroke="var(--text-dim)" strokeDasharray="4 3" strokeWidth={1}
              label={{ value: 'Média', position: 'insideTopRight', fill: 'var(--text-dim)', fontSize: 10 }} />
            {piorMes && (
              <ReferenceLine x={labelMes(piorMes.competencia)} stroke="var(--danger)" strokeDasharray="3 3" strokeWidth={1}
                label={{ value: '↓ Menor', position: 'insideTopLeft', fill: 'var(--danger)', fontSize: 9 }} />
            )}
            {TIPOS.filter(t => tiposVisiveis.has(t.key)).map(t => (
              <Line key={t.key} type="monotone" dataKey={t.key} name={t.label} stroke={t.cor} strokeWidth={2}
                dot={{ r: 3, fill: t.cor, strokeWidth: 0 }} activeDot={{ r: 5 }} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Composição */}
      <SectionDivider label="Composição da produção" />
      <ChartCard title="Participação por tipo" subtitle={String(anoSel)}>
        {/* Barra proporcional */}
        <div style={{ display: 'flex', height: 32, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          {TIPOS.map(t => {
            const pct = totalGeral > 0 ? totais[t.key] / totalGeral * 100 : 0
            return (
              <div key={t.key} style={{ width: `${pct}%`, background: t.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                title={`${t.label}: ${pct.toFixed(1)}%`}>
                {pct > 12 && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>{pct.toFixed(0)}%</span>}
              </div>
            )
          })}
        </div>
        {/* Mini-tabela */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-2)' }}>
                {['Tipo', 'Total', '% do total', 'Percentil SP'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Tipo' ? 'left' : 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIPOS.map(t => {
                const pct = totalGeral > 0 ? totais[t.key] / totalGeral * 100 : 0
                const p   = munBench ? munBench[`${t.bench}_percentil` as keyof BenchmarksMun] as number : null
                const ql  = p !== null ? quartilLabel(p) : null
                return (
                  <tr key={t.key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.cor, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-secondary)' }}>{t.label}</span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(totais[t.key])}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: t.cor, fontWeight: 600 }}>{pct.toFixed(1)}%</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {ql && p !== null ? (
                        <span style={{ fontSize: 11, fontWeight: 700, background: ql.bg, color: ql.cor, borderRadius: 20, padding: '2px 8px' }}>P{p} {p < 25 ? '⚠' : ''}</span>
                      ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-surface-2)', borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>Total</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{fmt(totalGeral)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 11 }}>100%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </ChartCard>

      {/* Benchmarks SP */}
      {munBench && (
        <>
          <SectionDivider label={`Posição no Estado de SP — ${benchmarks?.ano ?? ''}`} />
          <ChartCard title="Benchmarks SP" subtitle={totalMunicipiosSP ? `Comparando com ${fmt(totalMunicipiosSP)} municípios paulistas` : undefined}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {TIPOS.map(t => {
                const p   = munBench[`${t.bench}_percentil` as keyof BenchmarksMun] as number
                const ql  = quartilLabel(p)
                return (
                  <div key={t.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.cor, display: 'inline-block' }} />
                        {t.label}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, background: ql.bg, color: ql.cor, borderRadius: 20, padding: '2px 8px' }}>
                        Percentil {p} {p < 25 ? '⚠' : ''}
                      </span>
                    </div>
                    {/* Barra de posição relativa */}
                    <div style={{ position: 'relative', height: 10, borderRadius: 6, background: 'var(--bg-surface-2)' }}>
                      {/* Zona P25-P75 */}
                      <div style={{ position: 'absolute', left: '25%', width: '50%', height: '100%', background: 'var(--border)', borderRadius: 6, opacity: 0.4 }} />
                      {/* Marcador do município */}
                      <div style={{ position: 'absolute', left: `${p}%`, top: '50%', transform: 'translate(-50%, -50%)', width: 14, height: 14, borderRadius: '50%', background: ql.cor, border: '2px solid var(--bg-card)', boxShadow: `0 0 6px ${ql.cor}88` }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>0 — Menor</span>
                      <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>100 — Maior</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Narrativa dinâmica */}
            {(() => {
              const rankMax = TIPOS.reduce((a, b) => {
                const pa = munBench[`${a.bench}_percentil` as keyof BenchmarksMun] as number
                const pb = munBench[`${b.bench}_percentil` as keyof BenchmarksMun] as number
                return pa > pb ? a : b
              })
              const rankMin = TIPOS.reduce((a, b) => {
                const pa = munBench[`${a.bench}_percentil` as keyof BenchmarksMun] as number
                const pb = munBench[`${b.bench}_percentil` as keyof BenchmarksMun] as number
                return pa < pb ? a : b
              })
              const pMax = munBench[`${rankMax.bench}_percentil` as keyof BenchmarksMun] as number
              const pMin = munBench[`${rankMin.bench}_percentil` as keyof BenchmarksMun] as number
              return (
                <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Em <strong>{rankMax.label}</strong>, {municipio.nome} está entre os melhores <strong>{(100 - pMax).toFixed(0)}%</strong> do estado.
                  {' '}O ponto de atenção é <strong>{rankMin.label}</strong>: percentil {pMin}, abaixo de {100 - pMin}% dos municípios paulistas.
                  {pMin < 25 && rankMin.bench === 'odonto' && ' A produção odontológica merece atenção — verificar capacidade instalada e cobertura de eSB.'}
                </p>
              )
            })()}
          </ChartCard>
        </>
      )}

      {/* Tabela mensal */}
      <SectionDivider label="Detalhamento mensal" />
      <ChartCard title="Detalhamento mensal" subtitle={tabelaExpandida ? 'Ano completo' : 'Últimos 6 meses'}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-2)' }}>
                {['Competência', ...TIPOS.map(t => t.label), 'Total', 'vs Média'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Competência' ? 'left' : 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabelaDados.map(d => {
                const varM = media > 0 ? ((d.total_producao - media) / media) * 100 : null
                const corVM = varM === null ? 'var(--text-muted)'
                  : varM > 10 ? 'var(--success)' : varM > 5 ? '#4ade80'
                  : varM > -5 ? 'var(--text-muted)' : varM > -10 ? 'var(--chart-amber)' : 'var(--danger)'
                return (
                  <tr key={d.competencia} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{labelMes(d.competencia)}/{d.ano}</td>
                    {TIPOS.map(t => (
                      <td key={t.key} style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>{fmt(d[t.key as keyof ProducaoMensal] as number)}</td>
                    ))}
                    <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>{fmt(d.total_producao)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                      {varM !== null && <span style={{ fontSize: 12, fontWeight: 600, color: corVM }}>{varM >= 0 ? '+' : ''}{varM.toFixed(1)}%</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-surface-2)', borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Total {anoSel}</td>
                {TIPOS.map(t => (
                  <td key={t.key} style={{ padding: '11px 14px', fontSize: 12, fontWeight: 700, textAlign: 'right', color: t.cor }}>{fmt(totais[t.key])}</td>
                ))}
                <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, color: 'var(--accent)', textAlign: 'right' }}>{fmt(totalGeral)}</td>
                <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>Média: {fmt(media)}/mês</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <button onClick={() => setTabelaExpandida(v => !v)}
            style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '6px 12px' }}>
            {tabelaExpandida ? '▲ Ver menos' : `▼ Ver todos os ${apsData.length} meses`}
          </button>
        </div>
      </ChartCard>
    </div>
  )
}

// ── ABA VALIDAÇÃO SISAB ───────────────────────────────────────────────────────

function MiniFunil({ sisabAno }: { sisabAno: { total: number; aprovado: number; reprovado: number; nao_aplicado: number; duplicado: number } | null }) {
  if (!sisabAno || sisabAno.total === 0) return null
  const taxa = taxaEfetiva(sisabAno.aprovado, sisabAno.total, sisabAno.nao_aplicado, sisabAno.duplicado)
  const reprov = sisabAno.reprovado
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, marginBottom: 20, flexWrap: 'wrap' }}>
      <div style={{ textAlign: 'center', padding: '8px 14px', background: 'var(--bg-surface-2)', borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Fichas enviadas</div>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fmtM(sisabAno.total)}</div>
      </div>
      <span style={{ color: 'var(--text-dim)', fontSize: 16 }}>→</span>
      <div style={{ textAlign: 'center', padding: '8px 14px', background: 'var(--success-subtle)', borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Aprovadas</div>
        <div style={{ fontWeight: 700, color: 'var(--success)' }}>{fmtM(sisabAno.aprovado)} ({taxa.toFixed(1)}%)</div>
      </div>
      <span style={{ color: 'var(--text-dim)', fontSize: 16 }}>→</span>
      <div style={{ textAlign: 'center', padding: '8px 14px', background: reprov > 0 ? 'var(--danger-subtle)' : 'var(--bg-surface-2)', borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Reprovadas</div>
        <div style={{ fontWeight: 700, color: reprov > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{fmtM(reprov)}</div>
      </div>
      {reprov > 0 && (
        <a href="#motivos-reprovacao" style={{ fontSize: 11, color: 'var(--chart-blue)', textDecoration: 'none', marginLeft: 8 }}>Ver causas ↓</a>
      )}
    </div>
  )
}

function AbaValidacao({ anoSel, municipio, sisabSerie, sisabStats, sisabMotivos }: {
  anoSel: number; municipio: Municipio
  sisabSerie: SisabEvolucao[]; sisabStats: SisabStats | null; sisabMotivos: SisabMotivoData | null
}) {
  const [abaMotivo, setAbaMotivo] = useState<'total' | 'temporal' | 'guia'>('total')

  const sisabAno = useMemo(() => {
    const slice = sisabSerie.filter(d => d.competencia.startsWith(String(anoSel)))
    if (!slice.length) return null
    return slice.reduce((acc, e) => ({
      competencia: String(anoSel), total: acc.total + e.total,
      aprovado: acc.aprovado + e.aprovado, reprovado: acc.reprovado + e.reprovado,
      duplicado: acc.duplicado + e.duplicado, nao_aplicado: acc.nao_aplicado + e.nao_aplicado,
      pendente: acc.pendente + e.pendente,
      taxa_aprovacao: 0, taxa_reprovacao: 0,
    }))
  }, [sisabSerie, anoSel])

  const chartAno = useMemo(() => {
    return sisabSerie
      .filter(d => d.competencia.startsWith(String(anoSel)))
      .map(d => ({
        label: labelComp(d.competencia),
        comp: d.competencia,
        taxa: parseFloat(taxaEfetiva(d.aprovado, d.total, d.nao_aplicado, d.duplicado).toFixed(2)),
        volume: Math.round(d.total / 1000),
        reprovado: d.reprovado,
      }))
  }, [sisabSerie, anoSel])

  // Tendência
  const ult3 = chartAno.slice(-3)
  const tendencia = ult3.length >= 2
    ? ult3[ult3.length - 1].taxa - ult3[0].taxa > 0.3 ? '↗ melhora'
    : ult3[ult3.length - 1].taxa - ult3[0].taxa < -0.3 ? '↘ piora' : '→ estável'
    : null

  const motivos = sisabStats?.motivos
  const barData = useMemo(() => {
    if (motivos) {
      const total = Object.values(motivos).reduce((s, v) => s + v, 0) || 1
      return Object.entries(motivos).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
        .map(([m, fichas]) => ({ motivo: m, fichas, pct: parseFloat((fichas / total * 100).toFixed(1)), color: CORES_MOTIVO[m] ?? 'var(--chart-slate)' }))
    }
    return sisabMotivos?.por_motivo.filter(m => m.fichas > 0).sort((a, b) => b.fichas - a.fichas)
      .map(m => ({ ...m, color: CORES_MOTIVO[m.motivo] ?? 'var(--chart-slate)' })) ?? []
  }, [motivos, sisabMotivos])

  const motivosComDados = sisabMotivos?.por_motivo.filter(m => m.fichas > 0).map(m => m.motivo) ?? []
  const evolData = sisabMotivos?.evolucao_temporal.map(e => ({ ...e, label: labelComp(e.competencia as string) })) ?? []

  const taxaAtual = chartAno.length > 0 ? chartAno[chartAno.length - 1]?.taxa : null
  const profPct = barData.find(m => m.motivo === 'PROF')?.pct ?? 0

  return (
    <div>
      <MiniFunil sisabAno={sisabAno} />

      {/* Gráfico evolução aprovação */}
      <ChartCard title="Evolução da Taxa de Aprovação" subtitle={`${municipio.nome} · ${anoSel}`}
        badge={tendencia ? (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
            background: tendencia.includes('melhora') ? 'var(--success-subtle)' : tendencia.includes('piora') ? 'var(--danger-subtle)' : 'var(--bg-surface-2)',
            color: tendencia.includes('melhora') ? 'var(--success)' : tendencia.includes('piora') ? 'var(--danger)' : 'var(--text-muted)' }}>
            {tendencia}
          </span>
        ) : undefined}>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartAno} margin={{ top: 10, right: 50, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="taxa" domain={['auto', 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} width={40} />
            <YAxis yAxisId="vol" orientation="right" tick={{ fontSize: 9, fill: 'var(--chart-slate)' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}K`} width={36} />
            <Tooltip
              labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
              contentStyle={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }}
              formatter={(v: any, name: any) => [name === 'volume' ? `${fmt(Number(v) * 1000)} fichas` : `${Number(v).toFixed(2).replace('.', ',')}%`, name === 'volume' ? 'Volume' : name === 'taxa' ? 'Aprovação efetiva' : 'Reprovação']}
            />
            <Area yAxisId="vol" type="monotone" dataKey="volume" name="volume" fill="var(--chart-slate)" fillOpacity={0.12} stroke="none" />
            <Line yAxisId="taxa" type="monotone" dataKey="taxa" name="taxa" stroke="var(--chart-green)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
            <Legend formatter={v => v === 'taxa' ? 'Aprovação (%)' : v === 'volume' ? 'Volume (K fichas)' : v} iconType="line" wrapperStyle={{ fontSize: 11 }} />
          </ComposedChart>
        </ResponsiveContainer>
        {taxaAtual !== null && (
          <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, fontStyle: 'italic' }}>
            Na competência mais recente de {anoSel}, {municipio.nome} teve taxa de aprovação de {taxaAtual.toFixed(2).replace('.', ',')}%.
            {tendencia && ` A tendência dos últimos ${ult3.length} meses é ${tendencia.includes('melhora') ? 'de melhora' : tendencia.includes('piora') ? 'de piora' : 'estável'}.`}
          </p>
        )}
      </ChartCard>

      {/* Motivos */}
      <div id="motivos-reprovacao">
        <SectionDivider label="Motivos de Reprovação" />
        <ChartCard title="Motivos de Reprovação" subtitle={sisabStats ? `${municipio.nome} — ${municipio.uf}` : 'Dados nacionais'}>
          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {(['total', 'temporal', 'guia'] as const).map(t => (
              <button key={t} onClick={() => setAbaMotivo(t)} style={{
                padding: '5px 12px', borderRadius: 6, minHeight: 30, cursor: 'pointer',
                border: '1px solid var(--border-subtle)',
                background: abaMotivo === t ? 'var(--accent)' : 'transparent',
                color: abaMotivo === t ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                fontSize: 12, fontWeight: abaMotivo === t ? 600 : 400,
              }}>
                {t === 'total' ? 'Distribuição' : t === 'temporal' ? 'Evolução mensal' : 'O que fazer'}
              </button>
            ))}
          </div>

          {abaMotivo === 'total' && (
            <>
              {profPct > 0 && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--danger-subtle)', borderLeft: '3px solid var(--danger)', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                  <strong>PROF</strong> é a causa de {Math.round(profPct / 10)} em cada 10 reprovações em {municipio.nome}. Indica profissional sem vínculo ativo no CNES.
                </div>
              )}
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(180, barData.length * 36)}>
                  <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 70, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={fmtM} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="motivo" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} width={72} />
                    <Tooltip contentStyle={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any, _n: any, p: any) => [`${fmtM(Number(v))} (${p.payload?.pct ?? 0}%)`, 'Fichas reprovadas']} />
                    <Bar dataKey="fichas" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="pct" position="right" formatter={(v: any) => `${v}%`} style={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                      {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>Nenhuma reprovação registrada para este período.</p>
              )}
            </>
          )}

          {abaMotivo === 'temporal' && (
            <>
              {motivos && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                  Evolução temporal de motivos disponível em escopo nacional. Os dados abaixo representam o acumulado do município.
                </p>
              )}
              {evolData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={evolData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={fmtM} width={44} />
                    <Tooltip contentStyle={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [fmtM(Number(v)), '']} />
                    <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
                    {motivosComDados.map(m => (
                      <Bar key={m} dataKey={m} name={m} stackId="a" fill={CORES_MOTIVO[m] ?? 'var(--chart-slate)'} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>Dados de evolução não disponíveis.</p>
              )}
            </>
          )}

          {abaMotivo === 'guia' && (
            <div style={{ overflowX: 'auto' }}>
              {barData.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {barData.map(m => (
                    <div key={m.motivo} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '14px 16px', borderLeft: `3px solid ${CORES_MOTIVO[m.motivo] ?? 'var(--chart-slate)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: CORES_MOTIVO[m.motivo] ?? 'var(--chart-slate)', background: 'var(--bg-surface-2)', borderRadius: 4, padding: '2px 8px' }}>{m.motivo}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtM(m.fichas)} fichas</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({m.pct}%)</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}><strong>Causa:</strong> {MOTIVO_CAUSA[m.motivo] ?? '—'}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}><strong>Solução:</strong> {MOTIVO_ACAO[m.motivo] ?? '—'}</p>
                      {m.motivo === 'PROF' && (
                        <a href="https://cnes.datasus.gov.br" target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: 'var(--chart-blue)', marginTop: 6, display: 'inline-block' }}>
                          → Acessar CNES (cnes.datasus.gov.br)
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>Nenhuma reprovação registrada — nenhuma ação necessária.</p>
              )}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Ranking */}
      {sisabStats && (
        <>
          <SectionDivider label="Posição no Ranking" />
          <ChartCard title="Posição no Ranking" subtitle={`${municipio.nome} — ${municipio.uf}`}
            badge={
              <span style={{ fontSize: 11, fontWeight: 700, color: sisabStats.taxa_reprovacao > 30 ? 'var(--danger)' : sisabStats.taxa_reprovacao > 15 ? 'var(--chart-amber)' : sisabStats.taxa_reprovacao > 5 ? 'var(--chart-indigo)' : 'var(--success)', border: `1px solid currentColor`, borderRadius: 4, padding: '2px 7px' }}>
                {sisabStats.taxa_reprovacao > 30 ? 'CRÍTICO' : sisabStats.taxa_reprovacao > 15 ? 'ALERTA' : sisabStats.taxa_reprovacao > 5 ? 'ATENÇÃO' : 'OK'}
              </span>
            }>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Taxa de aprovação efetiva</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{municipio.nome}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                  {taxaEfetiva(sisabStats.aprovado, sisabStats.total, sisabStats.nao_aplicado, sisabStats.duplicado).toFixed(2).replace('.', ',')}%
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-surface-2)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, taxaEfetiva(sisabStats.aprovado, sisabStats.total, sisabStats.nao_aplicado, sisabStats.duplicado))}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.4s' }} />
              </div>
            </div>
            {sisabStats.critico && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--danger-subtle)', borderLeft: '3px solid var(--danger)', fontSize: 12, color: 'var(--text-secondary)' }}>
                {municipio.nome} está entre os 100 municípios com maior volume de reprovação nacional (#{sisabStats.critico.rank_reprovacao}). Principal motivo: <strong>{String(sisabStats.critico.principal_motivo)}</strong>.
              </div>
            )}
          </ChartCard>
        </>
      )}
    </div>
  )
}

// ── ABA INDICADORES (placeholder) ─────────────────────────────────────────────

function AbaIndicadores() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <div style={{ fontSize: 48, marginBottom: 20 }}>📊</div>
      <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
        Indicadores do Previne Brasil
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 400, margin: '0 auto', lineHeight: 1.7 }}>
        Esta seção está em desenvolvimento. Aqui serão exibidos os indicadores do Previne Brasil calculados a partir da produção validada no SISAB, com integração via e-SUS.
      </p>
    </div>
  )
}

// ── PÁGINA PRINCIPAL ──────────────────────────────────────────────────────────

function APSUnificadaInner() {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  // ── Estado ──────────────────────────────────────────────────────────────────
  const tabFromUrl = (searchParams.get('tab') ?? 'geral') as string
  const validTab   = TABS.find(t => t.id === tabFromUrl && !t.disabled)?.id ?? 'geral'
  const [activeTab, setActiveTab] = useState<string>(validTab)

  const [municipio,    setMunicipio]    = useState<Municipio | null>(null)
  const [apsData,      setApsData]      = useState<ProducaoMensal[]>([])
  const [apsAnos,      setApsAnos]      = useState<number[]>([])
  const [anoSel,       setAnoSel]       = useState<number>(new Date().getFullYear())
  const [loadingAps,   setLoadingAps]   = useState(true)
  const [loadingMun,   setLoadingMun]   = useState(true)

  const [sisabSerie,   setSisabSerie]   = useState<SisabEvolucao[]>([])
  const [sisabStats,   setSisabStats]   = useState<SisabStats | null>(null)
  const [sisabMotivos, setSisabMotivos] = useState<SisabMotivoData | null>(null)
  const [loadingSisab, setLoadingSisab] = useState(true)

  const [benchmarks,   setBenchmarks]   = useState<Benchmarks | null>(null)

  // ── Carrega município ────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setLoadingMun(false); return }
      const res  = await fetch(`/api/admin/usuarios/${session.user.id}`)
      if (!res.ok) { setLoadingMun(false); return }
      const data = await res.json()
      const mun  = data?.municipios as { id: string; nome: string; codigo_ibge: string; uf?: string } | null
      if (!mun?.codigo_ibge) { setLoadingMun(false); return }
      setMunicipio({
        id:    mun.id,
        nome:  mun.nome,
        uf:    (mun as any).uf ?? '',
        ibge7: String(mun.codigo_ibge),
        ibge6: String(mun.codigo_ibge).slice(0, 6),
      })
      setLoadingMun(false)
    })
  }, [])

  // ── Carrega dados APS quando municipio ou ano muda ──────────────────────────
  const fetchAps = useCallback(async (mun: Municipio, ano: number) => {
    setLoadingAps(true)
    try {
      const res = await fetch(`/api/dashboard/producao-aps?municipio_id=${mun.id}&ano=${ano}`)
      if (res.ok) {
        const json = await res.json()
        setApsData(json.data ?? [])
        setApsAnos(json.anos ?? [])
        // Define ano padrão como o primeiro disponível
        if (json.anos?.length > 0 && ano === new Date().getFullYear() && !json.anos.includes(ano)) {
          setAnoSel(json.anos[0])
        }
      }
    } finally { setLoadingAps(false) }
  }, [])

  useEffect(() => {
    if (municipio) fetchAps(municipio, anoSel)
  }, [municipio, anoSel, fetchAps])

  // ── Carrega dados SISAB (independente do ano — a tela de validação usa seus próprios filtros) ──
  useEffect(() => {
    if (!municipio) return
    const ibge = municipio.ibge7
    setLoadingSisab(true)
    Promise.all([
      fetch(`/api/sisab/municipio/temporal?ibge=${ibge}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/sisab/municipio?ibge=${ibge}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/sisab/motivos_reprovacao`).then(r => r.ok ? r.json() : null),
    ]).then(([temporal, stats, motivos]) => {
      setSisabSerie(temporal?.serie ?? [])
      setSisabStats(stats ?? null)
      setSisabMotivos(motivos ?? null)
    }).finally(() => setLoadingSisab(false))
  }, [municipio])

  // ── Carrega benchmarks (uma vez) ─────────────────────────────────────────────
  useEffect(() => {
    if (!municipio) return
    fetch(`/api/aps/benchmarks?ibge=${municipio.ibge6}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setBenchmarks(d))
      .catch(() => {})
  }, [municipio])

  // ── Sincroniza tab com URL ───────────────────────────────────────────────────
  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tabId)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [router, pathname, searchParams])

  const goToValidacao = useCallback(() => handleTabChange('validacao'), [handleTabChange])

  // ── Derivados ────────────────────────────────────────────────────────────────
  const munNome = municipio?.nome ?? '...'
  const munUF   = municipio?.uf   ?? ''
  const loading = loadingMun || loadingAps

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .kpi-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow-sm); position: relative; overflow: hidden; }
        .kpi-card::after { content: ''; position: absolute; inset: 0; border-radius: 14px; background: linear-gradient(135deg, rgba(255,255,255,0.02), transparent); pointer-events: none; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              APS — Produção e Validação
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {munNome}{munUF ? ` · ${munUF}` : ''} · SISAB {anoSel}
            </p>
          </div>
          {/* Seletor de ano */}
          {apsAnos.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {apsAnos.map(a => (
                <button key={a} onClick={() => setAnoSel(a)} style={{
                  padding: '8px 16px', borderRadius: 20, border: '1px solid var(--border-input)',
                  background: anoSel === a ? 'var(--accent-subtle)' : 'transparent',
                  borderColor: anoSel === a ? 'var(--accent-border)' : 'var(--border-input)',
                  color: anoSel === a ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 13, fontWeight: anoSel === a ? 600 : 400,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                }}>{a}</button>
              ))}
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <TabNavigation tabs={TABS} activeTab={activeTab} onChange={handleTabChange} />
      </div>

      {/* Conteúdo das abas */}
      {loading ? (
        <Spinner msg="Carregando dados de produção..." />
      ) : !municipio ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Nenhum município ativo selecionado. Selecione um município no menu superior.</p>
        </div>
      ) : (
        <>
          {activeTab === 'geral' && (
            <AbaGeral
              anoSel={anoSel} municipio={municipio}
              apsData={apsData} sisabSerie={sisabSerie}
              sisabStats={sisabStats} benchmarks={benchmarks}
              onGoToValidacao={goToValidacao}
            />
          )}
          {activeTab === 'producao' && (
            <AbaProducao
              anoSel={anoSel} municipio={municipio}
              apsData={apsData} benchmarks={benchmarks}
            />
          )}
          {activeTab === 'validacao' && (
            loadingSisab ? <Spinner msg="Carregando dados SISAB..." /> :
            <AbaValidacao
              anoSel={anoSel} municipio={municipio}
              sisabSerie={sisabSerie} sisabStats={sisabStats}
              sisabMotivos={sisabMotivos}
            />
          )}
          {activeTab === 'indicadores' && <AbaIndicadores />}
        </>
      )}
    </div>
  )
}

export default function APSProducaoValidacaoPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px 0', textAlign: 'center' }}><div style={{ width: 36, height: 36, border: '3px solid rgba(16,185,129,0.2)', borderTop: '3px solid #10B981', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>}>
      <APSUnificadaInner />
    </Suspense>
  )
}
