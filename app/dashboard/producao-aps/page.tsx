'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────
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

interface Perfil {
  id: string
  municipio_ativo_id: string | null
  municipios: { id: string; nome: string } | null
  role: string
}

// ── Config ────────────────────────────────────────────────────────────────────
const TIPOS = [
  { key: 'atendimento_individual', label: 'At. Individual', cor: 'var(--chart-green)' },
  { key: 'procedimentos',          label: 'Procedimentos',  cor: 'var(--chart-blue)' },
  { key: 'visita_domiciliar',      label: 'Visita ACS',     cor: 'var(--chart-amber)' },
  { key: 'atendimento_odonto',     label: 'Odontológico',   cor: 'var(--chart-purple)' },
]

const MESES_CURTOS: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
}

function labelMes(competencia: string) {
  return MESES_CURTOS[competencia.slice(5, 7)] ?? competencia.slice(5, 7)
}

function fmt(n: number) { return n.toLocaleString('pt-BR') }

function pct(a: number, b: number) {
  if (b === 0) return null
  return ((a - b) / b) * 100
}

// ── Gerador de insights narrativos ────────────────────────────────────────────
interface Insight {
  tipo: 'alerta' | 'positivo' | 'neutro' | 'info'
  titulo: string
  descricao: string
  icon: string
}

function gerarInsights(dados: ProducaoMensal[]): Insight[] {
  if (dados.length < 2) return []
  const insights: Insight[] = []

  const media = dados.reduce((s, d) => s + d.total_producao, 0) / dados.length
  const ultimo = dados[dados.length - 1]
  const penultimo = dados[dados.length - 2]
  const melhor = dados.reduce((a, b) => a.total_producao > b.total_producao ? a : b)
  const pior = dados.reduce((a, b) => a.total_producao < b.total_producao ? a : b)

  // Variação do último mês
  const varUltimo = pct(ultimo.total_producao, penultimo.total_producao)
  if (varUltimo !== null) {
    if (varUltimo <= -15) {
      insights.push({
        tipo: 'alerta',
        titulo: `Queda de ${Math.abs(varUltimo).toFixed(1)}% em ${labelMes(ultimo.competencia)}`,
        descricao: `A produção total caiu de ${fmt(penultimo.total_producao)} para ${fmt(ultimo.total_producao)} atendimentos. ${
          labelMes(ultimo.competencia) === 'Dez' || labelMes(ultimo.competencia) === 'Jan'
            ? 'Queda esperada para o período de festas e férias.'
            : 'Verifique possíveis causas operacionais nas equipes.'
        }`,
        icon: '📉',
      })
    } else if (varUltimo >= 10) {
      insights.push({
        tipo: 'positivo',
        titulo: `Alta de ${varUltimo.toFixed(1)}% em ${labelMes(ultimo.competencia)}`,
        descricao: `Crescimento expressivo: de ${fmt(penultimo.total_producao)} para ${fmt(ultimo.total_producao)} atendimentos no mês.`,
        icon: '📈',
      })
    }
  }

  // Mês de pico
  insights.push({
    tipo: 'info',
    titulo: `Pico em ${labelMes(melhor.competencia)} com ${fmt(melhor.total_producao)} atendimentos`,
    descricao: `Representa ${((melhor.total_producao / media - 1) * 100).toFixed(1)}% acima da média mensal de ${fmt(Math.round(media))} atendimentos.`,
    icon: '🏆',
  })

  // Mês mais baixo
  const varPior = pct(pior.total_producao, media)
  if (varPior !== null && varPior < -10) {
    insights.push({
      tipo: varPior < -25 ? 'alerta' : 'neutro',
      titulo: `Menor produção em ${labelMes(pior.competencia)}: ${fmt(pior.total_producao)}`,
      descricao: `${Math.abs(varPior).toFixed(1)}% abaixo da média anual. ${
        labelMes(pior.competencia) === 'Dez' || labelMes(pior.competencia) === 'Jan'
          ? 'Sazonalidade típica de fim/início de ano.'
          : 'Pode indicar subnotificação ou problemas operacionais.'
      }`,
      icon: varPior < -25 ? '⚠️' : 'ℹ️',
    })
  }

  // Tipo que mais cresceu (primeiro vs último mês)
  const crescimentos = TIPOS.map(t => {
    const key = t.key as keyof ProducaoMensal
    const inicio = dados[0][key] as number
    const fim = dados[dados.length - 1][key] as number
    return { label: t.label, cor: t.cor, var: pct(fim, inicio) ?? 0 }
  }).sort((a, b) => b.var - a.var)

  const topCrescimento = crescimentos[0]
  if (topCrescimento.var > 5) {
    insights.push({
      tipo: 'positivo',
      titulo: `${topCrescimento.label} cresceu ${topCrescimento.var.toFixed(1)}% no ano`,
      descricao: `Comparando ${labelMes(dados[0].competencia)} com ${labelMes(ultimo.competencia)}, este tipo de atendimento apresentou o maior crescimento proporcional.`,
      icon: '💡',
    })
  }

  // Consistência: quantos meses acima da média
  const mesesAcima = dados.filter(d => d.total_producao >= media).length
  const pctAcima = (mesesAcima / dados.length) * 100
  insights.push({
    tipo: pctAcima >= 50 ? 'positivo' : 'neutro',
    titulo: `${mesesAcima} de ${dados.length} meses acima da média`,
    descricao: `Média anual de ${fmt(Math.round(media))} atendimentos/mês. ${
      pctAcima >= 60
        ? 'Produção consistentemente acima da média — boa regularidade.'
        : 'Produção com variações — analise os meses abaixo da média.'
    }`,
    icon: pctAcima >= 50 ? '✅' : '📊',
  })

  return insights
}

