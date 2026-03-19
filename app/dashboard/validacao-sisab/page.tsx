'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResumoGeral {
  gerado_em: string
  total_fichas: number
  total_linhas: number
  total_competencias: number
  competencias: string[]
  ultima_competencia: string
  por_status: Record<string, { fichas: number; pct: number }>
  taxa_aprovacao: number
  taxa_reprovacao: number
}

interface EvolucaoItem {
  competencia: string
  total: number
  aprovado: number
  reprovado: number
  duplicado: number
  nao_aplicado: number
  pendente: number
  linhas: number
  taxa_aprovacao: number
  taxa_reprovacao: number
  pct_aprovado: number
  pct_reprovado: number
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

function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
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
const COR_REPROVADO = 'var(--chart-amber)'
const COR_PENDENTE  = 'var(--chart-blue)'
const COR_INUTIL    = 'var(--chart-slate)'
const COR_OUTROS    = 'var(--chart-purple)'

const CORES_MOTIVO: Record<string, string> = {
  CNES:      'var(--chart-amber)',
  PROF:      'var(--chart-indigo)',
  INE:       'var(--chart-blue)',
  CBO:       'var(--chart-purple)',
  'MÚLTIPLOS': 'var(--chart-green)',
  OUTROS:    'var(--chart-slate)',
}

// ── Componentes internos ───────────────────────────────────────────────────────

function CardShell({ title, sub, children }: {
  title: string; sub?: string; children: React.ReactNode
}) {
  return (
    <div className="kpi-card" style={{ padding: '20px 24px' }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
        }}>{title}</h3>
        {sub && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
      {children}
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center' }}>
      <div className="spinner" />
    </div>
  )
}

function ErroMsg({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: '16px',
      borderRadius: 8,
      background: 'var(--danger-subtle)',
      color: 'var(--danger)',
      fontSize: 13,
    }}>
      {msg}
    </div>
  )
}

// ── 1. SisabFunilProducao ──────────────────────────────────────────────────────

