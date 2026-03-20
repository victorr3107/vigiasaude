'use client'

// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/producao-ambulatorial/page.tsx
// Produção Ambulatorial — SIASUS · 6 histórias · escopo por município ativo
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TabNavigation, { TabItem } from '@/app/components/TabNavigation'
import {
  ComposedChart, AreaChart, BarChart, ScatterChart,
  Bar, Area, Line, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceDot, ReferenceLine,
  Cell, LabelList,
} from 'recharts'

// ── tipos ─────────────────────────────────────────────────────────────────────

interface MesSerie {
  mes: string
  qtd_aprovada: number
  qtd_apresentada: number
  glosa_qtd_abs: number
  taxa_glosa_qtd: number
  valor_aprovado: number | null
  valor_apresentado: number | null
  glosa_financeira_abs: number | null
  taxa_glosa_financeira: number | null
  ticket_medio: number | null
  var_mom_pct: number | null
}

interface Resumo {
  qtd_aprovada: number
  valor_aprovado: number | null
  ticket_medio_medio: number | null
  taxa_glosa_qtd_media: number | null
  taxa_glosa_financeira_media: number | null
}

interface SerieTemporal {
  nome: string
  por_mes: MesSerie[]
  resumo_2024: Resumo | null
  resumo_2025: Resumo | null
  var_total_2425_pct: number | null
  mes_mais_recente_fechado: string
}

interface MesComplexidade {
  mes: string
  ab: number
  mc: number
  ac: number
  total_complexidade: number
  pct_ab: number
  pct_mc: number
  pct_ac: number
}

interface Sazonalidade {
  mes_do_ano: string
  media_ab: number
  media_mc: number
  media_ac: number
}

interface ComplexidadeMensal {
  nome: string
  por_mes: MesComplexidade[]
  pico_ac_historico: { mes: string; valor: number } | null
  vale_ac_historico: { mes: string; valor: number } | null
  sazonalidade: Sazonalidade[]
}

interface CaraterItem { qtd: number; pct: number }
interface CaraterAtendimento {
  eletivo: CaraterItem
  urgencia: CaraterItem
  acidentes: CaraterItem
  bpa_consolidado: CaraterItem
  total: number
}

interface GrupoForma {
  codigo: string
  nome: string
  qtd: number
  pct_sobre_total: number
  subgrupos: { nome: string; qtd: number; pct_no_grupo: number }[]
}
interface FormaOrganizacao { grupos: GrupoForma[]; total: number }

interface PerfilMunicipio {
  nome: string
  ibge: string
  perfil_2025: 'POLO_AC' | 'POLO_MC' | 'AB_DOMINANTE' | 'EQUILIBRADO'
  ab_2024: number; mc_2024: number; ac_2024: number; na_2024: number; total_2024: number
  ab_2025: number; mc_2025: number; ac_2025: number; na_2025: number; total_2025: number
  pct_ac_2025: number; pct_mc_2025: number; pct_ab_2025: number
  var_total_2425_pct: number | null
  var_ac_2425_pct: number | null
  var_ab_2425_pct: number | null
  var_mc_2425_pct: number | null
  ranking_total_sp: number
  ranking_ac_sp: number
  quartil_volume: 1 | 2 | 3 | 4
}

interface Benchmarks {
  metricas: Record<string, { media: number; mediana: number; p25: number; p75: number; p90: number } | null>
  polos_ac: PerfilMunicipio[]
  total_municipios: number
}

interface DadosMunicipio {
  ibge: string
  serie: SerieTemporal
  complexidade: ComplexidadeMensal
  carater: CaraterAtendimento | null
  forma: FormaOrganizacao | null
  perfil: PerfilMunicipio | null
}

type AnoFiltro = 2024 | 2025 | 'comparar'

// ── helpers globais ───────────────────────────────────────────────────────────