// ── Insight Card ──────────────────────────────────────────────────────────────
function InsightCard({ insight }: { insight: Insight }) {
  const cores = {
    alerta:   { bg: 'var(--danger-subtle)',   border: 'var(--danger)',   text: 'var(--danger)' },
    positivo: { bg: 'var(--success-subtle)',  border: 'var(--success)',  text: 'var(--success)' },
    neutro:   { bg: 'var(--bg-surface-2)',    border: 'var(--border)',    text: 'var(--text-muted)' },
    info:     { bg: 'var(--info-subtle)',     border: 'var(--info)',     text: 'var(--info)' },
  }
  const c = cores[insight.tipo]

  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.3 }} aria-hidden="true">{insight.icon}</span>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
          {insight.titulo}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {insight.descricao}
        </p>
      </div>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, valor, cor, variacao, compact }: {
  label: string; valor: number; cor: string; variacao?: number | null; compact?: boolean
}) {
  return (
    <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10 }}>
      <div style={{ position: 'absolute', top: -40, right: -20, width: 100, height: 100, background: cor, opacity: 0.07, borderRadius: '50%', filter: 'blur(28px)', pointerEvents: 'none' }} />
      <div>
        <span style={{ fontSize: compact ? 11 : 12, color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1.3, display: 'block' }}>{label}</span>
      </div>
      <div>
        <span style={{ fontSize: 'clamp(18px, 4vw, 30px)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', lineHeight: 1 }}>
          {fmt(valor)}
        </span>
        {variacao != null && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: variacao >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
              {variacao >= 0 ? '▲' : '▼'} {Math.abs(variacao).toFixed(1)}%
            </span>
            {!compact && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>vs mês anterior</span>}
          </div>
        )}
      </div>
      <div style={{ height: 3, borderRadius: 4, background: `linear-gradient(90deg, ${cor}, transparent)`, marginTop: 'auto' }} />
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '12px 16px', boxShadow: 'var(--shadow-md)', fontSize: 13 }}>
      <p style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 4 }}>
          <span style={{ color: p.color, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
            {p.name}
          </span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Total</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmt(payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0))}</span>
        </div>
      )}
    </div>
  )
}

// ── Chart Card ────────────────────────────────────────────────────────────────
function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: subtitle ? 3 : 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>
      <div style={{ padding: '20px 24px' }}>{children}</div>
    </div>
  )
}

// ── Resumo último mês ─────────────────────────────────────────────────────────

