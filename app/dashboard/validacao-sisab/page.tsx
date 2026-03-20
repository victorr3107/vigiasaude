'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  ComposedChart, LineChart, Line, BarChart, Bar, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, ReferenceDot, LabelList,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvolucaoItem {
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

interface MotivoItem {
  motivo: string
  fichas: number
  pct: number
}

interface MotivosReprovacao {
  total_reprovado: number
  por_motivo: MotivoItem[]
  evolucao_temporal: Array<Record<string, number | string>>
}

interface MunicipioCritico {
  ibge: string
  municipio: string
  uf: string
  total: number
  reprovado: number
  taxa_reprovacao: number
  taxa_aprovacao: number
  principal_motivo: string
  motivos: Record<string, number>
}

interface PendentesData {
  total_pendente: number
  ultima_competencia_com_pendentes: string | null
  por_uf: Array<{ uf: string; fichas: number; municipios: number; competencias: string[] }>
  por_municipio: Array<{ ibge: string; municipio: string; uf: string; fichas: number; competencias: string[] }>
}

interface UfItem {
  uf: string
  total: number
  aprovado: number
  reprovado: number
  duplicado: number
  nao_aplicado: number
  pendente: number
  taxa_aprovacao: number
  taxa_reprovacao: number
}

interface MunicipioStats {
  ibge: string
  municipio: string
  uf: string
  total: number
  aprovado: number
  reprovado: number
  duplicado: number
  nao_aplicado: number
  pendente: number
  outros: number
  taxa_aprovacao: number
  taxa_reprovacao: number
  principal_motivo: string | null
  motivos: Record<string, number> | null
  critico: {
    principal_motivo: string
    motivos: Record<string, number>
    rank_reprovacao: number
  } | null
  pendentes: { fichas: number; competencias: string[] } | null
}

interface MunicipioCtx {
  ibge: string
  uf: string
  nome: string
  munStats: MunicipioStats
}

// Série temporal de um município
interface SerieItem extends EvolucaoItem {}

interface Filtros {
  ano: number | null        // null = todos os anos
  competencia: string | null // null = acumulado do período
  comparar: boolean
}

// ── SelectCustom ──────────────────────────────────────────────────────────────

function SelectOption({
  opt, isSelected, onClick,
}: {
  opt: { value: string; label: string }
  isSelected: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '8px 14px', fontSize: 13, cursor: 'pointer',
        background: isSelected
          ? 'var(--accent-subtle)'
          : hovered
            ? 'rgba(255,255,255,0.09)'
            : 'var(--bg-modal)',
        color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
        fontWeight: isSelected ? 600 : 400,
        border: 'none', outline: 'none',
      }}
    >
      {opt.label}
    </button>
  )
}