function SisabFunilProducao({ ctx }: { ctx: MunicipioCtx | null }) {
  const { data: resumo, loading: lR, error: eR } = useFetch<ResumoGeral>('/api/sisab/resumo_geral')

  const loading = lR && !ctx
  const error = eR

  // Usa dados do município se disponível, senão nacional
  const stats = ctx
    ? {
        aprovado: ctx.munStats.aprovado,
        reprovado: ctx.munStats.reprovado,
        pendente: ctx.munStats.pendente,
        nao_aplicado: ctx.munStats.nao_aplicado,
        duplicado: ctx.munStats.duplicado,
        total: ctx.munStats.total,
        taxa_aprovacao: ctx.munStats.taxa_aprovacao,
      }
    : resumo
      ? {
          aprovado: resumo.por_status.aprovado?.fichas ?? 0,
          reprovado: resumo.por_status.reprovado?.fichas ?? 0,
          pendente: resumo.por_status.pendente?.fichas ?? 0,
          nao_aplicado: resumo.por_status.nao_aplicado?.fichas ?? 0,
          duplicado: resumo.por_status.duplicado?.fichas ?? 0,
          total: resumo.total_fichas,
          taxa_aprovacao: resumo.taxa_aprovacao,
        }
      : null

  const donut = stats ? [
    { name: 'Aprovado',    value: stats.aprovado,    color: COR_APROVADO },
    { name: 'Reprovado',   value: stats.reprovado,   color: COR_REPROVADO },
    { name: 'Pendente',    value: stats.pendente,     color: COR_PENDENTE },
    { name: 'Não Aplicado',value: stats.nao_aplicado, color: COR_INUTIL },
    { name: 'Duplicado',   value: stats.duplicado,    color: COR_OUTROS },
  ] : []

  const taxaAprov = stats?.taxa_aprovacao ?? 0

  const sub = ctx
    ? `${ctx.nome} — ${ctx.uf}`
    : `Nacional — ${resumo?.ultima_competencia ? labelComp(resumo.ultima_competencia) : ''}`

  return (
    <CardShell title="Funil de Produção SISAB" sub={sub}>
      {loading && <Spinner />}
      {error && <ErroMsg msg={error} />}
      {!loading && !error && stats && (
        <>
          {/* KPI principal */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Taxa de Aprovação
              </div>
              <div style={{
                fontSize: 'clamp(24px, 4vw, 36px)',
                fontWeight: 800,
                color: taxaAprov >= 97 ? 'var(--success)' : taxaAprov >= 90 ? 'var(--chart-amber)' : 'var(--danger)',
                lineHeight: 1.1,
              }}>
                {taxaAprov.toFixed(2).replace('.', ',')}%
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total de Fichas
              </div>
              <div style={{ fontSize: 'clamp(18px, 3vw, 26px)', fontWeight: 700, color: 'var(--text-primary)' }}>
                {fmtM(stats.total)}
              </div>
            </div>
          </div>

          {/* Donut + legenda */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ width: 160, height: 160, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donut}
                    dataKey="value"
                    innerRadius="55%"
                    outerRadius="85%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                  >
                    {donut.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [fmtM(Number(v)), '']}
                    contentStyle={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {donut.map((d) => {
                const pct = stats.total > 0 ? (d.value / stats.total * 100) : 0
                return (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{d.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{pct.toFixed(1)}%</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Base de cálculo */}
          {resumo && (
            <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
              Base: total &minus; Não Aplicado &minus; Duplicado &nbsp;|&nbsp;
              Gerado em: {new Date(resumo.gerado_em).toLocaleDateString('pt-BR')}
            </p>
          )}
        </>
      )}
    </CardShell>
  )
}

// ── 2. SisabEvolucaoTemporal ───────────────────────────────────────────────────

function SisabEvolucaoTemporal() {
  const { data, loading, error } = useFetch<EvolucaoItem[]>('/api/sisab/evolucao_temporal')

  const chartData = data?.map(d => ({
    label: labelComp(d.competencia),
    competencia: d.competencia,
    taxa: d.taxa_aprovacao,
    reprovado_pct: d.taxa_reprovacao,
    total_m: Math.round(d.total / 1_000_000),
    aprovado: d.aprovado,
    reprovado: d.reprovado,
  })) ?? []

  // Identifica tendência
  const tendencia = (() => {
    if (!data || data.length < 3) return null
    const ult3 = data.slice(-3).map(d => d.taxa_aprovacao)
    const delta = ult3[2] - ult3[0]
    if (delta > 0.3) return { dir: 'subindo', color: 'var(--success)' }
    if (delta < -0.3) return { dir: 'caindo', color: 'var(--danger)' }
    return { dir: 'estável', color: 'var(--text-muted)' }
  })()

  return (
    <CardShell
      title="Evolução Temporal da Aprovação"
      sub="Taxa de aprovação mensal — nacional (2024–2026)"
    >
      {loading && <Spinner />}
      {error && <ErroMsg msg={error} />}
      {!loading && !error && data && (
        <>
          {tendencia && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 20,
              background: 'var(--bg-surface-2)',
              marginBottom: 16,
              fontSize: 12,
            }}>
              <span style={{ color: tendencia.color, fontWeight: 600 }}>
                Tendência: {tendencia.dir}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>nos últimos 3 meses</span>
            </div>
          )}
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v}%`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v, name) => [
                  `${Number(v).toFixed(2).replace('.', ',')}%`,
                  name === 'taxa' ? 'Taxa aprovação' : 'Taxa reprovação',
                ]}
                labelFormatter={(l) => `Competência: ${l}`}
              />
              <Line
                type="monotone"
                dataKey="taxa"
                name="taxa"
                stroke={COR_APROVADO}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="reprovado_pct"
                name="reprovado_pct"
                stroke={COR_REPROVADO}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4 }}
                strokeDasharray="4 2"
              />
              <Legend
                formatter={(v) => v === 'taxa' ? 'Aprovação (%)' : 'Reprovação (%)'}
                iconType="line"
                wrapperStyle={{ fontSize: 11 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            Dados nacionais agregados. Filtro de UF não afeta este gráfico.
          </p>
        </>
      )}
    </CardShell>
  )
}

// ── 3. SisabMotivoReprovacao ───────────────────────────────────────────────────

function SisabMotivoReprovacao() {
  const { data, loading, error } = useFetch<MotivosReprovacao>('/api/sisab/motivos_reprovacao')

  const [aba, setAba] = useState<'total' | 'temporal'>('total')

  const barData = data?.por_motivo
    .filter(m => m.fichas > 0)
    .map(m => ({ ...m, color: CORES_MOTIVO[m.motivo] ?? 'var(--chart-slate)' })) ?? []

  const evolData = data?.evolucao_temporal.map(e => ({
    ...e,
    label: labelComp(e.competencia as string),
  })) ?? []

  const motivosComDados = data?.por_motivo
    .filter(m => m.fichas > 0)
    .map(m => m.motivo) ?? []

  return (
    <CardShell
      title="Motivos de Reprovação"
      sub={data ? `${fmt(data.total_reprovado)} fichas reprovadas no total` : ''}
    >
      {loading && <Spinner />}
      {error && <ErroMsg msg={error} />}
      {!loading && !error && data && (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {(['total', 'temporal'] as const).map(t => (
              <button
                key={t}
                onClick={() => setAba(t)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--border-subtle)',
                  background: aba === t ? 'var(--accent)' : 'transparent',
                  color: aba === t ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: aba === t ? 600 : 400,
                  cursor: 'pointer',
                  minHeight: 32,
                }}
                aria-pressed={aba === t}
              >
                {t === 'total' ? 'Visão geral' : 'Evolução temporal'}
              </button>
            ))}
          </div>

          {aba === 'total' && (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 60, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={fmtM} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="motivo" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v, _n, p) => [`${fmtM(Number(v))} (${p.payload.pct}%)`, 'Fichas reprovadas']}
                  />
                  <Bar dataKey="fichas" radius={[0, 4, 4, 0]}>
                    {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* insight: PROF dominante */}
              {barData[0]?.motivo === 'PROF' && (
                <div style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'var(--bg-surface-2)',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  borderLeft: '3px solid var(--chart-indigo)',
                }}>
                  <strong>PROF</strong> é o motivo dominante ({barData[0].pct}% das reprovações).
                  Indica inconsistências no registro do profissional de saúde responsável.
                </div>
              )}
            </>
          )}

          {aba === 'temporal' && (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={evolData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={fmtM} width={44} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 11 }}
                  formatter={(v) => [fmtM(Number(v)), '']}
                />
                <Legend iconType="line" wrapperStyle={{ fontSize: 11 }} />
                {motivosComDados.map(m => (
                  <Line
                    key={m}
                    type="monotone"
                    dataKey={m}
                    name={m}
                    stroke={CORES_MOTIVO[m] ?? 'var(--chart-slate)'}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </CardShell>
  )
}

// ── 4. SisabMunicipiosCriticos ─────────────────────────────────────────────────

function SisabMunicipiosCriticos({ ctx }: { ctx: MunicipioCtx | null }) {
  const { data: todos, loading, error } = useFetch<MunicipioCritico[]>('/api/sisab/municipios_criticos')
  const [pagina, setPagina] = useState(1)
  const POR_PAG = 15

  // Filtra pela UF do município selecionado
  const lista = ctx?.uf
    ? (todos?.filter(m => m.uf === ctx.uf) ?? [])
    : (todos ?? [])

  const totalPags = Math.max(1, Math.ceil(lista.length / POR_PAG))
  const pagAtual = Math.min(pagina, totalPags)
  const visiveis = lista.slice((pagAtual - 1) * POR_PAG, pagAtual * POR_PAG)

  // top 10 para o gráfico
  const top10 = lista.slice(0, 10).map(m => ({
    label: m.municipio.length > 18 ? m.municipio.slice(0, 17) + '…' : m.municipio,
    reprovado: m.reprovado,
    taxa: m.taxa_reprovacao,
    uf: m.uf,
  }))

  return (
    <CardShell
      title="Municípios com Maior Volume de Reprovação"
      sub={ctx?.uf ? `UF: ${ctx.uf} — ${lista.length} municípios` : `Top ${lista.length} municípios com volume de reprovação`}
    >
      {loading && <Spinner />}
      {error && <ErroMsg msg={error} />}
      {!loading && !error && todos && (
        <>
          {/* Bar chart top 10 */}
          {top10.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>
                Top 10 por fichas reprovadas
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 60, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={fmtM} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} width={130} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 11 }}
                    formatter={(v, name) => [
                      name === 'reprovado' ? fmtM(Number(v)) : `${Number(v).toFixed(1)}%`,
                      name === 'reprovado' ? 'Fichas reprovadas' : 'Taxa reprovação',
                    ]}
                  />
                  <Bar dataKey="reprovado" name="reprovado" fill={COR_REPROVADO} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabela */}
          {lista.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
              Nenhum município encontrado para UF: {ctx?.uf ?? '—'}
            </p>
          ) : (
            <>
              {/* Highlight do município selecionado se não estiver no top */}
              {ctx && !lista.some(m => m.ibge === ctx.ibge) && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'var(--bg-surface-2)',
                  borderLeft: '3px solid var(--chart-green)',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  marginBottom: 12,
                }}>
                  {ctx.nome} ({ctx.uf}) nao esta entre os municipios com maior volume de reprovacao — indicador positivo.
                </div>
              )}
              <div style={{ overflowX: 'auto' }}>
                <table
                  role="table"
                  aria-label="Municípios críticos por reprovação SISAB"
                  style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}
                >
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-subtle)' }}>
                      {['#', 'Município', 'UF', 'Reprovado', 'Taxa Rep.', 'Principal Motivo'].map(h => (
                        <th key={h} style={{
                          padding: '8px 10px',
                          textAlign: h === '#' || h === 'UF' ? 'center' : h === 'Reprovado' || h === 'Taxa Rep.' ? 'right' : 'left',
                          color: 'var(--text-muted)',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((m, i) => {
                      const rank = (pagAtual - 1) * POR_PAG + i + 1
                      const cor = m.taxa_reprovacao > 5 ? 'var(--danger)' : m.taxa_reprovacao > 2 ? 'var(--chart-amber)' : 'var(--text-secondary)'
                      const isSelecionado = ctx?.ibge === m.ibge
                      return (
                        <tr key={m.ibge} style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          background: isSelecionado ? 'var(--accent-subtle)' : undefined,
                        }}>
                          <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>{rank}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.municipio}
                            {isSelecionado && (
                              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-subtle)', borderRadius: 4, padding: '1px 5px' }}>
                                seu mun.
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <span style={{
                              background: 'var(--bg-surface-2)',
                              color: 'var(--text-secondary)',
                              borderRadius: 20,
                              padding: '2px 8px',
                              fontSize: 11,
                              fontWeight: 600,
                            }}>{m.uf}</span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-primary)' }}>{fmtM(m.reprovado)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: cor, fontWeight: 600 }}>
                            {m.taxa_reprovacao.toFixed(1).replace('.', ',')}%
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{
                              background: CORES_MOTIVO[m.principal_motivo] ?? 'var(--chart-slate)',
                              color: '#fff',
                              borderRadius: 4,
                              padding: '2px 7px',
                              fontSize: 11,
                              fontWeight: 600,
                              opacity: 0.9,
                            }}>{m.principal_motivo}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              {totalPags > 1 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {Array.from({ length: Math.min(totalPags, 7) }, (_, i) => {
                    const p = totalPags <= 7
                      ? i + 1
                      : pagAtual <= 4
                        ? i + 1
                        : pagAtual >= totalPags - 3
                          ? totalPags - 6 + i
                          : pagAtual - 3 + i
                    return (
                      <button
                        key={p}
                        onClick={() => setPagina(p)}
                        aria-current={p === pagAtual ? 'page' : undefined}
                        style={{
                          minWidth: 44,
                          minHeight: 44,
                          borderRadius: 8,
                          border: '1px solid var(--border-subtle)',
                          background: p === pagAtual ? 'var(--accent)' : 'transparent',
                          color: p === pagAtual ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                          fontSize: 13,
                          fontWeight: p === pagAtual ? 700 : 400,
                          cursor: 'pointer',
                        }}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </CardShell>
  )
}

// ── 5. SisabPendentesProcessamento ────────────────────────────────────────────

function SisabPendentesProcessamento({ ctx }: { ctx: MunicipioCtx | null }) {
  const { data, loading, error } = useFetch<PendentesData>('/api/sisab/pendentes_processamento')

  // Se há município selecionado, foca nele; senão mostra nacional por UF
  const munPendente = ctx
    ? data?.por_municipio.find(m => m.ibge === ctx.ibge) ?? null
    : null

  const porUfFiltrado = ctx?.uf
    ? (data?.por_uf.filter(u => u.uf === ctx.uf) ?? [])
    : (data?.por_uf ?? [])

  const porMunFiltrado = ctx?.uf
    ? (data?.por_municipio.filter(m => m.uf === ctx.uf) ?? [])
    : (data?.por_municipio.slice(0, 20) ?? [])

  const totalFiltrado = porUfFiltrado.reduce((s, u) => s + u.fichas, 0)

  const barData = (ctx?.uf ? porMunFiltrado : porUfFiltrado).slice(0, 15).map(item => ({
    label: ctx?.uf
      ? (item as typeof porMunFiltrado[0]).municipio.slice(0, 20)
      : (item as typeof porUfFiltrado[0]).uf,
    fichas: item.fichas,
    isSel: ctx ? (item as typeof porMunFiltrado[0]).ibge === ctx.ibge : false,
  }))

  const fichasExibidas = ctx ? (munPendente?.fichas ?? 0) : (ctx ? totalFiltrado : data?.total_pendente ?? 0)

  return (
    <CardShell
      title="Pendentes de Processamento"
      sub={ctx
        ? `${ctx.nome} — ${ctx.uf}`
        : data?.ultima_competencia_com_pendentes
          ? `Última competência com pendentes: ${labelComp(data.ultima_competencia_com_pendentes)}`
          : 'Fichas aguardando validação pelo SISAB'}
    >
      {loading && <Spinner />}
      {error && <ErroMsg msg={error} />}
      {!loading && !error && data && (
        <>
          {/* KPI */}
          <div style={{ marginBottom: 20, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {ctx ? `Pendentes em ${ctx.nome}` : 'Total Pendentes (nacional)'}
              </div>
              <div style={{ fontSize: 'clamp(22px, 3.5vw, 32px)', fontWeight: 800, color: 'var(--chart-blue)' }}>
                {fmt(ctx ? (munPendente?.fichas ?? 0) : data.total_pendente)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                fichas aguardando validação
              </div>
            </div>
            {!ctx && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  UFs Afetadas
                </div>
                <div style={{ fontSize: 'clamp(22px, 3.5vw, 32px)', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {data.por_uf.length}
                </div>
              </div>
            )}
            {ctx && munPendente?.competencias && munPendente.competencias.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Competências c/ pendentes
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                  {munPendente.competencias.map(labelComp).join(', ')}
                </div>
              </div>
            )}
          </div>

          {/* Sem pendentes no município */}
          {ctx && !munPendente && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'var(--bg-surface-2)',
              borderLeft: '3px solid var(--chart-green)',
              fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16,
            }}>
              Nenhuma ficha pendente registrada para {ctx.nome}. Exibindo contexto da UF {ctx.uf}.
            </div>
          )}

          {/* Alerta contextual */}
          <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: 'var(--bg-surface-2)',
            borderLeft: '3px solid var(--chart-blue)',
            fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16,
          }}>
            Fichas <strong>Pendentes</strong> estão na fila de processamento do SISAB e <em>não representam
            risco de reprovação</em>. Serão validadas automaticamente pelo sistema.
          </div>

          {/* Gráfico */}
          {barData.length > 0 && (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 60, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={fmtM} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} width={ctx?.uf ? 140 : 36} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 11 }}
                  formatter={(v) => [fmt(Number(v)), 'Fichas pendentes']}
                />
                <Bar dataKey="fichas" fill={COR_PENDENTE} radius={[0, 4, 4, 0]}>
                  {barData.map((d, i) => (
                    <Cell key={i} fill={d.isSel ? 'var(--accent)' : COR_PENDENTE} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {barData.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
              {ctx ? `Nenhuma ficha pendente em ${ctx.uf}` : 'Nenhuma ficha pendente encontrada'}
            </p>
          )}
        </>
      )}
    </CardShell>
  )
}

// ── Resumo Executivo ───────────────────────────────────────────────────────────

function ResumoExecutivo({
  ctx,
  resumo,
}: {
  ctx: MunicipioCtx | null
  resumo: ResumoGeral | null
}) {
  const aprovPct = ctx ? ctx.munStats.taxa_aprovacao : (resumo?.taxa_aprovacao ?? 0)
  const reprovPct = ctx ? ctx.munStats.taxa_reprovacao : (resumo?.taxa_reprovacao ?? 0)
  const totalFichas = ctx ? ctx.munStats.total : (resumo?.total_fichas ?? 0)
  const ultimaComp = resumo?.ultima_competencia
  const pendFichas = ctx ? ctx.munStats.pendente : (resumo?.por_status.pendente?.fichas ?? 0)

  if (!ctx && !resumo) return null

  const semaforo = aprovPct >= 98
    ? { cor: 'var(--success)', label: 'Excelente' }
    : aprovPct >= 95
      ? { cor: 'var(--chart-amber)', label: 'Atenção' }
      : { cor: 'var(--danger)', label: 'Crítico' }

  // Alerta de crítico para o município
  const critico = ctx?.munStats.critico

  return (
    <div style={{
      padding: '16px 20px', borderRadius: 10,
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      marginBottom: 24, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: semaforo.cor }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: semaforo.cor }}>{semaforo.label}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total fichas</span>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtM(totalFichas)}</div>
        </div>
        <div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Taxa aprovação</span>
          <div style={{ fontWeight: 700, fontSize: 16, color: semaforo.cor }}>
            {aprovPct.toFixed(2).replace('.', ',')}%
          </div>
        </div>
        <div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Taxa reprovação</span>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--chart-amber)' }}>
            {reprovPct.toFixed(2).replace('.', ',')}%
          </div>
        </div>
        {pendFichas > 0 && (
          <div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pendentes</span>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--chart-blue)' }}>
              {fmtM(pendFichas)}
            </div>
          </div>
        )}
        {critico && (
          <div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Principal motivo reprov.</span>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--chart-amber)' }}>
              {String(critico.principal_motivo)}
            </div>
          </div>
        )}
        {ultimaComp && (
          <div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Última competência</span>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{labelComp(ultimaComp)}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function SisabValidacaoDashboard() {
  const { data: resumo, loading: lResumo } = useFetch<ResumoGeral>('/api/sisab/resumo_geral')
  const [ctx, setCtx] = useState<MunicipioCtx | null>(null)
  const [loadingCtx, setLoadingCtx] = useState(true)

  // Carrega perfil + dados do município (remontado pelo layout ao trocar município)
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
      const res = await fetch(`/api/sisab/municipio?ibge=${ibge}`)

      if (res.ok) {
        const munStats: MunicipioStats = await res.json()
        setCtx({ ibge, uf: mun.uf, nome: mun.nome, munStats })
      }
      setLoadingCtx(false)
    })
  }, [])

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          margin: 0,
          fontSize: 'clamp(18px, 3vw, 26px)',
          fontWeight: 800,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
        }}>
          Validação SISAB
          {ctx && (
            <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 12 }}>
              — {ctx.nome} / {ctx.uf}
            </span>
          )}
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
          {ctx
            ? `Aprovação, reprovação e pendências das fichas de produção`
            : 'Dados nacionais — selecione um município no topo para filtrar'}
        </p>
      </div>

      {/* Resumo executivo */}
      {(!lResumo || ctx) && !loadingCtx && (
        <ResumoExecutivo ctx={ctx} resumo={resumo} />
      )}

      {/* Grid de componentes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: 20,
      }}>
        {/* Linha 1 — Funil + Evolução temporal */}
        <SisabFunilProducao ctx={ctx} />
        <SisabEvolucaoTemporal />

        {/* Linha 2 — Motivos (full width) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <SisabMotivoReprovacao />
        </div>

        {/* Linha 3 — Municípios críticos (full width) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <SisabMunicipiosCriticos ctx={ctx} />
        </div>

        {/* Linha 4 — Pendentes */}
        <div style={{ gridColumn: '1 / -1' }}>
          <SisabPendentesProcessamento ctx={ctx} />
        </div>
      </div>
    </div>
  )
}