function ResumoUltimoMesCard({ dados, isMobile }: { dados: ProducaoMensal[]; isMobile: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgW, setSvgW] = useState(400)

  useEffect(() => {
    const update = () => { if (containerRef.current) setSvgW(containerRef.current.offsetWidth) }
    update()
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const ultimos6 = dados.slice(-6)
  const ultimo = dados[dados.length - 1]
  const anterior = dados[dados.length - 2]
  if (!ultimo) return null

  const totalAtual = ultimo.total_producao
  const totalAnterior = anterior?.total_producao ?? 0
  const varPct = totalAnterior > 0 ? ((totalAtual - totalAnterior) / totalAnterior) * 100 : null
  const alerta = varPct !== null && varPct < -15
  const maxTipo = Math.max(ultimo.atendimento_individual, ultimo.atendimento_odonto, ultimo.procedimentos, ultimo.visita_domiciliar)

  // Sparkline
  const VW = svgW, VH = 56, padX = 8, padY = 8
  const values = ultimos6.map(d => d.total_producao)
  const minV = Math.min(...values), maxV = Math.max(...values)
  const range = maxV - minV || 1
  const pts = values.map((v, i) => ({
    x: padX + (i / Math.max(values.length - 1, 1)) * (VW - padX * 2),
    y: padY + (1 - (v - minV) / range) * (VH - padY * 2),
  }))
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${VH} L${pts[0].x.toFixed(1)},${VH} Z`

  const bars = [
    { label: 'At. Individual', value: ultimo.atendimento_individual, color: 'var(--chart-green)' },
    { label: 'Odontológico',   value: ultimo.atendimento_odonto,     color: 'var(--chart-purple)' },
    { label: 'Procedimentos',  value: ultimo.procedimentos,          color: 'var(--chart-amber)' },
    { label: 'Visita ACS',     value: ultimo.visita_domiciliar,      color: 'var(--chart-blue)' },
  ]

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${alerta ? 'var(--danger)' : 'var(--border)'}`,
      borderRadius: 16, padding: '20px 24px',
      boxShadow: 'var(--shadow-sm)', marginBottom: 24,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
            Último mês registrado
          </h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {labelMes(ultimo.competencia)}/{ultimo.ano}
          </span>
        </div>
        {varPct !== null && (
          <span style={{
            fontSize: 12, fontWeight: 700, borderRadius: 20, padding: '3px 10px',
            background: varPct >= 0 ? 'var(--success-subtle)' : 'var(--danger-subtle)',
            color: varPct >= 0 ? 'var(--success)' : 'var(--danger)',
          }}>
            {varPct >= 0 ? '+' : ''}{varPct.toFixed(1)}%
          </span>
        )}
      </div>

      {alerta && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--danger-subtle)', border: '1px solid var(--danger)',
          borderRadius: 8, padding: '7px 12px', marginBottom: 14, color: 'var(--danger)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Queda acentuada em relação ao mês anterior</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 24 }}>
        {/* Esquerda: total + sparkline */}
        <div>
          <div style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>
              {fmt(totalAtual)}
            </span>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>atendimentos no mês</p>
          </div>
          {ultimos6.length >= 2 && (
            <div ref={containerRef}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Tendência — {ultimos6.length} meses
              </span>
              <div style={{ marginTop: 6 }}>
                <svg width={VW} height={VH} viewBox={`0 0 ${VW} ${VH}`} style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="Sparkline de tendência dos últimos 6 meses">
                  <defs>
                    <linearGradient id="apsSparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={area} fill="url(#apsSparkGrad)" />
                  <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  {pts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y}
                      r={i === pts.length - 1 ? 4 : 2.5}
                      fill={i === pts.length - 1 ? 'var(--accent)' : 'var(--bg-card)'}
                      stroke="var(--accent)"
                      strokeWidth={i === pts.length - 1 ? 0 : 1.5}
                    />
                  ))}
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, paddingLeft: padX, paddingRight: padX }}>
                  {ultimos6.map((d, i) => (
                    <span key={i} style={{
                      fontSize: 10,
                      color: i === ultimos6.length - 1 ? 'var(--text-secondary)' : 'var(--text-muted)',
                      fontWeight: i === ultimos6.length - 1 ? 600 : 400,
                    }}>
                      {labelMes(d.competencia)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Direita: barras por tipo */}
        <div style={{ paddingTop: isMobile ? 0 : 4 }}>
          {bars.map(({ label, value, color }) => {
            const pctBar = maxTipo > 0 ? (value / maxTipo) * 100 : 0
            return (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(value)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: 'var(--bg-surface-2)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, width: `${pctBar}%`, background: color, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Empty ─────────────────────────────────────────────────────────────────────
function EmptyState({ municipioNome }: { municipioNome: string }) {
  return (
    <div style={{ padding: '60px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }} aria-hidden="true">📭</div>
      <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Nenhum dado encontrado</p>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 340, margin: '0 auto' }}>
        Não há dados de produção APS para {municipioNome} neste período. Importe os CSVs do SISAB.
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProducaoApsPage() {
  const [dados, setDados]     = useState<ProducaoMensal[]>([])
  const [anos, setAnos]       = useState<number[]>([])
  const [anoSel, setAnoSel]   = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [perfil, setPerfil]   = useState<any>(null)
  const [tiposVisiveis, setTiposVisiveis] = useState<Set<string>>(new Set(TIPOS.map(t => t.key)))
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data } = await supabase
        .from('perfis')
        .select('id, role, municipio_ativo_id, municipios:municipio_ativo_id(id, nome)')
        .eq('id', session.user.id).single()
      if (data) setPerfil(data)
    })
  }, [])

  const fetchDados = useCallback(async (municipioId: string, ano: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard/producao-aps?municipio_id=${municipioId}&ano=${ano}`)
      const json = await res.json()
      if (res.ok) { setDados(json.data ?? []); setAnos(json.anos ?? []) }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (perfil?.municipio_ativo_id) {
      fetchDados(perfil.municipio_ativo_id, anoSel)
    }
  }, [perfil, anoSel, fetchDados])

  // ── Derivados ──────────────────────────────────────────────────────────────
  const municipioNome = dados[0]?.municipio_nome ?? perfil?.municipios?.nome ?? '—'
  const uf = dados[0]?.uf ?? ''

  const totaisAnuais = TIPOS.reduce((acc, t) => {
    acc[t.key] = dados.reduce((s, d) => s + (d[t.key as keyof ProducaoMensal] as number ?? 0), 0)
    return acc
  }, {} as Record<string, number>)

  const totalGeral = Object.values(totaisAnuais).reduce((s, v) => s + v, 0)
  const media = dados.length > 0 ? Math.round(totalGeral / dados.length) : 0

  const variacoes = TIPOS.reduce((acc, t) => {
    if (dados.length >= 2) {
      const ult  = dados[dados.length - 1][t.key as keyof ProducaoMensal] as number
      const ante = dados[dados.length - 2][t.key as keyof ProducaoMensal] as number
      acc[t.key] = ante > 0 ? ((ult - ante) / ante) * 100 : null
    } else { acc[t.key] = null }
    return acc
  }, {} as Record<string, number | null>)

  const insights = gerarInsights(dados)

  const chartData = dados.map(d => ({
    mes: labelMes(d.competencia),
    atendimento_individual: d.atendimento_individual,
    atendimento_odonto:     d.atendimento_odonto,
    procedimentos:          d.procedimentos,
    visita_domiciliar:      d.visita_domiciliar,
    total:                  d.total_producao,
  }))

  const toggleTipo = (key: string) => {
    setTiposVisiveis(prev => {
      const next = new Set(prev)
      if (next.has(key)) { if (next.size > 1) next.delete(key) }
      else next.add(key)
      return next
    })
  }

  // ── Participação % por tipo ────────────────────────────────────────────────
  const participacao = TIPOS.map(t => ({
    ...t,
    total: totaisAnuais[t.key],
    pct: totalGeral > 0 ? (totaisAnuais[t.key] / totalGeral * 100) : 0,
  })).sort((a, b) => b.total - a.total)

  return (
    <div style={{ maxWidth: 1100 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .tipo-pill { padding: 5px 12px; border-radius: 20px; border: 1px solid var(--border-input); background: transparent; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 500; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
        .tipo-pill.ativo { border-color: transparent; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Produção APS
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {municipioNome}{uf ? ` · ${uf}` : ''} · SISAB {anoSel}
          </p>
        </div>
        {anos.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {anos.map(a => (
              <button key={a} onClick={() => setAnoSel(a)} style={{
                padding: '10px 18px', borderRadius: 20, minHeight: 44,
                border: '1px solid var(--border-input)',
                background: anoSel === a ? 'var(--accent-subtle)' : 'transparent',
                borderColor: anoSel === a ? 'var(--accent-border)' : 'var(--border-input)',
                color: anoSel === a ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 13, fontWeight: anoSel === a ? 600 : 500,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
              }}>{a}</button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '80px 0' }}>
          <div className="spinner" />
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Carregando dados de produção…</span>
        </div>
      ) : dados.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16 }}>
          <EmptyState municipioNome={municipioNome} />
        </div>
      ) : (
        <>
          {/* Resumo último mês */}
          <ResumoUltimoMesCard dados={dados} isMobile={isMobile} />

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16, marginBottom: 24 }}>
            <KpiCard label="Total Anual" valor={totalGeral} cor="var(--accent)" compact={isMobile} />
            {TIPOS.map(t => (
              <KpiCard key={t.key} label={t.label} valor={totaisAnuais[t.key]} cor={t.cor} variacao={variacoes[t.key]} compact={isMobile} />
            ))}
          </div>

          {/* Insights narrativos */}
          {insights.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                Análise do período
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                {insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
              </div>
            </div>
          )}

          {/* Filtro tipos */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Exibir:</span>
            {TIPOS.map(t => (
              <button key={t.key} onClick={() => toggleTipo(t.key)}
                className={`tipo-pill${tiposVisiveis.has(t.key) ? ' ativo' : ''}`}
                style={tiposVisiveis.has(t.key)
                  ? { background: t.cor + '22', borderColor: t.cor + '66', color: t.cor }
                  : { color: 'var(--text-dim)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: tiposVisiveis.has(t.key) ? t.cor : 'var(--border-strong)', display: 'inline-block' }} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Gráfico linha */}
          <ChartCard title="Evolução mensal" subtitle={`Produção por tipo · média ${fmt(media)} atendimentos/mês`}>
            <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} width={40} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }}
                  formatter={v => <span style={{ color: 'var(--text-secondary)' }}>{v}</span>} />
                {TIPOS.filter(t => tiposVisiveis.has(t.key)).map(t => (
                  <Line key={t.key} type="monotone" dataKey={t.key} name={t.label} stroke={t.cor}
                    strokeWidth={2} dot={{ r: 3, fill: t.cor, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <div style={{ height: 20 }} />

          {/* Participação + Barra lado a lado */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', gap: 16, marginBottom: 20 }}>
            {/* Participação % */}
            <ChartCard title="Composição anual" subtitle="Participação por tipo">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {participacao.map(t => (
                  <div key={t.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.cor, display: 'inline-block' }} />
                        {t.label}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: t.cor }}>{t.pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: 'var(--bg-surface-2)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${t.pct}%`, background: t.cor, borderRadius: 4, transition: 'width 0.8s ease' }} />
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>{fmt(t.total)} atendimentos</p>
                  </div>
                ))}
              </div>
            </ChartCard>

            {/* Barras empilhadas */}
            <ChartCard title="Composição mensal" subtitle="Volume por tipo de atendimento">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={media} stroke="var(--accent)" strokeDasharray="4 4" strokeWidth={1}
                    label={{ value: 'Média', position: 'insideTopRight', fill: 'var(--accent)', fontSize: 11 }} />
                  {TIPOS.filter(t => tiposVisiveis.has(t.key)).map(t => (
                    <Bar key={t.key} dataKey={t.key} name={t.label} fill={t.cor} stackId="a" />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Tabela */}
          <ChartCard title="Detalhamento mensal" subtitle="Todos os tipos de produção">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }} role="table" aria-label="Detalhamento mensal de produção APS">
                <thead>
                  <tr style={{ background: 'var(--bg-surface-2)' }}>
                    {['Competência', ...TIPOS.map(t => t.label), 'Total', 'vs Média'].map(h => (
                      <th key={h} style={{ padding: '11px 16px', textAlign: h === 'Competência' ? 'left' : 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dados.map(d => {
                    const varMedia = pct(d.total_producao, media)
                    return (
                      <tr key={d.competencia} className="table-row">
                        <td style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                          {labelMes(d.competencia)}/{d.ano}
                        </td>
                        {TIPOS.map(t => (
                          <td key={t.key} style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right' }}>
                            {fmt(d[t.key as keyof ProducaoMensal] as number)}
                          </td>
                        ))}
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>
                          {fmt(d.total_producao)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {varMedia !== null && (
                            <span style={{ fontSize: 12, fontWeight: 600, color: varMedia >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {varMedia >= 0 ? '+' : ''}{varMedia.toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--bg-surface-2)', borderTop: '2px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Total {anoSel}</td>
                    {TIPOS.map(t => (
                      <td key={t.key} style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textAlign: 'right' }}>
                        <span style={{ color: t.cor }}>{fmt(totaisAnuais[t.key])}</span>
                      </td>
                    ))}
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: 'var(--accent)', textAlign: 'right' }}>
                      {fmt(totalGeral)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
                      Média: {fmt(media)}/mês
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  )
}