function SelectCustom({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = options.find(o => o.value === value)
  const label = selected?.label ?? placeholder ?? '—'

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 160 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px', borderRadius: 8, minHeight: 44, cursor: 'pointer',
          border: '1px solid var(--border-input)',
          background: 'var(--bg-input)', color: 'var(--text-primary)',
          fontSize: 13, textAlign: 'left', gap: 10,
          outline: 'none',
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 9999,
          minWidth: '100%',
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-strong)',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          padding: '4px 0', maxHeight: 280, overflowY: 'auto',
        }}>
          {options.map(o => (
            <SelectOption
              key={o.value}
              opt={o}
              isSelected={o.value === value}
              onClick={() => { onChange(o.value); setOpen(false) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString('pt-BR') }
function fmtM(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace('.', ',')}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.', ',')}K`
  return n.toString()
}

function labelComp(comp: string) {
  const [ano, mes] = comp.split('-')
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${meses[(parseInt(mes) - 1) % 12]}/${ano.slice(2)}`
}

function taxaEfetiva(aprovado: number, total: number, nao_aplicado: number, duplicado: number) {
  const base = total - nao_aplicado - duplicado
  if (base <= 0) return 0
  return (aprovado / base) * 100
}

function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => { load() }, [load])
  return { data, loading, error }
}

// ── Cores ─────────────────────────────────────────────────────────────────────

const COR_APROVADO  = 'var(--chart-green)'
const COR_REPROVADO = 'var(--danger)'
const COR_PENDENTE  = 'var(--chart-blue)'
const COR_INUTIL    = 'var(--chart-slate)'

const CORES_MOTIVO: Record<string, string> = {
  PROF:       'var(--danger)',
  CNES:       'var(--chart-amber)',
  INE:        'var(--chart-blue)',
  CBO:        'var(--chart-purple)',
  'MÚLTIPLOS':'var(--chart-indigo)',
  OUTROS:     'var(--chart-slate)',
}

const MOTIVO_CAUSA: Record<string, string> = {
  PROF:       'Profissional não vinculado no CNES',
  CNES:       'Unidade inativa ou incorreta no CNES',
  INE:        'Identificador Nacional de Equipe inválido',
  CBO:        'CBO incompatível com o tipo de ficha',
  'MÚLTIPLOS':'Múltiplos problemas cadastrais simultâneos',
  OUTROS:     'Outros erros de validação',
}

const MOTIVO_ACAO: Record<string, string> = {
  PROF:       'Atualize os vínculos profissionais no CNES antes do fechamento da competência',
  CNES:       'Verifique se a unidade está ativa e corretamente cadastrada no CNES',
  INE:        'Confira o Identificador Nacional de Equipe no cadastro da equipe',
  CBO:        'Verifique se o CBO do profissional é compatível com o tipo de ficha',
  'MÚLTIPLOS':'Múltiplos problemas cadastrais — acione a gestão do CNES',
  OUTROS:     'Verifique os detalhes no relatório de validação do SISAB',
}

// ── Componentes base ───────────────────────────────────────────────────────────

function CardShell({ title, sub, badge, children }: {
  title: string; sub?: string; badge?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="kpi-card" style={{ padding: '20px 24px' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{
            margin: 0, fontSize: 15, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.01em',
          }}>{title}</h3>
          {sub && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{sub}</p>}
        </div>
        {badge}
      </div>
      {children}
    </div>
  )
}

function Spinner() {
  return <div style={{ padding: '40px 0', textAlign: 'center' }}><div className="spinner" /></div>
}

function ErroMsg({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '16px', borderRadius: 8, background: 'var(--danger-subtle)', color: 'var(--danger)', fontSize: 13 }}>
      {msg}
    </div>
  )
}

function ScopeBadge({ ctx }: { ctx: MunicipioCtx | null }) {
  const text = ctx ? `${ctx.nome} — ${ctx.uf}` : 'Brasil'
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: 'var(--accent)',
      background: 'var(--accent-subtle)', borderRadius: 20,
      padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {text}
    </span>
  )
}

// ── Filtros globais ────────────────────────────────────────────────────────────

function FiltrosGlobais({
  evolucao,
  filtros,
  onChange,
}: {
  evolucao: EvolucaoItem[] | null
  filtros: Filtros
  onChange: (f: Partial<Filtros>) => void
}) {
  const anos = useMemo(() => {
    if (!evolucao) return []
    return [...new Set(evolucao.map(e => parseInt(e.competencia.split('-')[0])))].sort()
  }, [evolucao])

  const competencias = useMemo(() => {
    if (!evolucao) return []
    const lista = filtros.ano
      ? evolucao.filter(e => parseInt(e.competencia.split('-')[0]) === filtros.ano)
      : evolucao
    return lista.map(e => e.competencia)
  }, [evolucao, filtros.ano])

  return (
    <div style={{
      display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
      padding: '14px 18px', borderRadius: 10,
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      marginBottom: 24,
    }}>
      {/* Ano */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Ano
        </label>
        <SelectCustom
          value={filtros.ano != null ? String(filtros.ano) : ''}
          onChange={v => {
            const ano = v ? parseInt(v) : null
            onChange({ ano, competencia: null })
          }}
          placeholder="Todos os anos"
          options={[
            { value: '', label: 'Todos os anos' },
            ...anos.map(a => ({ value: String(a), label: String(a) })),
          ]}
        />
      </div>

      {/* Competência */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Competência
        </label>
        <SelectCustom
          value={filtros.competencia ?? ''}
          onChange={v => onChange({ competencia: v || null })}
          placeholder="Acumulado do período"
          options={[
            { value: '', label: 'Acumulado do período' },
            ...competencias.map(c => ({ value: c, label: labelComp(c) })),
          ]}
        />
      </div>

      {/* Comparar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Comparação
        </label>
        <button
          onClick={() => onChange({ comparar: !filtros.comparar })}
          style={{
            padding: '8px 14px', borderRadius: 8, minHeight: 44, cursor: 'pointer',
            border: `1px solid ${filtros.comparar ? 'var(--accent)' : 'var(--border-input)'}`,
            background: filtros.comparar ? 'var(--accent-subtle)' : 'var(--bg-input)',
            color: filtros.comparar ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: 13, fontWeight: filtros.comparar ? 600 : 400,
          }}
        >
          {filtros.comparar ? '▲▼ Ativo' : 'Comparar período anterior'}
        </button>
      </div>

      {/* Reset */}
      {(filtros.ano || filtros.competencia || filtros.comparar) && (
        <button
          onClick={() => onChange({ ano: null, competencia: null, comparar: false })}
          style={{
            padding: '8px 12px', borderRadius: 8, minHeight: 44, cursor: 'pointer',
            border: '1px solid var(--border-subtle)',
            background: 'transparent', color: 'var(--text-muted)', fontSize: 12,
            alignSelf: 'flex-end',
          }}
        >
          Limpar filtros
        </button>
      )}
    </div>
  )
}

// ── KPIs do topo ───────────────────────────────────────────────────────────────

function KpiCard({
  label, sublabel, value, valueColor, badge, delta, nota,
}: {
  label: string
  sublabel?: string
  value: string
  valueColor?: string
  badge?: React.ReactNode
  delta?: { pct: number; label: string } | null
  nota?: string
}) {
  return (
    <div className="kpi-card" style={{ padding: '18px 20px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        fontSize: 'clamp(22px, 3.5vw, 32px)', fontWeight: 800,
        color: valueColor ?? 'var(--text-primary)', lineHeight: 1.1,
      }}>
        {value}
      </div>
      {sublabel && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sublabel}</div>
      )}
      {badge && <div style={{ marginTop: 8 }}>{badge}</div>}
      {delta !== null && delta !== undefined && (
        <div style={{
          marginTop: 8, fontSize: 12, fontWeight: 600,
          color: delta.pct >= 0 ? 'var(--success)' : 'var(--danger)',
        }}>
          {delta.pct >= 0 ? '▲' : '▼'} {Math.abs(delta.pct).toFixed(1)}% {delta.label}
        </div>
      )}
      {nota && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>{nota}</div>
      )}
    </div>
  )
}

function ClassBadge({ taxa }: { taxa: number }) {
  const { label, color, bg } = taxa >= 98
    ? { label: 'Excelente', color: 'var(--success)', bg: 'var(--success-subtle)' }
    : taxa >= 95
      ? { label: 'Bom', color: 'var(--chart-blue)', bg: 'var(--info-subtle)' }
      : taxa >= 90
        ? { label: 'Atenção', color: 'var(--chart-amber)', bg: 'rgba(245,158,11,0.1)' }
        : { label: 'Crítico', color: 'var(--danger)', bg: 'var(--danger-subtle)' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color, background: bg,
      borderRadius: 20, padding: '3px 10px',
    }}>
      {label}
    </span>
  )
}

function RiscoBadge({ taxa }: { taxa: number }) {
  const { label, cor } = taxa > 30
    ? { label: 'CRÍTICO', cor: 'var(--danger)' }
    : taxa > 15
      ? { label: 'ALERTA', cor: 'var(--chart-amber)' }
      : taxa > 5
        ? { label: 'ATENÇÃO', cor: 'var(--chart-indigo)' }
        : { label: 'OK', cor: 'var(--success)' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: cor,
      border: `1px solid ${cor}`, borderRadius: 4, padding: '2px 7px',
    }}>
      {label}
    </span>
  )
}

interface KpisTopoProps {
  ctx: MunicipioCtx | null
  evolucao: EvolucaoItem[] | null
  serie: SerieItem[] | null
  filtros: Filtros
}

function KpisTopo({ ctx, evolucao, serie, filtros }: KpisTopoProps) {
  // Escolhe a fonte de dados conforme escopo e filtros
  const stats = useMemo(() => {
    const dados = ctx ? serie : evolucao
    if (!dados) return null

    if (filtros.competencia) {
      const e = dados.find(d => d.competencia === filtros.competencia)
      return e ?? null
    }
    if (filtros.ano) {
      const slice = dados.filter(d => d.competencia.startsWith(String(filtros.ano)))
      if (!slice.length) return null
      return slice.reduce((acc, e) => ({
        competencia: `${filtros.ano}-acum`,
        total: acc.total + e.total,
        aprovado: acc.aprovado + e.aprovado,
        reprovado: acc.reprovado + e.reprovado,
        duplicado: acc.duplicado + e.duplicado,
        nao_aplicado: acc.nao_aplicado + e.nao_aplicado,
        pendente: acc.pendente + e.pendente,
        taxa_aprovacao: 0,
        taxa_reprovacao: 0,
      }))
    }
    // Acumulado total
    if (ctx && ctx.munStats) {
      return {
        competencia: 'total',
        total: ctx.munStats.total,
        aprovado: ctx.munStats.aprovado,
        reprovado: ctx.munStats.reprovado,
        duplicado: ctx.munStats.duplicado,
        nao_aplicado: ctx.munStats.nao_aplicado,
        pendente: ctx.munStats.pendente,
        taxa_aprovacao: ctx.munStats.taxa_aprovacao,
        taxa_reprovacao: ctx.munStats.taxa_reprovacao,
      }
    }
    const total = dados.reduce((acc, e) => acc + e.total, 0)
    const aprovado = dados.reduce((acc, e) => acc + e.aprovado, 0)
    const reprovado = dados.reduce((acc, e) => acc + e.reprovado, 0)
    const nao_aplicado = dados.reduce((acc, e) => acc + e.nao_aplicado, 0)
    const pendente = dados.reduce((acc, e) => acc + e.pendente, 0)
    const duplicado = dados.reduce((acc, e) => acc + e.duplicado, 0)
    return { competencia: 'total', total, aprovado, reprovado, duplicado, nao_aplicado, pendente, taxa_aprovacao: 0, taxa_reprovacao: 0 }
  }, [ctx, evolucao, serie, filtros])

  // Período de comparação
  const statsAnterior = useMemo(() => {
    if (!filtros.comparar || !filtros.competencia) return null
    const dados = ctx ? serie : evolucao
    if (!dados) return null
    const idx = dados.findIndex(d => d.competencia === filtros.competencia)
    if (idx <= 0) return null
    return dados[idx - 1]
  }, [filtros, ctx, evolucao, serie])

  if (!stats) return null

  const taxaEf = taxaEfetiva(stats.aprovado, stats.total, stats.nao_aplicado, stats.duplicado)
  const taxaEfAnterior = statsAnterior
    ? taxaEfetiva(statsAnterior.aprovado, statsAnterior.total, statsAnterior.nao_aplicado, statsAnterior.duplicado)
    : null

  const motivoPrincipal = ctx?.munStats.principal_motivo ?? null
  const motivos = ctx?.munStats.motivos
  let motivoBadge: React.ReactNode = null
  if (motivoPrincipal && motivos) {
    const totalReprov = Object.values(motivos).reduce((s, v) => s + v, 0) || 1
    const pctMotivo = ((motivos[motivoPrincipal] ?? 0) / totalReprov * 100).toFixed(0)
    motivoBadge = (
      <span style={{
        fontSize: 11, fontWeight: 700,
        color: CORES_MOTIVO[motivoPrincipal] ?? 'var(--chart-slate)',
        background: 'var(--bg-surface-2)',
        borderRadius: 4, padding: '2px 7px',
      }}>
        {motivoPrincipal}: {pctMotivo}%
      </span>
    )
  }

  const deltaTaxa = taxaEfAnterior !== null
    ? { pct: taxaEf - taxaEfAnterior, label: `vs ${labelComp(statsAnterior!.competencia)}` }
    : null

  const deltaTotal = statsAnterior
    ? { pct: ((stats.total - statsAnterior.total) / statsAnterior.total) * 100, label: `vs ${labelComp(statsAnterior.competencia)}` }
    : null

  const deltaReprov = statsAnterior
    ? { pct: ((stats.reprovado - statsAnterior.reprovado) / (statsAnterior.reprovado || 1)) * 100, label: `vs ${labelComp(statsAnterior.competencia)}` }
    : null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: 16, marginBottom: 24,
    }}>
      <KpiCard
        label="Total de fichas"
        sublabel="fichas enviadas ao SISAB"
        value={fmtM(stats.total)}
        delta={filtros.comparar ? deltaTotal : null}
      />
      <KpiCard
        label="Taxa de aprovação efetiva"
        sublabel="sobre fichas contabilizáveis"
        value={`${taxaEf.toFixed(2).replace('.', ',')}%`}
        valueColor={taxaEf >= 98 ? 'var(--success)' : taxaEf >= 95 ? 'var(--chart-blue)' : taxaEf >= 90 ? 'var(--chart-amber)' : 'var(--danger)'}
        badge={<ClassBadge taxa={taxaEf} />}
        delta={filtros.comparar ? deltaTaxa : null}
      />
      <KpiCard
        label="Fichas reprovadas"
        sublabel={`${stats.reprovado > 0 ? ((stats.reprovado / (stats.total - stats.nao_aplicado - stats.duplicado || 1)) * 100).toFixed(2).replace('.', ',') : '0,00'}% da base contabilizável`}
        value={fmtM(stats.reprovado)}
        valueColor={stats.reprovado > 0 ? 'var(--chart-amber)' : 'var(--text-primary)'}
        badge={motivoBadge}
        delta={filtros.comparar ? deltaReprov : null}
      />
      <KpiCard
        label="Fichas em processamento"
        sublabel="aguardando validação do SISAB"
        value={fmtM(stats.pendente)}
        valueColor={stats.pendente > 0 ? 'var(--chart-blue)' : 'var(--text-muted)'}
        nota={stats.pendente === 0 ? 'Toda a produção já foi processada' : undefined}
      />
    </div>
  )
}

// ── Resumo Executivo dinâmico ──────────────────────────────────────────────────

function ResumoExecutivo({
  ctx, evolucao, serie, filtros,
}: {
  ctx: MunicipioCtx | null
  evolucao: EvolucaoItem[] | null
  serie: SerieItem[] | null
  filtros: Filtros
}) {
  const escopo = ctx ? `${ctx.nome} (${ctx.uf})` : 'o Brasil'
  const dados = ctx ? serie : evolucao
  if (!dados || dados.length === 0) return null

  // Determina o período de referência
  let compRef: EvolucaoItem | null = null
  let compAnterior: EvolucaoItem | null = null

  if (filtros.competencia) {
    compRef = dados.find(d => d.competencia === filtros.competencia) ?? null
    const idx = dados.findIndex(d => d.competencia === filtros.competencia)
    if (idx > 0) compAnterior = dados[idx - 1]
  } else {
    compRef = dados[dados.length - 1]
    if (dados.length > 1) compAnterior = dados[dados.length - 2]
  }

  if (!compRef) return null

  const taxaEf = taxaEfetiva(compRef.aprovado, compRef.total, compRef.nao_aplicado, compRef.duplicado)
  const taxaEfAnterior = compAnterior
    ? taxaEfetiva(compAnterior.aprovado, compRef.total, compAnterior.nao_aplicado, compAnterior.duplicado)
    : null

  const periodo = filtros.competencia ? labelComp(filtros.competencia) : `${labelComp(compRef.competencia)} (mais recente)`

  const motivoPrincipal = ctx?.munStats.principal_motivo
  const motivos = ctx?.munStats.motivos
  let motivoTexto = ''
  if (motivoPrincipal && motivos) {
    const totalReprov = Object.values(motivos).reduce((s, v) => s + v, 0) || 1
    const pct = ((motivos[motivoPrincipal] ?? 0) / totalReprov * 100).toFixed(0)
    motivoTexto = ` — ${motivoPrincipal} foi responsável por ${pct}% dessas reprovações`
  }

  let comparacaoTexto = ''
  if (filtros.comparar && taxaEfAnterior !== null && compAnterior) {
    const delta = taxaEf - taxaEfAnterior
    const sentido = delta >= 0.05 ? 'melhorou' : delta <= -0.05 ? 'piorou' : 'manteve-se estável'
    comparacaoTexto = ` A taxa de aprovação ${sentido} ${Math.abs(delta).toFixed(2)} p.p. em relação a ${labelComp(compAnterior.competencia)}.`
  }

  return (
    <div style={{
      padding: '16px 20px', borderRadius: 10,
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      marginBottom: 24, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)',
    }}>
      Em <strong>{periodo}</strong>, <strong>{escopo}</strong> enviou{' '}
      <strong>{fmtM(compRef.total)}</strong> fichas ao SISAB.{' '}
      <strong style={{ color: 'var(--success)' }}>{taxaEf.toFixed(2).replace('.', ',')}%</strong>{' '}
      foram aprovadas e contarão para os indicadores do Previne Brasil.{' '}
      {compRef.reprovado > 0 && (
        <>
          <strong style={{ color: 'var(--chart-amber)' }}>{fmtM(compRef.reprovado)}</strong>{' '}
          fichas foram reprovadas{motivoTexto}.{' '}
        </>
      )}
      {compRef.reprovado === 0 && 'Nenhuma ficha foi reprovada neste período. '}
      {comparacaoTexto && <em>{comparacaoTexto}</em>}
    </div>
  )
}

// ── 1. Evolução Temporal ───────────────────────────────────────────────────────

interface EvolucaoTemporalProps {
  ctx: MunicipioCtx | null
  evolucao: EvolucaoItem[] | null
  serie: SerieItem[] | null
  porUf: UfItem[] | null
  filtros: Filtros
  onSelectComp: (comp: string) => void
}

function EvolucaoTemporal({ ctx, evolucao, serie, porUf, filtros, onSelectComp }: EvolucaoTemporalProps) {
  // Dados da série principal (município ou nacional)
  const dadosPrincipais = useMemo(() => {
    const fonte = ctx ? serie : evolucao
    if (!fonte) return []
    let slice = filtros.ano
      ? fonte.filter(d => d.competencia.startsWith(String(filtros.ano)))
      : fonte
    return slice.map(d => ({
      label: labelComp(d.competencia),
      comp: d.competencia,
      taxa: parseFloat(taxaEfetiva(d.aprovado, d.total, d.nao_aplicado, d.duplicado).toFixed(2)),
      taxa_reprov: parseFloat(d.taxa_reprovacao.toFixed(2)),
      volume: Math.round(d.total / 1000),
    }))
  }, [ctx, evolucao, serie, filtros.ano])

  // Linha de referência UF (apenas quando há município)
  const mediaUf = useMemo(() => {
    if (!ctx || !porUf) return null
    const ufData = porUf.find(u => u.uf === ctx.uf)
    if (!ufData) return null
    return taxaEfetiva(ufData.aprovado, ufData.total, ufData.nao_aplicado, ufData.duplicado)
  }, [ctx, porUf])

  if (dadosPrincipais.length === 0) return null

  // Identifica melhor e pior ponto
  const maxTaxa = Math.max(...dadosPrincipais.map(d => d.taxa))
  const minTaxa = Math.min(...dadosPrincipais.map(d => d.taxa))
  const pontoMelhor = dadosPrincipais.find(d => d.taxa === maxTaxa)
  const pontoPior  = dadosPrincipais.find(d => d.taxa === minTaxa)

  // Tendência últimos 3 pontos
  const ult3 = dadosPrincipais.slice(-3)
  const tendencia = ult3.length >= 2
    ? (ult3[ult3.length - 1].taxa - ult3[0].taxa > 0.3 ? '↗ melhora'
      : ult3[ult3.length - 1].taxa - ult3[0].taxa < -0.3 ? '↘ piora'
      : '→ estável')
    : null

  // Narrativa dinâmica
  const ultimoPonto = dadosPrincipais[dadosPrincipais.length - 1]
  const escopo = ctx ? ctx.nome : 'Brasil'
  let narrativa = ''
  if (ultimoPonto) {
    narrativa = `Em ${labelComp(ultimoPonto.comp)}, ${escopo} apresentou taxa de aprovação efetiva de ${ultimoPonto.taxa.toFixed(2).replace('.', ',')}%.`
    if (mediaUf !== null) {
      const diff = ultimoPonto.taxa - mediaUf
      narrativa += ` Isso é ${Math.abs(diff).toFixed(2)} p.p. ${diff >= 0 ? 'acima' : 'abaixo'} da média estadual (${mediaUf.toFixed(2).replace('.', ',')}%).`
    }
    if (tendencia) {
      const tendMsg = tendencia.includes('melhora') ? 'de melhora' : tendencia.includes('piora') ? 'de piora' : 'estável'
      narrativa += ` A tendência dos últimos ${ult3.length} meses é ${tendMsg}.`
    }
  }

  const sub = ctx
    ? `${ctx.nome} — ${ctx.uf} | linha tracejada = média estadual`
    : `Nacional${filtros.ano ? ` — ${filtros.ano}` : ' — 2024–2026'}`

  return (
    <CardShell
      title="Evolução da Taxa de Aprovação"
      sub={sub}
      badge={tendencia ? (
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          background: tendencia.includes('melhora') ? 'var(--success-subtle)'
            : tendencia.includes('piora') ? 'var(--danger-subtle)' : 'var(--bg-surface-2)',
          color: tendencia.includes('melhora') ? 'var(--success)'
            : tendencia.includes('piora') ? 'var(--danger)' : 'var(--text-muted)',
        }}>
          {tendencia}
        </span>
      ) : undefined}
    >
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={dadosPrincipais}
          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
          onClick={(e: Record<string, unknown> | null) => {
            const payload = (e as { activePayload?: Array<{ payload?: { comp?: string } }> } | null)
            if (payload?.activePayload?.[0]?.payload?.comp) onSelectComp(payload.activePayload[0].payload.comp)
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis
            yAxisId="taxa"
            domain={['auto', 'auto']}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false} axisLine={false}
            tickFormatter={v => `${v}%`}
            width={40}
          />
          <YAxis
            yAxisId="vol"
            orientation="right"
            tick={{ fontSize: 9, fill: 'var(--chart-slate)' }}
            tickLine={false} axisLine={false}
            tickFormatter={v => `${v}K`}
            width={36}
          />
          <Tooltip
            labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
            contentStyle={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }}
            formatter={(v: unknown, name: unknown) => {
              const n = String(name)
              if (n === 'volume') return [`${fmt(Number(v) * 1000)} fichas`, 'Volume'] as [string, string]
              if (n === 'taxa') return [`${Number(v).toFixed(2).replace('.', ',')}%`, 'Aprovação efetiva'] as [string, string]
              if (n === 'taxa_reprov') return [`${Number(v).toFixed(2).replace('.', ',')}%`, 'Reprovação'] as [string, string]
              return [`${v}`, n] as [string, string]
            }}
            labelFormatter={l => `Competência: ${l} (clique para filtrar)`}
          />
          {/* Volume como área/barra de fundo */}
          <Bar yAxisId="vol" dataKey="volume" fill="var(--chart-slate)" opacity={0.18} radius={[2, 2, 0, 0]} name="volume" />
          {/* Linha principal de aprovação */}
          <Line
            yAxisId="taxa" type="monotone" dataKey="taxa" name="taxa"
            stroke={COR_APROVADO} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }}
          />
          {/* Linha de reprovação */}
          <Line
            yAxisId="taxa" type="monotone" dataKey="taxa_reprov" name="taxa_reprov"
            stroke={COR_REPROVADO} strokeWidth={1.5} dot={false} strokeDasharray="4 2"
          />
          {/* Linha tracejada da média da UF */}
          {mediaUf !== null && (
            <ReferenceDot
              yAxisId="taxa" x={dadosPrincipais[Math.floor(dadosPrincipais.length / 2)]?.label}
              y={mediaUf} r={0}
              label={{ value: `Média ${ctx?.uf}: ${mediaUf.toFixed(1)}%`, position: 'top', fontSize: 10, fill: 'var(--chart-amber)' }}
            />
          )}
          {/* Marcadores de melhor/pior */}
          {pontoMelhor && (
            <ReferenceDot
              yAxisId="taxa" x={pontoMelhor.label} y={pontoMelhor.taxa} r={6}
              fill="var(--success)" stroke="none"
              label={{ value: '★', position: 'top', fontSize: 12 }}
            />
          )}
          {pontoPior && pontoMelhor && pontoPior.label !== pontoMelhor.label && (
            <ReferenceDot
              yAxisId="taxa" x={pontoPior.label} y={pontoPior.taxa} r={6}
              fill="var(--danger)" stroke="none"
              label={{ value: '⚠', position: 'bottom', fontSize: 12 }}
            />
          )}
          <Legend
            formatter={(v) => v === 'taxa' ? 'Aprovação (%)' : v === 'taxa_reprov' ? 'Reprovação (%)' : 'Volume (K)'}
            iconType="line" wrapperStyle={{ fontSize: 11 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {narrativa && (
        <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, fontStyle: 'italic' }}>
          {narrativa}
        </p>
      )}
    </CardShell>
  )
}

// ── 2. Motivos de Reprovação ───────────────────────────────────────────────────

function MotivosReprovacao({ ctx }: { ctx: MunicipioCtx | null }) {
  const { data, loading, error } = useFetch<MotivosReprovacao>('/api/sisab/motivos_reprovacao')
  const [aba, setAba] = useState<'total' | 'temporal' | 'guia'>('total')

  // Com município: usa motivos do município
  const motivos = ctx?.munStats.motivos

  const barData = useMemo(() => {
    if (ctx && motivos) {
      const totalMun = Object.values(motivos).reduce((s, v) => s + v, 0) || 1
      return Object.entries(motivos)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([motivo, fichas]) => ({
          motivo,
          fichas,
          pct: parseFloat((fichas / totalMun * 100).toFixed(1)),
          color: CORES_MOTIVO[motivo] ?? 'var(--chart-slate)',
        }))
    }
    return data?.por_motivo
      .filter(m => m.fichas > 0)
      .sort((a, b) => b.fichas - a.fichas)
      .map(m => ({ ...m, color: CORES_MOTIVO[m.motivo] ?? 'var(--chart-slate)' })) ?? []
  }, [ctx, motivos, data])

  const evolData = data?.evolucao_temporal.map(e => ({
    ...e,
    label: labelComp(e.competencia as string),
  })) ?? []

  const motivosComDados = data?.por_motivo.filter(m => m.fichas > 0).map(m => m.motivo) ?? []
  const profPct = barData.find(m => m.motivo === 'PROF')?.pct ?? 0

  const sub = ctx
    ? `${ctx.nome} — ${ctx.uf}`
    : data ? `${fmtM(data.total_reprovado)} fichas reprovadas — dados nacionais` : ''

  return (
    <CardShell title="Motivos de Reprovação" sub={sub}>
      {loading && !ctx && <Spinner />}
      {error && <ErroMsg msg={error} />}
      {(data || ctx) && (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {(['total', 'temporal', 'guia'] as const).map(t => (
              <button
                key={t}
                onClick={() => setAba(t)}
                style={{
                  padding: '6px 14px', borderRadius: 6, minHeight: 32, cursor: 'pointer',
                  border: '1px solid var(--border-subtle)',
                  background: aba === t ? 'var(--accent)' : 'transparent',
                  color: aba === t ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                  fontSize: 12, fontWeight: aba === t ? 600 : 400,
                }}
                aria-pressed={aba === t}
              >
                {t === 'total' ? 'Distribuição' : t === 'temporal' ? 'Evolução mensal' : 'O que fazer'}
              </button>
            ))}
          </div>

          {aba === 'total' && (
            <>
              {profPct > 0 && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--danger-subtle)',
                  borderLeft: '3px solid var(--danger)',
                  fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14,
                }}>
                  <strong>PROF</strong> é a causa de{' '}
                  <strong>{Math.round(profPct / 10)} em cada 10</strong>{' '}
                  reprovações em {ctx ? ctx.nome : 'âmbito nacional'}.
                  Indica profissional sem vínculo ativo no CNES.
                </div>
              )}
              <ResponsiveContainer width="100%" height={Math.max(180, barData.length * 36)}>
                <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 70, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={fmtM} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="motivo" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} width={72} />
                  <Tooltip
                    labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }} itemStyle={{ color: 'var(--text-secondary)' }} contentStyle={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: unknown, _n: unknown, p: { payload?: { pct?: number } }) => [`${fmtM(Number(v))} (${p.payload?.pct ?? 0}%)`, 'Fichas reprovadas'] as [string, string]}
                  />
                  <Bar dataKey="fichas" radius={[0, 4, 4, 0]}>
                    <LabelList
                      dataKey="pct"
                      position="right"
                      formatter={(v: unknown) => `${v}%`}
                      style={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                    />
                    {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}

          {aba === 'temporal' && (
            <>
              {ctx && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                  Evolução de motivos disponível apenas em escopo nacional. Dados do município correspondem ao acumulado total.
                </p>
              )}
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={evolData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={fmtM} width={44} />
                  <Tooltip
                    labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }} itemStyle={{ color: 'var(--text-secondary)' }} contentStyle={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: unknown) => [fmtM(Number(v)), '']}
                  />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
                  {motivosComDados.map(m => (
                    <Bar key={m} dataKey={m} name={m} stackId="a"
                      fill={CORES_MOTIVO[m] ?? 'var(--chart-slate)'}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </>
          )}

          {aba === 'guia' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-subtle)' }}>
                    {['Motivo', 'Fichas', 'O que causa', 'Como resolver'].map(h => (
                      <th key={h} style={{
                        padding: '8px 10px', textAlign: 'left',
                        color: 'var(--text-muted)', fontWeight: 600, fontSize: 11,
                        textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {barData.map(m => (
                    <tr key={m.motivo} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px', fontWeight: 700 }}>
                        <span style={{
                          color: CORES_MOTIVO[m.motivo] ?? 'var(--chart-slate)',
                          background: 'var(--bg-surface-2)',
                          borderRadius: 4, padding: '2px 8px',
                        }}>
                          {m.motivo}
                        </span>
                      </td>
                      <td style={{ padding: '10px', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {fmtM(m.fichas)} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>({m.pct}%)</span>
                      </td>
                      <td style={{ padding: '10px', color: 'var(--text-secondary)', maxWidth: 200 }}>
                        {MOTIVO_CAUSA[m.motivo] ?? '—'}
                      </td>
                      <td style={{ padding: '10px', color: 'var(--text-secondary)', maxWidth: 260 }}>
                        {MOTIVO_ACAO[m.motivo] ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </CardShell>
  )
}

// ── 3. Municípios ─────────────────────────────────────────────────────────────

function MunicipiosCard({ ctx }: { ctx: MunicipioCtx | null }) {
  const { data: todos, loading, error } = useFetch<MunicipioCritico[]>('/api/sisab/municipios_criticos')
  const { data: porUf } = useFetch<UfItem[]>('/api/sisab/por_uf')
  const [pagina, setPagina] = useState(1)
  const [filtroRisco, setFiltroRisco] = useState<'todos' | 'critico' | 'alerta'>('todos')
  const POR_PAG = 12

  // ── VISÃO MUNICÍPIO ────────────────────────────────────────────────────────
  if (ctx) {
    const mun = ctx.munStats
    const taxaReprov = mun.taxa_reprovacao
    const taxaEf = taxaEfetiva(mun.aprovado, mun.total, mun.nao_aplicado, mun.duplicado)

    // Posição no ranking da UF
    const listaSp = todos?.filter(m => m.uf === ctx.uf) ?? []
    const rankUf = listaSp.findIndex(m => m.ibge === ctx.ibge)
    const rankLabel = rankUf >= 0
      ? `${rankUf + 1}º lugar entre ${listaSp.length} municípios de ${ctx.uf} em volume de reprovação`
      : `${ctx.nome} não está entre os 100 municípios com maior reprovação em ${ctx.uf}`

    // Médias UF e nacional
    const ufData = porUf?.find(u => u.uf === ctx.uf)
    const mediaUf = ufData
      ? taxaEfetiva(ufData.aprovado, ufData.total, ufData.nao_aplicado, ufData.duplicado)
      : null
    const mediaNacional = porUf
      ? taxaEfetiva(
          porUf.reduce((s, u) => s + u.aprovado, 0),
          porUf.reduce((s, u) => s + u.total, 0),
          porUf.reduce((s, u) => s + u.nao_aplicado, 0),
          porUf.reduce((s, u) => s + u.duplicado, 0),
        )
      : null

    const comparativos = [
      { label: ctx.nome, taxa: taxaEf, reprovPct: taxaReprov, cor: 'var(--accent)' },
      ...(mediaUf !== null ? [{ label: `Média ${ctx.uf}`, taxa: mediaUf, reprovPct: null, cor: 'var(--chart-amber)' }] : []),
      ...(mediaNacional !== null ? [{ label: 'Média Brasil', taxa: mediaNacional, reprovPct: null, cor: 'var(--chart-slate)' }] : []),
    ]

    return (
      <CardShell
        title="Posição no Ranking"
        sub={`${ctx.nome} — ${ctx.uf}`}
        badge={<RiscoBadge taxa={taxaReprov} />}
      >
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 0, marginBottom: 16 }}>
          {rankLabel}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {comparativos.map(c => (
            <div key={c.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: c.label === ctx.nome ? 700 : 400 }}>
                  {c.label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: c.cor }}>
                  {c.taxa.toFixed(2).replace('.', ',')}%
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-surface-2)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${Math.min(100, c.taxa)}%`,
                  background: c.cor, borderRadius: 4,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
        {mun.critico && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8,
            background: 'var(--danger-subtle)', borderLeft: '3px solid var(--danger)',
            fontSize: 12, color: 'var(--text-secondary)',
          }}>
            {ctx.nome} está entre os 100 municípios com maior volume de reprovação nacional
            (#{mun.critico.rank_reprovacao}). Principal motivo:{' '}
            <strong>{String(mun.critico.principal_motivo)}</strong>.
          </div>
        )}
      </CardShell>
    )
  }

  // ── VISÃO NACIONAL / UF ────────────────────────────────────────────────────
  const lista = useMemo(() => {
    if (!todos) return []
    const base = todos.filter(m => m.total >= 100)
    const filtrado = filtroRisco === 'critico'
      ? base.filter(m => m.taxa_reprovacao > 30)
      : filtroRisco === 'alerta'
        ? base.filter(m => m.taxa_reprovacao > 15 && m.taxa_reprovacao <= 30)
        : base.filter(m => m.taxa_reprovacao > 5)
    return filtrado
  }, [todos, filtroRisco])

  const totalPags = Math.max(1, Math.ceil(lista.length / POR_PAG))
  const pagAtual = Math.min(pagina, totalPags)
  const visiveis = lista.slice((pagAtual - 1) * POR_PAG, pagAtual * POR_PAG)

  return (
    <CardShell
      title="Municípios com Alto Volume de Reprovação"
      sub="Municípios com taxa de reprovação > 5% e mínimo 100 fichas"
    >
      {loading && <Spinner />}
      {error && <ErroMsg msg={error} />}
      {!loading && !error && todos && (
        <>
          <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: 'var(--bg-surface-2)',
            borderLeft: '3px solid var(--chart-amber)',
            fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16,
          }}>
            Estes municípios têm produção real que <strong>não conta para o Previne Brasil</strong> por estar reprovada.
          </div>

          {/* Filtros de risco */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {(['todos', 'critico', 'alerta'] as const).map(f => (
              <button
                key={f}
                onClick={() => { setFiltroRisco(f); setPagina(1) }}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: `1px solid ${filtroRisco === f ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  background: filtroRisco === f ? 'var(--accent-subtle)' : 'transparent',
                  color: filtroRisco === f ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: filtroRisco === f ? 700 : 400,
                }}
              >
                {f === 'todos' ? `Todos (>5%)` : f === 'critico' ? 'CRÍTICO (>30%)' : 'ALERTA (15-30%)'}
              </button>
            ))}
            <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
              {lista.length} municípios
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table role="table" aria-label="Municípios críticos por reprovação SISAB"
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-subtle)' }}>
                  {['#', 'Município', 'UF', 'Enviadas', 'Reprovadas', 'Taxa', 'Causa', 'Risco'].map(h => (
                    <th key={h} style={{
                      padding: '8px 10px', textAlign: h === '#' || h === 'UF' || h === 'Risco' ? 'center' : h === 'Enviadas' || h === 'Reprovadas' || h === 'Taxa' ? 'right' : 'left',
                      color: 'var(--text-muted)', fontWeight: 600, fontSize: 11,
                      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((m, i) => {
                  const rank = (pagAtual - 1) * POR_PAG + i + 1
                  return (
                    <tr key={m.ibge} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>{rank}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-primary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.municipio}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span style={{ background: 'var(--bg-surface-2)', color: 'var(--text-secondary)', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{m.uf}</span>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>{fmtM(m.total)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--chart-amber)' }}>{fmtM(m.reprovado)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: m.taxa_reprovacao > 30 ? 'var(--danger)' : m.taxa_reprovacao > 15 ? 'var(--chart-amber)' : 'var(--chart-indigo)' }}>
                        {m.taxa_reprovacao.toFixed(1).replace('.', ',')}%
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ background: CORES_MOTIVO[m.principal_motivo] ?? 'var(--chart-slate)', color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>
                          {m.principal_motivo}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <RiscoBadge taxa={m.taxa_reprovacao} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPags > 1 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {Array.from({ length: Math.min(totalPags, 7) }, (_, i) => {
                const p = totalPags <= 7 ? i + 1
                  : pagAtual <= 4 ? i + 1
                  : pagAtual >= totalPags - 3 ? totalPags - 6 + i
                  : pagAtual - 3 + i
                return (
                  <button key={p} onClick={() => setPagina(p)} aria-current={p === pagAtual ? 'page' : undefined}
                    style={{
                      minWidth: 44, minHeight: 44, borderRadius: 8,
                      border: '1px solid var(--border-subtle)',
                      background: p === pagAtual ? 'var(--accent)' : 'transparent',
                      color: p === pagAtual ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                      fontSize: 13, fontWeight: p === pagAtual ? 700 : 400, cursor: 'pointer',
                    }}
                  >{p}</button>
                )
              })}
            </div>
          )}
        </>
      )}
    </CardShell>
  )
}

// ── 4. Pendentes ──────────────────────────────────────────────────────────────

function PendentesCard({ ctx }: { ctx: MunicipioCtx | null }) {
  const { data, loading, error } = useFetch<PendentesData>('/api/sisab/pendentes_processamento')

  const munPendente = ctx
    ? data?.por_municipio.find(m => m.ibge === ctx.ibge) ?? null
    : null

  const semPendentes = ctx ? !munPendente : (data?.total_pendente ?? 0) === 0

  // Dados do gráfico: por município da UF (se ctx) ou por UF nacional
  const barData = useMemo(() => {
    if (!data) return []
    if (ctx?.uf) {
      return data.por_municipio
        .filter(m => m.uf === ctx.uf)
        .slice(0, 15)
        .map(m => ({ label: m.municipio.slice(0, 22), fichas: m.fichas, isSel: m.ibge === ctx.ibge }))
    }
    return data.por_uf.slice(0, 15).map(u => ({ label: u.uf, fichas: u.fichas, isSel: false }))
  }, [data, ctx])

  const titulo = ctx ? `Pendentes — ${ctx.nome}` : 'Pendentes de Processamento'
  const sub = ctx
    ? `${ctx.uf}`
    : data?.ultima_competencia_com_pendentes
      ? `Última competência com pendentes: ${labelComp(data.ultima_competencia_com_pendentes)}`
      : undefined

  return (
    <CardShell title={titulo} sub={sub}>
      {loading && <Spinner />}
      {error && <ErroMsg msg={error} />}
      {!loading && !error && data && (
        <>
          {semPendentes ? (
            // Estado colapsado — nenhum pendente
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 14px', borderRadius: 8,
              background: 'var(--success-subtle)', color: 'var(--success)',
              fontSize: 13, fontWeight: 600,
            }}>
              <span style={{ fontSize: 16 }}>✓</span>
              <span>
                {ctx
                  ? `Nenhuma ficha pendente em ${ctx.nome} — toda a produção já foi processada`
                  : 'Nenhuma ficha pendente encontrada no período'}
              </span>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div style={{ marginBottom: 16, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {ctx ? `Fichas pendentes` : 'Total nacional'}
                  </div>
                  <div style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 800, color: 'var(--chart-blue)' }}>
                    {fmt(ctx ? (munPendente?.fichas ?? 0) : data.total_pendente)}
                  </div>
                </div>
                {ctx && munPendente?.competencias && munPendente.competencias.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Competências afetadas
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                      {munPendente.competencias.map(labelComp).join(', ')}
                    </div>
                  </div>
                )}
                {!ctx && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>UFs afetadas</div>
                    <div style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {data.por_uf.length}
                    </div>
                  </div>
                )}
              </div>

              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 14,
                background: 'var(--bg-surface-2)', borderLeft: '3px solid var(--chart-blue)',
                fontSize: 12, color: 'var(--text-secondary)',
              }}>
                Fichas <strong>Pendentes</strong> estão na fila do SISAB e{' '}
                <em>não representam risco de reprovação</em>. Serão validadas automaticamente.
              </div>

              {barData.length > 0 && (
                <ResponsiveContainer width="100%" height={Math.max(160, barData.length * 26)}>
                  <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 60, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={fmtM} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} width={ctx?.uf ? 150 : 36} />
                    <Tooltip
                      labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }} itemStyle={{ color: 'var(--text-secondary)' }} contentStyle={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: unknown) => [fmt(Number(v)), 'Fichas pendentes']}
                    />
                    <Bar dataKey="fichas" radius={[0, 4, 4, 0]}>
                      {barData.map((d, i) => (
                        <Cell key={i} fill={d.isSel ? 'var(--accent)' : COR_PENDENTE} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </>
          )}
        </>
      )}
    </CardShell>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function SisabValidacaoDashboard() {
  const { data: evolucao, loading: lEvolucao } = useFetch<EvolucaoItem[]>('/api/sisab/evolucao_temporal')
  const { data: porUf } = useFetch<UfItem[]>('/api/sisab/por_uf')

  const [ctx, setCtx] = useState<MunicipioCtx | null>(null)
  const [serie, setSerie] = useState<SerieItem[] | null>(null)
  const [loadingCtx, setLoadingCtx] = useState(true)

  const [filtros, setFiltros] = useState<Filtros>(() => {
    const anoAtual = new Date().getFullYear()
    return { ano: anoAtual, competencia: null, comparar: false }
  })

  // Carrega perfil + dados do município (layout remonta ao trocar município)
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setLoadingCtx(false); return }

      const { data: perfil } = await supabase
        .from('perfis')
        .select('id, role, municipio_ativo_id, municipios:municipio_ativo_id(id, nome, codigo_ibge, uf)')
        .eq('id', session.user.id)
        .single()

      const mun = perfil?.municipios as unknown as
        | { id: string; nome: string; codigo_ibge: string; uf: string }
        | null

      if (!mun?.codigo_ibge) { setLoadingCtx(false); return }

      const ibge = String(mun.codigo_ibge)

      // Busca dados agregados + série temporal em paralelo
      const [resStats, resSerie] = await Promise.all([
        fetch(`/api/sisab/municipio?ibge=${ibge}`),
        fetch(`/api/sisab/municipio/temporal?ibge=${ibge}`),
      ])

      if (resStats.ok) {
        const munStats: MunicipioStats = await resStats.json()
        setCtx({ ibge, uf: mun.uf, nome: mun.nome, munStats })
      }

      if (resSerie.ok) {
        const { serie: s } = await resSerie.json()
        setSerie(s ?? null)
      }

      setLoadingCtx(false)
    })
  }, [])

  // Inicializa ano padrão na competência mais recente dos dados
  useEffect(() => {
    if (!evolucao || filtros.competencia !== null) return
    const ultima = evolucao[evolucao.length - 1]?.competencia
    if (ultima) {
      const anoUltimo = parseInt(ultima.split('-')[0])
      setFiltros(f => ({ ...f, ano: f.ano ?? anoUltimo }))
    }
  }, [evolucao, filtros.competencia])

  const handleFiltros = useCallback((parcial: Partial<Filtros>) => {
    setFiltros(f => ({ ...f, ...parcial }))
  }, [])

  const handleSelectComp = useCallback((comp: string) => {
    const ano = parseInt(comp.split('-')[0])
    setFiltros(f => ({ ...f, ano, competencia: comp }))
  }, [])

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1340, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{
            margin: 0, fontSize: 'clamp(18px, 3vw, 26px)', fontWeight: 800,
            color: 'var(--text-primary)', letterSpacing: '-0.02em',
          }}>
            Validação SISAB
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Aprovação, reprovação e processamento das fichas de produção
          </p>
        </div>
        <ScopeBadge ctx={ctx} />
      </div>

      {/* Filtros globais */}
      {!lEvolucao && (
        <FiltrosGlobais
          evolucao={evolucao}
          filtros={filtros}
          onChange={handleFiltros}
        />
      )}

      {/* KPIs */}
      {!loadingCtx && (
        <KpisTopo ctx={ctx} evolucao={evolucao} serie={serie} filtros={filtros} />
      )}

      {/* Resumo executivo */}
      {!loadingCtx && (
        <ResumoExecutivo ctx={ctx} evolucao={evolucao} serie={serie} filtros={filtros} />
      )}

      {/* Grid de componentes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: 20,
      }}>
        {/* Linha 1 — Evolução temporal (full width) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <EvolucaoTemporal
            ctx={ctx}
            evolucao={evolucao}
            serie={serie}
            porUf={porUf}
            filtros={filtros}
            onSelectComp={handleSelectComp}
          />
        </div>

        {/* Linha 2 — Motivos (full width) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <MotivosReprovacao ctx={ctx} />
        </div>

        {/* Linha 3 — Municípios (full width) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <MunicipiosCard ctx={ctx} />
        </div>

        {/* Linha 4 — Pendentes */}
        <div style={{ gridColumn: '1 / -1' }}>
          <PendentesCard ctx={ctx} />
        </div>
      </div>
    </div>
  )
}