const fmtN = (n: number) => n.toLocaleString('pt-BR')
const fmtR = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtPct = (n: number) => `${n.toFixed(1)}%`
const fmtK = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}k` : String(n)

function deltaBadge(v: number | null, suffix = '%') {
  if (v === null) return null
  const pos = v >= 0
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: pos ? 'var(--success-subtle)' : 'var(--danger-subtle)',
      border: `1px solid ${pos ? 'var(--success)' : 'var(--danger)'}`,
      borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700,
      color: pos ? 'var(--success)' : 'var(--danger)',
    }}>
      {pos ? '▲' : '▼'} {Math.abs(v).toFixed(1)}{suffix}
    </span>
  )
}

function Skeleton({ h = 20, w = '100%', radius = 6 }: { h?: number; w?: string; radius?: number }) {
  return <div style={{ width: w, height: h, borderRadius: radius, background: 'var(--bg-surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
}

function Card({ title, subtitle, children, style }: { title?: string; subtitle?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)', ...style }}>
      {title && (
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
          {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</p>}
        </div>
      )}
      <div style={{ padding: '18px 22px' }}>{children}</div>
    </div>
  )
}

function TooltipCustom({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string; fill?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '11px 15px', fontSize: 12, minWidth: 160, boxShadow: 'var(--shadow-md)' }}>
      {label && <p style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 7 }}>{label}</p>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
          <span style={{ color: p.color ?? p.fill, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color ?? p.fill, display: 'inline-block' }} />
            {p.name}
          </span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{typeof p.value === 'number' ? fmtN(Math.round(p.value)) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── componente 1: AmbKPIs ─────────────────────────────────────────────────────

function AmbKPIs({ dados, benchmarks, ano }: { dados: DadosMunicipio; benchmarks: Benchmarks | null; ano: AnoFiltro }) {
  const { serie, perfil } = dados
  const r2025 = serie.resumo_2025
  const r2024 = serie.resumo_2024
  const mesRecente = serie.mes_mais_recente_fechado

  const mesAtual = serie.por_mes.find(m => m.mes === mesRecente)
  const mesAnoAnt = serie.por_mes.find(m => {
    const [a, mmm] = mesRecente.split('/')
    return m.mes === `${parseInt(a) - 1}/${mmm}`
  })

  const refResumo = ano === 2024 ? r2024 : r2025
  const outroResumo = ano === 2024 ? r2025 : r2024

  const QUARTIL_LABEL: Record<number, { label: string; color: string }> = {
    4: { label: 'Top 25% SP', color: 'var(--success)' },
    3: { label: 'Acima da mediana SP', color: 'var(--chart-blue)' },
    2: { label: 'Abaixo da mediana SP', color: 'var(--text-muted)' },
    1: { label: 'Quartil inferior SP', color: 'var(--danger)' },
  }
  const PERFIL_LABEL: Record<string, string> = {
    POLO_AC: 'Polo de Alta Complexidade',
    POLO_MC: 'Polo de Média Complexidade',
    AB_DOMINANTE: 'Atenção Básica Dominante',
    EQUILIBRADO: 'Perfil Equilibrado',
  }
  const PERFIL_COLOR: Record<string, string> = {
    POLO_AC: 'var(--chart-purple)',
    POLO_MC: 'var(--chart-blue)',
    AB_DOMINANTE: 'var(--chart-green)',
    EQUILIBRADO: 'var(--text-muted)',
  }
  const GLOSA_CLASS = (t: number) =>
    t < 0.5 ? { label: 'Excelente', color: 'var(--success)' } :
    t < 2   ? { label: 'Bom',       color: 'var(--chart-blue)' } :
    t < 5   ? { label: 'Atenção',   color: 'var(--chart-yellow, #f59e0b)' } :
    t < 15  ? { label: 'Crítico',   color: 'var(--chart-orange, #f97316)' } :
               { label: 'Grave',    color: 'var(--danger)' }

  const glosaAtual = mesAtual?.taxa_glosa_qtd ?? 0
  const glosaClass = GLOSA_CLASS(glosaAtual)
  const medGlosa = benchmarks?.metricas?.taxa_glosa_qtd?.mediana ?? null
  const medTicket = benchmarks?.metricas?.ticket_medio?.mediana ?? null
  const quartilInfo = perfil ? QUARTIL_LABEL[perfil.quartil_volume] : null

  const anoLabel = ano === 'comparar' ? '2025' : String(ano)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>

      {/* Card 1: Volume */}
      <div className="kpi-card" style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -20, width: 100, height: 100, background: 'var(--chart-green)', opacity: 0.07, borderRadius: '50%', filter: 'blur(24px)', pointerEvents: 'none' }} />
        <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Volume Total {anoLabel}</p>
        <p style={{ fontSize: 'clamp(22px,4vw,36px)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', lineHeight: 1, marginBottom: 6 }}>
          {refResumo ? fmtK(refResumo.qtd_aprovada) : '—'}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>procedimentos aprovados pelo SIASUS em {anoLabel}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {ano !== 'comparar' && outroResumo && refResumo && deltaBadge(
            parseFloat(((refResumo.qtd_aprovada - outroResumo.qtd_aprovada) / outroResumo.qtd_aprovada * 100).toFixed(1))
          )}
          {quartilInfo && (
            <span style={{ fontSize: 11, fontWeight: 700, color: quartilInfo.color, background: 'var(--bg-surface-2)', border: `1px solid ${quartilInfo.color}`, borderRadius: 12, padding: '2px 8px' }}>
              {quartilInfo.label}
            </span>
          )}
        </div>
        <div style={{ height: 3, borderRadius: 4, marginTop: 12, background: 'linear-gradient(90deg, var(--chart-green), transparent)' }} />
      </div>

      {/* Card 2: Perfil */}
      <div className="kpi-card" style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -20, width: 100, height: 100, background: 'var(--chart-purple)', opacity: 0.07, borderRadius: '50%', filter: 'blur(24px)', pointerEvents: 'none' }} />
        <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Perfil do Município</p>
        {perfil ? (
          <>
            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: PERFIL_COLOR[perfil.perfil_2025], background: 'var(--bg-surface-2)', border: `1px solid ${PERFIL_COLOR[perfil.perfil_2025]}`, borderRadius: 12, padding: '3px 10px', marginBottom: 10 }}>
              {PERFIL_LABEL[perfil.perfil_2025]}
            </span>
            {/* Barra de composição */}
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 10, marginBottom: 8 }}>
              <div title={`AB ${fmtPct(perfil.pct_ab_2025)}`} style={{ width: `${perfil.pct_ab_2025}%`, background: 'var(--chart-green)', transition: 'width 0.4s' }} />
              <div title={`MC ${fmtPct(perfil.pct_mc_2025)}`} style={{ width: `${perfil.pct_mc_2025}%`, background: 'var(--chart-blue)', transition: 'width 0.4s' }} />
              <div title={`AC ${fmtPct(perfil.pct_ac_2025)}`} style={{ flex: 1, background: 'var(--chart-purple)', transition: 'width 0.4s' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-muted)' }}>
              <span><span style={{ color: 'var(--chart-green)' }}>●</span> AB {fmtPct(perfil.pct_ab_2025)}</span>
              <span><span style={{ color: 'var(--chart-blue)' }}>●</span> MC {fmtPct(perfil.pct_mc_2025)}</span>
              <span><span style={{ color: 'var(--chart-purple)' }}>●</span> AC {fmtPct(perfil.pct_ac_2025)}</span>
            </div>
            {perfil.var_ac_2425_pct !== null && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                AC: {fmtPct(perfil.pct_ac_2025)} em 2025 {deltaBadge(perfil.var_ac_2425_pct)}
              </p>
            )}
          </>
        ) : <Skeleton h={60} />}
        <div style={{ height: 3, borderRadius: 4, marginTop: 12, background: 'linear-gradient(90deg, var(--chart-purple), transparent)' }} />
      </div>

      {/* Card 3: Ticket Médio */}
      <div className="kpi-card" style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -20, width: 100, height: 100, background: 'var(--chart-blue)', opacity: 0.07, borderRadius: '50%', filter: 'blur(24px)', pointerEvents: 'none' }} />
        <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Ticket Médio · {mesRecente}</p>
        <p style={{ fontSize: 'clamp(20px,3.5vw,32px)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', lineHeight: 1, marginBottom: 6 }}>
          {mesAtual?.ticket_medio != null ? `R$ ${mesAtual.ticket_medio.toFixed(2)}` : '—'}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>valor aprovado ÷ quantidade aprovada</p>
        {mesAnoAnt?.ticket_medio != null && mesAtual?.ticket_medio != null && (
          <div style={{ marginBottom: 6 }}>
            {deltaBadge(parseFloat(((mesAtual.ticket_medio - mesAnoAnt.ticket_medio) / mesAnoAnt.ticket_medio * 100).toFixed(1)))}
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>vs mesmo mês ano anterior</span>
          </div>
        )}
        {medTicket != null && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Mediana SP: R$ {medTicket.toFixed(2)}</p>
        )}
        <div style={{ height: 3, borderRadius: 4, marginTop: 12, background: 'linear-gradient(90deg, var(--chart-blue), transparent)' }} />
      </div>

      {/* Card 4: Glosa */}
      <div className="kpi-card" style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -20, width: 100, height: 100, background: glosaClass.color, opacity: 0.07, borderRadius: '50%', filter: 'blur(24px)', pointerEvents: 'none' }} />
        <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Glosa · {mesRecente}</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <p style={{ fontSize: 'clamp(20px,3.5vw,32px)', fontWeight: 700, color: glosaClass.color, fontFamily: 'Syne, sans-serif', lineHeight: 1 }}>
            {fmtPct(glosaAtual)}
          </p>
          <span style={{ fontSize: 11, fontWeight: 700, color: glosaClass.color, background: 'var(--bg-surface-2)', border: `1px solid ${glosaClass.color}`, borderRadius: 12, padding: '2px 8px' }}>
            {glosaClass.label}
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>procedimentos apresentados não aprovados pelo SIASUS</p>
        {medGlosa != null && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Mediana SP: {fmtPct(medGlosa)}</p>
        )}
        <div style={{ height: 3, borderRadius: 4, marginTop: 12, background: `linear-gradient(90deg, ${glosaClass.color}, transparent)` }} />
      </div>

    </div>
  )
}

// ── componente 2: AmbEvolucaoTotal ────────────────────────────────────────────

function AmbEvolucaoTotal({ dados, benchmarks, ano }: { dados: DadosMunicipio; benchmarks: Benchmarks | null; ano: AnoFiltro }) {
  const [periodo, setPeriodo] = useState<'6m' | '12m' | 'tudo'>('12m')
  const [showGlosa, setShowGlosa] = useState(false)

  const todosOsMeses = dados.serie.por_mes
  const medGlosa = benchmarks?.metricas?.taxa_glosa_qtd?.mediana ?? null

  const mesesFiltrados = (() => {
    const todos = ano === 2024 ? todosOsMeses.filter(m => m.mes.startsWith('2024')) :
                  ano === 2025 ? todosOsMeses.filter(m => m.mes.startsWith('2025')) :
                  todosOsMeses
    if (periodo === '6m') return todos.slice(-6)
    if (periodo === '12m') return todos.slice(-12)
    return todos
  })()

  const chartData = mesesFiltrados.map(m => ({
    mes: m.mes.replace('/', '\n'),
    comp: m.mes,
    qtd: m.qtd_aprovada,
    apres: m.qtd_apresentada,
    glosa: m.glosa_qtd_abs,
    taxaGlosa: m.taxa_glosa_qtd,
    ticket: m.ticket_medio,
    valAprov: m.valor_aprovado,
  }))

  const melhor = chartData.reduce((a, b) => b.qtd > a.qtd ? b : a, chartData[0])
  const piorGlosa = chartData.filter(d => d.taxaGlosa > 0).reduce((a, b) => b.taxaGlosa > a.taxaGlosa ? b : a, chartData[0])

  const nome = dados.serie.nome
  const periodoLabel = periodo === '6m' ? 'últimos 6 meses' : periodo === '12m' ? 'último ano' : 'todo o histórico'
  const totalPeriodo = mesesFiltrados.reduce((s, m) => s + m.qtd_aprovada, 0)
  const glosaMedia = mesesFiltrados.filter(m => m.taxa_glosa_qtd > 0).length > 0
    ? mesesFiltrados.reduce((s, m) => s + m.taxa_glosa_qtd, 0) / mesesFiltrados.filter(m => m.taxa_glosa_qtd > 0).length
    : 0

  const narrativa = [
    `${nome} aprovou ${fmtN(totalPeriodo)} procedimentos nos ${periodoLabel}.`,
    glosaMedia > 0.5 && medGlosa != null
      ? ` Taxa de glosa de ${fmtPct(glosaMedia)}, ${glosaMedia > medGlosa ? 'acima' : 'abaixo'} da mediana estadual (${fmtPct(medGlosa)}).`
      : '',
  ].join('')

  const maxQtd = Math.max(...chartData.map(d => d.qtd), 1)
  const maxTicket = Math.max(...chartData.map(d => d.ticket ?? 0), 1)

  return (
    <Card title="Evolução da Produção Total" subtitle="Quantidade aprovada mensal + ticket médio">
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['6m', '12m', 'tudo'] as const).map(p => (
          <button key={p} onClick={() => setPeriodo(p)} style={{
            padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)',
            background: periodo === p ? 'var(--accent)' : 'var(--bg-input)',
            color: periodo === p ? '#fff' : 'var(--text-secondary)',
          }}>
            {p === '6m' ? 'Últ. 6 meses' : p === '12m' ? 'Últ. ano' : 'Todo histórico'}
          </button>
        ))}
        <button onClick={() => setShowGlosa(v => !v)} style={{
          padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          border: `1px solid ${showGlosa ? 'var(--danger)' : 'var(--border)'}`,
          background: showGlosa ? 'var(--danger-subtle)' : 'var(--bg-input)',
          color: showGlosa ? 'var(--danger)' : 'var(--text-secondary)',
        }}>
          {showGlosa ? '✕ Ocultar glosa' : '+ Mostrar glosa'}
        </button>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 50, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="qtd" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={44} domain={[0, maxQtd * 1.1]} />
          <YAxis yAxisId="ticket" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v.toFixed(0)}`} width={48} domain={[0, maxTicket * 1.2]} />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const d = chartData.find(x => x.mes === label)
            return (
              <div style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '11px 15px', fontSize: 12, boxShadow: 'var(--shadow-md)', minWidth: 200 }}>
                <p style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 7 }}>{String(label ?? '').replace('\n', '/')}</p>
                <p style={{ color: 'var(--chart-green)', marginBottom: 3 }}>Aprovada: {fmtN(d?.qtd ?? 0)}</p>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>Apresentada: {fmtN(d?.apres ?? 0)}</p>
                {showGlosa && <p style={{ color: 'var(--danger)', marginBottom: 3 }}>Glosa: {fmtN(d?.glosa ?? 0)} ({fmtPct(d?.taxaGlosa ?? 0)})</p>}
                {d?.ticket != null && <p style={{ color: 'var(--chart-blue)' }}>Ticket médio: R$ {d.ticket.toFixed(2)}</p>}
              </div>
            )
          }} />
          <Area yAxisId="qtd" type="monotone" dataKey="qtd" name="Qtd aprovada" fill="var(--chart-green)" stroke="var(--chart-green)" fillOpacity={0.12} strokeWidth={2} dot={false} />
          {showGlosa && <Area yAxisId="qtd" type="monotone" dataKey="glosa" name="Glosa" fill="var(--danger)" stroke="var(--danger)" fillOpacity={0.15} strokeWidth={1.5} strokeDasharray="4 2" dot={false} />}
          <Line yAxisId="ticket" type="monotone" dataKey="ticket" name="Ticket médio" stroke="var(--chart-blue)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
          {melhor && <ReferenceDot yAxisId="qtd" x={melhor.mes} y={melhor.qtd} r={5} fill="var(--chart-green)" stroke="var(--bg-card)" strokeWidth={2} label={{ value: '★', fill: 'var(--chart-green)', fontSize: 13, dy: -12 }} />}
          {piorGlosa && piorGlosa.taxaGlosa > 1 && <ReferenceDot yAxisId="qtd" x={piorGlosa.mes} y={piorGlosa.qtd} r={5} fill="var(--danger)" stroke="var(--bg-card)" strokeWidth={2} label={{ value: '▲', fill: 'var(--danger)', fontSize: 11, dy: -12 }} />}
        </ComposedChart>
      </ResponsiveContainer>

      {narrativa && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.6, background: 'var(--bg-surface-2)', borderRadius: 8, padding: '8px 12px' }}>
          {narrativa}
        </p>
      )}
    </Card>
  )
}

// ── componente 3: AmbEvolucaoComplexidade ─────────────────────────────────────

function AmbEvolucaoComplexidade({ dados, benchmarks, ano }: { dados: DadosMunicipio; benchmarks: Benchmarks | null; ano: AnoFiltro }) {
  const [showSazon, setShowSazon] = useState(false)
  const { complexidade, perfil } = dados

  const mesesFiltrados = (() => {
    if (ano === 2024) return complexidade.por_mes.filter(m => m.mes.startsWith('2024'))
    if (ano === 2025) return complexidade.por_mes.filter(m => m.mes.startsWith('2025'))
    return complexidade.por_mes
  })()

  const chartData = mesesFiltrados.map(m => ({
    mes: m.mes.replace('/', '\n'),
    comp: m.mes,
    ab: m.ab, mc: m.mc, ac: m.ac,
  }))

  const temAC = chartData.some(d => d.ac > 0)
  const temMC = chartData.some(d => d.mc > 0)
  const temAB = chartData.some(d => d.ab > 0)

  const pico = complexidade.pico_ac_historico
  const sazon = complexidade.sazonalidade

  // variações anuais (do perfil)
  const varAC = perfil?.var_ac_2425_pct ?? null
  const varMC = perfil?.var_mc_2425_pct ?? null
  const varAB = perfil?.var_ab_2425_pct ?? null

  // médias estaduais de variação
  const medVarTotal = benchmarks?.metricas?.var_total_2425?.mediana ?? null

  const nome = dados.serie.nome
  const pctAC = perfil?.pct_ac_2025 ?? 0
  const tendencia = (() => {
    if (!temAC || chartData.length < 3) return null
    const ult3 = chartData.slice(-3).map(d => d.ac)
    const diff = ult3[2] - ult3[0]
    if (diff > 0) return 'crescimento'
    if (diff < 0) return 'queda'
    return 'estável'
  })()

  const narrativa = [
    temAC && pctAC > 0 ? `A Alta Complexidade representa ${fmtPct(pctAC)} da produção de ${nome}` : '',
    varAC !== null ? ` — ${varAC >= 0 ? 'crescimento' : 'queda'} de ${fmtPct(Math.abs(varAC))} em 2025 vs 2024${medVarTotal != null ? `, ${varAC > medVarTotal ? 'acima' : 'abaixo'} da média estadual (${fmtPct(medVarTotal)})` : ''}.` : '.',
    varAB !== null ? ` Atenção Básica ${varAB >= 0 ? 'cresceu' : 'caiu'} ${fmtPct(Math.abs(varAB))}.` : '',
    tendencia ? ` Nos últimos 3 meses, tendência de AC: ${tendencia}.` : '',
  ].join('')

  return (
    <Card title="Evolução por Complexidade" subtitle="Produção mensal por nível — componente central">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
        <div>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={44} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '11px 15px', fontSize: 12, boxShadow: 'var(--shadow-md)' }}>
                    <p style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 7 }}>{String(label).replace('\n', '/')}</p>
                    {payload.map((p, i) => (
                      <p key={i} style={{ color: p.color as string, marginBottom: 3 }}>{p.name}: {fmtN(Number(p.value))}</p>
                    ))}
                  </div>
                )
              }} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: unknown) => <span style={{ color: 'var(--text-secondary)' }}>{String(v)}</span>} />
              {temAB && <Area type="monotone" dataKey="ab" name="Atenção Básica" fill="var(--chart-green)" stroke="var(--chart-green)" fillOpacity={0.1} strokeWidth={2} dot={false} />}
              {temMC && <Area type="monotone" dataKey="mc" name="Média Complexidade" fill="var(--chart-blue)" stroke="var(--chart-blue)" fillOpacity={0.1} strokeWidth={2} dot={false} />}
              {temAC && <Area type="monotone" dataKey="ac" name="Alta Complexidade" fill="var(--chart-purple)" stroke="var(--chart-purple)" fillOpacity={0.1} strokeWidth={2.5} dot={false} />}
              {pico && temAC && (
                <ReferenceDot
                  x={pico.mes.replace('/', '\n')}
                  y={pico.valor}
                  r={5} fill="var(--chart-purple)" stroke="var(--bg-card)" strokeWidth={2}
                  label={{ value: '★', fill: 'var(--chart-purple)', fontSize: 13, dy: -12 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>

          {narrativa && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.6, background: 'var(--bg-surface-2)', borderRadius: 8, padding: '8px 12px' }}>
              {narrativa}
            </p>
          )}
        </div>

        {/* Painel variação anual */}
        <div style={{ minWidth: 140, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'AC 2024→2025', v: varAC, color: 'var(--chart-purple)' },
            { label: 'MC 2024→2025', v: varMC, color: 'var(--chart-blue)' },
            { label: 'AB 2024→2025', v: varAB, color: 'var(--chart-green)' },
          ].map(({ label, v, color }) => (
            <div key={label} style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: v == null ? 'var(--text-muted)' : v >= 0 ? 'var(--success)' : 'var(--danger)', fontFamily: 'Syne, sans-serif' }}>
                {v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '—'}
              </p>
              <div style={{ height: 2, borderRadius: 2, background: color, opacity: 0.4, marginTop: 6 }} />
            </div>
          ))}
        </div>
      </div>

      {/* Toggle sazonalidade */}
      <div style={{ marginTop: 14 }}>
        <button onClick={() => setShowSazon(v => !v)} style={{
          padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-secondary)',
        }}>
          {showSazon ? '▲ Ocultar sazonalidade' : '▼ Ver sazonalidade AC'}
        </button>

        {showSazon && temAC && (
          <div style={{ marginTop: 12, background: 'var(--bg-surface-2)', borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>Média histórica de AC por mês do ano</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={sazon} layout="horizontal" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <XAxis dataKey="mes_do_ano" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={38} />
                <Tooltip formatter={(v: unknown) => [fmtN(Number(v)), 'Média AC']} />
                <Bar dataKey="media_ac" name="Média AC" radius={[3, 3, 0, 0]}>
                  {sazon.map((s, i) => {
                    const isAlto = s.media_ac === Math.max(...sazon.map(x => x.media_ac))
                    const isBaixo = s.media_ac > 0 && s.media_ac === Math.min(...sazon.filter(x => x.media_ac > 0).map(x => x.media_ac))
                    return <Cell key={i} fill={isAlto ? 'var(--chart-purple)' : isBaixo ? 'var(--danger)' : 'var(--chart-slate, #94a3b8)'} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
              A queda de novembro e dezembro é um padrão histórico, não uma anomalia — procedimentos de alta complexidade têm menor volume nesses meses de forma consistente.
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}

// ── componente 4: AmbCaraterOrganizacao ───────────────────────────────────────

function AmbCaraterOrganizacao({ dados, isMobile }: { dados: DadosMunicipio; isMobile?: boolean }) {
  const [grupoExpandido, setGrupoExpandido] = useState<string | null>(null)
  const [showBpaNota, setShowBpaNota] = useState(false)

  const carat = dados.carater
  const forma = dados.forma
  const nome = dados.serie.nome

  if (!carat && !forma) return (
    <Card title="Caráter e Forma de Organização">
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Dados não disponíveis para este município.</p>
    </Card>
  )

  const caratItems = carat ? [
    { key: 'eletivo',         label: 'Eletivo',           color: 'var(--chart-blue)',   ...carat.eletivo },
    { key: 'urgencia',        label: 'Urgência',           color: 'var(--chart-orange, #f97316)', ...carat.urgencia },
    { key: 'acidentes',       label: 'Acidentes',          color: 'var(--danger)',       ...carat.acidentes },
    { key: 'bpa_consolidado', label: 'BPA Consolidado',   color: 'var(--text-muted)',   ...carat.bpa_consolidado },
  ] : []

  const top2Grupos = forma?.grupos.slice(0, 2).map(g => g.nome) ?? []
  const top2Pct = forma ? forma.grupos.slice(0, 2).reduce((s, g) => s + g.pct_sobre_total, 0) : 0
  const pctEletivo = carat ? carat.eletivo.pct : 0

  const narrativa = [
    carat ? `${nome} tem ${fmtPct(pctEletivo)} de atendimentos eletivos.` : '',
    forma && top2Grupos.length === 2 ? ` Em tipos de procedimento, ${top2Grupos[0]} e ${top2Grupos[1]} concentram ${fmtPct(top2Pct)} da produção.` : '',
  ].join('')

  return (
    <Card title="Caráter de Atendimento e Forma de Organização" subtitle="Perfil qualitativo da produção ambulatorial">
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 24 }}>

        {/* Coluna esquerda — Caráter */}
        {carat && (
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Caráter de Atendimento</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {caratItems.map(item => (
                <div key={item.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
                      {item.label}
                      {item.key === 'bpa_consolidado' && (
                        <button onClick={() => setShowBpaNota(v => !v)} title="O que é BPA Consolidado?" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: 0 }}>ⓘ</button>
                      )}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtN(item.qtd)} · <strong style={{ color: item.color }}>{fmtPct(item.pct)}</strong></span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${item.pct}%`, background: item.color, borderRadius: 4, transition: 'width 0.4s' }} />
                  </div>
                </div>
              ))}
            </div>
            {showBpaNota && (
              <div style={{ marginTop: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Procedimentos registrados via BPA Consolidado não discriminam o caráter de atendimento individualmente. São registros válidos e aprovados pelo SIASUS, não representam dados ausentes.
              </div>
            )}
          </div>
        )}

        {/* Coluna direita — Forma de Organização */}
        {forma && (
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Forma de Organização</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {forma.grupos.map((g, i) => (
                <div key={g.codigo}>
                  <div
                    onClick={() => setGrupoExpandido(grupoExpandido === g.codigo ? null : g.codigo)}
                    style={{ cursor: g.subgrupos.length > 0 ? 'pointer' : 'default', marginBottom: 4 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {g.subgrupos.length > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{grupoExpandido === g.codigo ? '▼' : '▶'}</span>}
                        {g.nome}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtN(g.qtd)} · <strong style={{ color: 'var(--accent)' }}>{fmtPct(g.pct_sobre_total)}</strong></span>
                    </div>
                    <div style={{ height: 5, background: 'var(--bg-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${g.pct_sobre_total}%`, background: `hsl(${220 + i * 25}, 60%, 55%)`, borderRadius: 3, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                  {grupoExpandido === g.codigo && g.subgrupos.length > 0 && (
                    <div style={{ marginLeft: 12, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {g.subgrupos.map((s, j) => (
                        <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                          <span style={{ maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.nome}>{s.nome}</span>
                          <span>{fmtN(s.qtd)} · {fmtPct(s.pct_no_grupo)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {narrativa && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 14, lineHeight: 1.6, background: 'var(--bg-surface-2)', borderRadius: 8, padding: '8px 12px' }}>
          {narrativa}
        </p>
      )}
    </Card>
  )
}

// ── componente 5: AmbFinanceiro ───────────────────────────────────────────────

function AmbFinanceiro({ dados, benchmarks, ano }: { dados: DadosMunicipio; benchmarks: Benchmarks | null; ano: AnoFiltro }) {
  const { serie } = dados
  const anoNum = ano === 'comparar' ? 2025 : ano

  const meses = serie.por_mes.filter(m => m.mes.startsWith(String(anoNum)) && m.valor_aprovado != null)
  const ult12 = meses.slice(-12)

  const totalAprov = ult12.reduce((s, m) => s + (m.valor_aprovado ?? 0), 0)
  const totalApres = ult12.reduce((s, m) => s + (m.valor_apresentado ?? 0), 0)
  const glosaFin = Math.max(0, totalApres - totalAprov)
  const taxaGlosaFin = totalApres > 0 ? glosaFin / totalApres * 100 : 0

  const medGlosaFin = benchmarks?.metricas?.taxa_glosa_fin?.mediana ?? null

  const mesRecente = serie.mes_mais_recente_fechado
  const mesAtual = serie.por_mes.find(m => m.mes === mesRecente)
  const [aRec, mmmRec] = mesRecente.split('/')
  const mesAnoAnt = serie.por_mes.find(m => m.mes === `${parseInt(aRec) - 1}/${mmmRec}`)

  const chartData = ult12.map(m => ({
    mes: m.mes.replace('/', '\n'),
    aprov: m.valor_aprovado ?? 0,
    apres: m.valor_apresentado ?? 0,
    glosa: m.glosa_financeira_abs ?? 0,
    ticket: m.ticket_medio,
  }))

  const semGlosa = taxaGlosaFin < 0.1

  return (
    <Card title="Financeiro" subtitle="Valor aprovado, apresentado e glosa financeira">
      {/* Cards de resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
        {[
          { label: `Valor Aprovado ${anoNum}`, value: fmtR(totalAprov), color: 'var(--success)' },
          { label: `Valor Apresentado ${anoNum}`, value: fmtR(totalApres), color: 'var(--text-secondary)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'Syne, sans-serif' }}>{value}</p>
          </div>
        ))}
        <div style={{ background: semGlosa ? 'var(--success-subtle)' : 'var(--danger-subtle)', border: `1px solid ${semGlosa ? 'var(--success)' : 'var(--danger)'}`, borderRadius: 10, padding: '10px 14px' }}>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>Glosa Financeira</p>
          {semGlosa ? (
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>✓ Aprovação integral</p>
          ) : (
            <>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--danger)', fontFamily: 'Syne, sans-serif' }}>{fmtPct(taxaGlosaFin)}</p>
              <p style={{ fontSize: 11, color: 'var(--danger)' }}>{fmtR(glosaFin)} glosados</p>
              {medGlosaFin != null && <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>Mediana SP: {fmtPct(medGlosaFin)}</p>}
            </>
          )}
        </div>
        <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>Ticket · {mesRecente}</p>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--chart-blue)', fontFamily: 'Syne, sans-serif' }}>
            {mesAtual?.ticket_medio != null ? `R$ ${mesAtual.ticket_medio.toFixed(2)}` : '—'}
          </p>
          {mesAnoAnt?.ticket_medio != null && mesAtual?.ticket_medio != null && (
            <div style={{ marginTop: 4 }}>{deltaBadge(parseFloat(((mesAtual.ticket_medio - mesAnoAnt.ticket_medio) / mesAnoAnt.ticket_medio * 100).toFixed(1)))}</div>
          )}
        </div>
      </div>

      {/* Gráfico de barras mensais */}
      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1e6 ? `R$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `R$${(v / 1e3).toFixed(0)}k` : `R$${v}`}
              width={56} />
            <Tooltip formatter={(v: unknown, n: unknown) => [`R$ ${fmtN(Number(v))}`, String(n)]} labelFormatter={(l: unknown) => String(l).replace('\n', '/')} />
            <Bar dataKey="aprov" name="Valor aprovado" fill="var(--chart-green)" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="aprov" name="Tendência" stroke="var(--chart-green)" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {meses.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          Dados financeiros disponíveis a partir de Out/2023.
        </p>
      )}
    </Card>
  )
}

// ── componente 6: AmbComparativo ──────────────────────────────────────────────

function AmbComparativo({ dados, todosOsPerfis, benchmarks }: {
  dados: DadosMunicipio
  todosOsPerfis: Record<string, PerfilMunicipio> | null
  benchmarks: Benchmarks | null
}) {
  const SP_CAPITAL = '355030'
  const perfil = dados.perfil
  const nome = dados.serie.nome

  if (!perfil || !todosOsPerfis) return (
    <Card title="Comparativo com Municípios Similares">
      <Skeleton h={200} />
    </Card>
  )

  const volMun = perfil.total_2025
  const peers = Object.values(todosOsPerfis).filter(p =>
    p.ibge !== perfil.ibge &&
    p.ibge !== SP_CAPITAL &&
    p.total_2025 >= volMun * 0.5 &&
    p.total_2025 <= volMun * 2.0 &&
    p.perfil_2025 === perfil.perfil_2025
  )

  const scatterData = [...peers, perfil].map(p => ({
    x: Math.round(p.total_2025 / 12),
    y: p.pct_ac_2025,
    ibge: p.ibge,
    nome: p.nome,
    total: p.total_2025,
    perfil: p.perfil_2025,
    ranking: p.ranking_total_sp,
    isSelf: p.ibge === perfil.ibge,
  }))

  const medTicket = benchmarks?.metricas?.ticket_medio?.mediana ?? null
  const quartilLabel = { 4: 'top 25%', 3: 'acima da mediana', 2: 'abaixo da mediana', 1: 'quartil inferior' }

  const narrativa = `${nome} produz ~${fmtK(Math.round(volMun / 12))} procedimentos/mês. Entre municípios de porte similar em SP (${peers.length} pares), está no ${quartilLabel[perfil.quartil_volume]} em volume.`

  return (
    <Card title="Comparativo com Municípios Similares" subtitle={`Peers: mesmo perfil (${perfil.perfil_2025}) · volume 50–200% do município`}>
      {scatterData.length < 2 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Poucos municípios similares disponíveis para comparação.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="x" name="Vol. mensal médio" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={fmtK} axisLine={false} tickLine={false} label={{ value: 'Produção mensal média', position: 'insideBottom', offset: -4, fill: 'var(--text-muted)', fontSize: 10 }} />
            <YAxis dataKey="y" name="% AC" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} label={{ value: '% Alta Complexidade', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 10 }} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as typeof scatterData[0]
              return (
                <div style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: 'var(--shadow-md)' }}>
                  <p style={{ fontWeight: 700, color: d.isSelf ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 5 }}>{d.nome}</p>
                  <p style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Vol. total 2025: {fmtN(d.total)}</p>
                  <p style={{ color: 'var(--text-muted)', marginBottom: 2 }}>% AC: {fmtPct(d.y)}</p>
                  <p style={{ color: 'var(--text-muted)' }}>Ranking SP: #{d.ranking}</p>
                </div>
              )
            }} />
            <Scatter data={scatterData} name="Municípios">
              {scatterData.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.isSelf ? 'var(--accent)' : 'var(--chart-blue)'}
                  fillOpacity={d.isSelf ? 1 : 0.5}
                  stroke={d.isSelf ? 'var(--accent)' : 'transparent'}
                  strokeWidth={d.isSelf ? 2 : 0}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      )}

      {narrativa && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.6, background: 'var(--bg-surface-2)', borderRadius: 8, padding: '8px 12px' }}>
          {narrativa}
        </p>
      )}
    </Card>
  )
}

// ── página principal ──────────────────────────────────────────────────────────

const TABS: TabItem[] = [
  { id: 'geral',        label: 'Visão Geral' },
  { id: 'complexidade', label: 'Por Complexidade' },
  { id: 'financeiro',   label: 'Financeiro' },
  { id: 'comparativo',  label: 'Comparativo' },
  { id: 'carater',      label: 'Caráter e Organização' },
]

function ProducaoAmbulatorialInner() {
  const searchParams = useSearchParams()
  const [perfil, setPerfil] = useState<{ ibge: string; nome: string; uf: string } | null>(null)
  const [dados, setDados] = useState<DadosMunicipio | null>(null)
  const [benchmarks, setBenchmarks] = useState<Benchmarks | null>(null)
  const [todosOsPerfis, setTodosOsPerfis] = useState<Record<string, PerfilMunicipio> | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ano, setAno] = useState<AnoFiltro>(2025)
  const [isMobile, setIsMobile] = useState(false)
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get('tab')
    return TABS.find(x => x.id === t) ? t! : 'geral'
  })

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // carrega perfil do usuário (município ativo)
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data } = await supabase
        .from('perfis')
        .select('id, role, municipio_ativo_id, municipios:municipio_ativo_id(id, nome, codigo_ibge, uf)')
        .eq('id', session.user.id)
        .single()
      if (data) {
        const mun = data.municipios as unknown as { id: string; nome: string; codigo_ibge: string; uf: string } | null
        if (mun?.codigo_ibge) {
          setPerfil({ ibge: String(mun.codigo_ibge).slice(0, 6), nome: mun.nome, uf: mun.uf })
        }
      }
    })
  }, [])

  const fetchDados = useCallback(async (ibge: string) => {
    setLoading(true)
    setErro(null)
    try {
      const [resMun, resBench, resPerfis] = await Promise.all([
        fetch(`/api/ambulatorial/municipio?ibge=${ibge}`),
        fetch('/api/ambulatorial/benchmarks'),
        fetch('/api/ambulatorial/perfis'),
      ])

      if (resMun.status === 404) {
        setErro(`Município IBGE ${ibge} não encontrado nos dados ambulatoriais. Execute scripts/processar_ambulatorial.py.`)
        return
      }
      if (!resMun.ok) {
        setErro('Erro ao carregar dados ambulatoriais. Verifique se os JSONs foram gerados.')
        return
      }

      const [munData, benchData, perfisData] = await Promise.all([
        resMun.json(), resBench.ok ? resBench.json() : null, resPerfis.ok ? resPerfis.json() : null,
      ])

      setDados(munData)
      setBenchmarks(benchData)
      setTodosOsPerfis(perfisData)
    } catch (e) {
      setErro('Erro de conexão ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (perfil?.ibge) fetchDados(perfil.ibge)
  }, [perfil, fetchDados])

  const municipioLabel = perfil ? `${perfil.nome}${perfil.uf ? ` · ${perfil.uf}` : ''}` : '—'

  return (
    <div style={{ maxWidth: 1200, width: '100%', minWidth: 0 }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Produção Ambulatorial
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{municipioLabel} · SIASUS · 2024 vs 2025</p>
        </div>

        {/* Seletor de ano (global — vale para todas as abas) */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([2024, 2025, 'comparar'] as AnoFiltro[]).map(a => (
            <button key={String(a)} onClick={() => setAno(a)} style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)',
              background: ano === a ? 'var(--accent)' : 'var(--bg-input)',
              color: ano === a ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}>
              {a === 'comparar' ? 'Comparar 2024 vs 2025' : String(a)}
            </button>
          ))}
        </div>
      </div>

      {/* Abas — só exibe quando há dados */}
      {!loading && !erro && dados && (
        <div style={{ marginBottom: 24 }}>
          <TabNavigation tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
        </div>
      )}

      {/* Estado: loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '80px 0' }}>
          <div className="spinner" />
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Carregando dados ambulatoriais…</span>
        </div>
      )}

      {/* Estado: erro */}
      {!loading && erro && (
        <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 14, padding: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--danger)', marginBottom: 6 }}>Dados não disponíveis</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{erro}</p>
        </div>
      )}

      {/* Sem município selecionado */}
      {!loading && !erro && !dados && !perfil && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '60px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Nenhum município selecionado</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Selecione um município no topo do sistema para visualizar os dados de produção ambulatorial.</p>
        </div>
      )}

      {/* Conteúdo das abas */}
      {!loading && !erro && dados && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 20 }}>

          {/* Aba: Visão Geral */}
          {activeTab === 'geral' && (
            <>
              <AmbKPIs dados={dados} benchmarks={benchmarks} ano={ano} />
              <AmbEvolucaoTotal dados={dados} benchmarks={benchmarks} ano={ano} />
            </>
          )}

          {/* Aba: Por Complexidade */}
          {activeTab === 'complexidade' && (
            <AmbEvolucaoComplexidade dados={dados} benchmarks={benchmarks} ano={ano} />
          )}

          {/* Aba: Financeiro */}
          {activeTab === 'financeiro' && (
            <AmbFinanceiro dados={dados} benchmarks={benchmarks} ano={ano} />
          )}

          {/* Aba: Comparativo */}
          {activeTab === 'comparativo' && (
            <AmbComparativo dados={dados} todosOsPerfis={todosOsPerfis} benchmarks={benchmarks} />
          )}

          {/* Aba: Caráter e Organização */}
          {activeTab === 'carater' && (
            <AmbCaraterOrganizacao dados={dados} isMobile={isMobile} />
          )}

        </div>
      )}
    </div>
  )
}

export default function ProducaoAmbulatorialPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Carregando…</div>}>
      <ProducaoAmbulatorialInner />
    </Suspense>
  )
}
