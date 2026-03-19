'use client'

// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/producao-ambulatorial/page.tsx
// Produção Ambulatorial por Complexidade — SIASUS 2024 vs 2025
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'

// ── tipos ──────────────────────────────────────────────────────────────────

interface RowAmbulatorial {
  ano: number
  nome_municipio: string
  uf: string
  atencao_basica: number
  media_complexidade: number
  alta_complexidade: number
  nao_se_aplica: number
  total: number
  pct_atencao_basica: number
  pct_media_complexidade: number
  pct_alta_complexidade: number
  pct_nao_se_aplica: number
}

// ── configuração de complexidades ──────────────────────────────────────────

const COMPLEXIDADES = [
  { key: 'atencao_basica',     pctKey: 'pct_atencao_basica',     label: 'Atenção Básica',     labelCurto: 'AB',  cor: 'var(--chart-green)' },
  { key: 'media_complexidade', pctKey: 'pct_media_complexidade', label: 'Média Complexidade', labelCurto: 'MC',  cor: 'var(--chart-blue)' },
  { key: 'alta_complexidade',  pctKey: 'pct_alta_complexidade',  label: 'Alta Complexidade',  labelCurto: 'AC',  cor: 'var(--chart-purple)' },
  { key: 'nao_se_aplica',      pctKey: 'pct_nao_se_aplica',      label: 'Não se Aplica',      labelCurto: 'NA',  cor: 'var(--chart-slate)' },
] as const

// ── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString('pt-BR') }
function fmtPct(n: number) { return `${n.toFixed(1)}%` }

function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null
  return +((( atual - anterior) / anterior) * 100).toFixed(1)
}

// ── gerador de insight narrativo ──────────────────────────────────────────

function gerarInsight(dados: RowAmbulatorial[]): { titulo: string; texto: string; tipo: 'info' | 'positivo' | 'alerta' | 'neutro' } {
  const r2025 = dados.find(d => d.ano === 2025)
  const r2024 = dados.find(d => d.ano === 2024)
  const ref = r2025 ?? r2024
  if (!ref) return { titulo: 'Sem dados suficientes', texto: 'Importe os CSVs do SIASUS para visualizar o perfil do município.', tipo: 'neutro' }

  const nome = ref.nome_municipio

  // perfil dominante
  const dominante = COMPLEXIDADES.slice(0, 3).reduce((a, b) =>
    (ref[a.pctKey] ?? 0) >= (ref[b.pctKey] ?? 0) ? a : b
  )
  const pctDom = ref[dominante.pctKey] ?? 0

  let titulo = ''
  let texto  = ''
  let tipo: 'info' | 'positivo' | 'alerta' | 'neutro' = 'info'

  if (dominante.key === 'alta_complexidade' && pctDom >= 50) {
    titulo = `${nome} é polo de alta complexidade`
    texto  = `${fmtPct(pctDom)} dos procedimentos ambulatoriais são de Alta Complexidade, caracterizando o município como referência regional para atendimentos especializados de maior densidade tecnológica.`
    tipo   = 'info'
  } else if (dominante.key === 'media_complexidade' && pctDom >= 35) {
    titulo = `Perfil de média complexidade predominante`
    texto  = `${fmtPct(pctDom)} da produção ambulatorial de ${nome} é de Média Complexidade. Esse perfil indica estrutura consolidada de serviços especializados sem concentrar alta tecnologia.`
    tipo   = 'info'
  } else if (dominante.key === 'atencao_basica' && pctDom >= 40) {
    titulo = `Produção ambulatorial com foco na Atenção Básica`
    texto  = `${fmtPct(pctDom)} dos procedimentos em ${nome} são classificados como Atenção Básica, refletindo um sistema municipal com forte cobertura de serviços primários.`
    tipo   = 'positivo'
  } else {
    titulo = `Perfil misto de complexidade`
    texto  = `${nome} apresenta distribuição equilibrada entre os níveis de complexidade, sem um perfil dominante claro. Atenção Básica: ${fmtPct(ref.pct_atencao_basica)}, Média: ${fmtPct(ref.pct_media_complexidade)}, Alta: ${fmtPct(ref.pct_alta_complexidade)}.`
    tipo   = 'neutro'
  }

  // adiciona comparativo 2024→2025 quando disponível
  if (r2024 && r2025) {
    const var_ = variacao(r2025.total, r2024.total)
    if (var_ !== null) {
      const sinal = var_ >= 0 ? `crescimento de ${var_}%` : `queda de ${Math.abs(var_)}%`
      texto += ` Em relação a 2024, houve ${sinal} no total ambulatorial (${fmt(r2024.total)} → ${fmt(r2025.total)} procedimentos).`
      if (var_ >= 10) tipo = 'positivo'
      if (var_ <= -10) tipo = 'alerta'
    }
  }

  return { titulo, texto, tipo }
}

// ── componentes reutilizáveis ──────────────────────────────────────────────

function Skeleton({ h = 20, radius = 6, w = '100%' }: { h?: number; radius?: number; w?: string }) {
  return (
    <div style={{ width: w, height: h, borderRadius: radius, background: 'var(--bg-surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
  )
}

function KpiCard({ label, valor, cor, variacaoPct, sub, compact, highlight }: {
  label: string; valor: number; cor: string; variacaoPct?: number | null; sub?: string; compact?: boolean; highlight?: boolean
}) {
  return (
    <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gridColumn: highlight && !compact ? 'span 2' : undefined }}>
      <div style={{ position: 'absolute', top: -40, right: -20, width: 110, height: 110, background: cor, opacity: 0.07, borderRadius: '50%', filter: 'blur(28px)', pointerEvents: 'none' }} />
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: compact ? 11 : 13, color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1.3, display: 'block' }}>{label}</span>
      </div>
      <span style={{ fontSize: highlight ? 'clamp(22px, 5vw, 40px)' : 'clamp(18px, 4vw, 32px)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', lineHeight: 1 }}>
        {fmt(valor)}
      </span>
      {sub && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</p>}
      {variacaoPct != null && (
        <div style={{ marginTop: 8, marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 5,
          background: variacaoPct >= 0 ? 'var(--success-subtle)' : 'var(--danger-subtle)',
          border: `1px solid ${variacaoPct >= 0 ? 'var(--success)' : 'var(--danger)'}`,
          borderRadius: 20, padding: '3px 10px',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: variacaoPct >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {variacaoPct >= 0 ? '▲' : '▼'} {Math.abs(variacaoPct).toFixed(1)}%
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>vs 2024</span>
        </div>
      )}
      <div style={{ height: 3, borderRadius: 4, marginTop: 'auto', background: `linear-gradient(90deg, ${cor}, transparent)` }} />
    </div>
  )
}

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

function InsightCard({ insight }: { insight: ReturnType<typeof gerarInsight> }) {
  const cores = {
    info:     { bg: 'var(--info-subtle)',    border: 'var(--info)',    icon: 'var(--info)' },
    positivo: { bg: 'var(--success-subtle)', border: 'var(--success)', icon: 'var(--success)' },
    alerta:   { bg: 'var(--danger-subtle)',  border: 'var(--danger)',  icon: 'var(--danger)' },
    neutro:   { bg: 'var(--bg-surface-2)',   border: 'var(--border)',   icon: 'var(--text-muted)' },
  }
  const c = cores[insight.tipo]
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 14, padding: '18px 20px', display: 'flex', gap: 14 }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.icon} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5, fontFamily: 'Syne, sans-serif' }}>
          {insight.titulo}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{insight.texto}</p>
      </div>
    </div>
  )
}

// ── tooltip compartilhado ─────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '12px 16px', boxShadow: 'var(--shadow-md)', fontSize: 13, minWidth: 180 }}>
      <p style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey ?? p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 4 }}>
          <span style={{ color: p.color ?? p.fill, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color ?? p.fill, display: 'inline-block' }} />
            {p.name}
          </span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── page ───────────────────────────────────────────────────────────────────

export default function ProducaoAmbulatorialPage() {
  const [dados, setDados]   = useState<RowAmbulatorial[]>([])
  const [loading, setLoading] = useState(true)
  const [perfil, setPerfil] = useState<any>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Carrega o perfil do usuário logado
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

  const fetchDados = useCallback(async (municipioId: string) => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/dashboard/producao-ambulatorial?municipio_id=${municipioId}`)
      const json = await res.json()
      if (res.ok) setDados(json.dados ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (perfil?.municipio_ativo_id) {
      fetchDados(perfil.municipio_ativo_id)
    }
  }, [perfil, fetchDados])

  // ── derivações ─────────────────────────────────────────────────────────

  const r2024 = dados.find(d => d.ano === 2024) ?? null
  const r2025 = dados.find(d => d.ano === 2025) ?? null
  const refAno = r2025 ?? r2024
  const municipioNome = refAno?.nome_municipio ?? perfil?.municipios?.nome ?? '—'
  const uf = refAno?.uf ?? ''

  const varTotal = r2024 && r2025 ? variacao(r2025.total, r2024.total) : null
  const insight  = gerarInsight(dados)

  // dados do gráfico de barras agrupadas (AB, MC, AC, NA)
  const barData = COMPLEXIDADES.map(c => ({
    name: c.labelCurto,
    label: c.label,
    '2024': r2024 ? r2024[c.key as keyof RowAmbulatorial] as number : 0,
    '2025': r2025 ? r2025[c.key as keyof RowAmbulatorial] as number : 0,
  }))

  // dados do donut (ano mais recente disponível)
  const donutData = refAno ? COMPLEXIDADES.map(c => ({
    name: c.label,
    value: refAno[c.key as keyof RowAmbulatorial] as number,
    fill: c.cor,
    pct: refAno[c.pctKey as keyof RowAmbulatorial] as number,
  })).filter(d => d.value > 0) : []

  // ── render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100, width: '100%', minWidth: 0 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ marginBottom: 26 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5 }}>
          Produção Ambulatorial
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {municipioNome}{uf ? ` · ${uf}` : ''} · SIASUS · comparativo 2024 vs 2025
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '80px 0' }}>
          <div className="spinner" />
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Carregando produção ambulatorial…</span>
        </div>
      ) : dados.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '60px 24px', textAlign: 'center' }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ margin: '0 auto 16px' }}>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Nenhum dado encontrado</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 360, margin: '0 auto' }}>
            Não há dados ambulatoriais para {municipioNome}. Importe os CSVs do SIASUS usando o ETL.
          </p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16, marginBottom: 24 }}>
            {r2025 && (
              <KpiCard label="Total Ambulatorial 2025" valor={r2025.total} cor="var(--chart-green)" sub="procedimentos SIASUS" variacaoPct={varTotal} compact={isMobile} highlight />
            )}
            {r2024 && (
              <KpiCard label="Total Ambulatorial 2024" valor={r2024.total} cor="var(--chart-indigo)" sub="procedimentos SIASUS" compact={isMobile} />
            )}
            {refAno && (
              <KpiCard
                label={`Alta Complexidade ${refAno.ano}`}
                valor={refAno.alta_complexidade}
                cor="var(--chart-purple)"
                sub={`${fmtPct(refAno.pct_alta_complexidade)} do total`}
                compact={isMobile}
              />
            )}
            {refAno && (
              <KpiCard
                label={`Atenção Básica ${refAno.ano}`}
                valor={refAno.atencao_basica}
                cor="var(--chart-green)"
                sub={`${fmtPct(refAno.pct_atencao_basica)} do total`}
                compact={isMobile}
              />
            )}
          </div>

          {/* Gráficos */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 20, marginBottom: 20 }}>

            {/* Barras agrupadas 2024 vs 2025 */}
            <ChartCard
              title="Comparativo 2024 vs 2025 por complexidade"
              subtitle="Procedimentos ambulatoriais — SIASUS"
            >
              <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
                <BarChart data={barData} margin={{ top: 5, right: 16, left: 10, bottom: 5 }} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    axisLine={false} tickLine={false} width={50}
                    tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                    formatter={v => <span style={{ color: 'var(--text-secondary)' }}>{v}</span>} />
                  {r2024 && <Bar dataKey="2024" name="2024" fill="var(--chart-indigo)" radius={[4, 4, 0, 0]} />}
                  {r2025 && <Bar dataKey="2025" name="2025" fill="var(--chart-green)" radius={[4, 4, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Donut composição do ano mais recente */}
            <ChartCard
              title={`Composição ${refAno?.ano}`}
              subtitle="Participação % por complexidade"
            >
              <div style={{ position: 'relative', height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%" cy="50%"
                      innerRadius={58} outerRadius={85}
                      dataKey="value"
                      stroke="none"
                      paddingAngle={2}
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const p = payload[0].payload
                        return (
                          <div style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
                            <p style={{ color: p.fill, fontWeight: 600, marginBottom: 4 }}>{p.name}</p>
                            <p style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmt(p.value)}</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmtPct(p.pct)}</p>
                          </div>
                        )
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* label central do donut */}
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center', pointerEvents: 'none',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Total</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', lineHeight: 1.1 }}>
                    {refAno ? fmt(refAno.total) : '—'}
                  </div>
                </div>
              </div>

              {/* Legenda manual */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {donutData.map(d => (
                  <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: d.fill, display: 'inline-block', flexShrink: 0 }} />
                      {d.name}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: d.fill }}>{fmtPct(d.pct)}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          {/* Insight narrativo */}
          <div style={{ marginBottom: 20 }}>
            <InsightCard insight={insight} />
          </div>

          {/* Tabela detalhada */}
          <ChartCard title="Detalhamento por complexidade" subtitle="Valores absolutos e participação percentual">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }} role="table" aria-label="Detalhamento por complexidade ambulatorial">
                <thead>
                  <tr style={{ background: 'var(--bg-surface-2)' }}>
                    <th style={thStyle('left')}>Complexidade</th>
                    {r2024 && <>
                      <th style={thStyle()}>2024 (proc.)</th>
                      <th style={thStyle()}>2024 (%)</th>
                    </>}
                    {r2025 && <>
                      <th style={thStyle()}>2025 (proc.)</th>
                      <th style={thStyle()}>2025 (%)</th>
                    </>}
                    {r2024 && r2025 && <th style={thStyle()}>Variação</th>}
                  </tr>
                </thead>
                <tbody>
                  {COMPLEXIDADES.map(c => {
                    const v24 = r2024 ? r2024[c.key as keyof RowAmbulatorial] as number : null
                    const v25 = r2025 ? r2025[c.key as keyof RowAmbulatorial] as number : null
                    const p24 = r2024 ? r2024[c.pctKey as keyof RowAmbulatorial] as number : null
                    const p25 = r2025 ? r2025[c.pctKey as keyof RowAmbulatorial] as number : null
                    const var_ = v24 != null && v25 != null ? variacao(v25, v24) : null

                    return (
                      <tr key={c.key} className="table-row">
                        <td style={{ padding: '13px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: c.cor, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{c.label}</span>
                          </div>
                        </td>
                        {r2024 && <>
                          <td style={tdStyle()}>{v24 != null ? fmt(v24) : '—'}</td>
                          <td style={tdStyle()}>
                            {p24 != null && (
                              <span style={{ color: c.cor, fontWeight: 600 }}>{fmtPct(p24)}</span>
                            )}
                          </td>
                        </>}
                        {r2025 && <>
                          <td style={tdStyle()}>{v25 != null ? fmt(v25) : '—'}</td>
                          <td style={tdStyle()}>
                            {p25 != null && (
                              <span style={{ color: c.cor, fontWeight: 600 }}>{fmtPct(p25)}</span>
                            )}
                          </td>
                        </>}
                        {r2024 && r2025 && (
                          <td style={tdStyle()}>
                            {var_ != null && (
                              <span style={{ fontSize: 12, fontWeight: 700, color: var_ >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                {var_ >= 0 ? '+' : ''}{var_}%
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--bg-surface-2)', borderTop: '2px solid var(--border)' }}>
                    <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      Total
                    </td>
                    {r2024 && <>
                      <td style={{ ...tdStyle(), fontWeight: 700, color: 'var(--accent)' }}>{fmt(r2024.total)}</td>
                      <td style={tdStyle()}>100%</td>
                    </>}
                    {r2025 && <>
                      <td style={{ ...tdStyle(), fontWeight: 700, color: 'var(--accent)' }}>{fmt(r2025.total)}</td>
                      <td style={tdStyle()}>100%</td>
                    </>}
                    {r2024 && r2025 && (
                      <td style={tdStyle()}>
                        {varTotal != null && (
                          <span style={{ fontSize: 13, fontWeight: 700, color: varTotal >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {varTotal >= 0 ? '+' : ''}{varTotal}%
                          </span>
                        )}
                      </td>
                    )}
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

// ── estilos de tabela ──────────────────────────────────────────────────────

function thStyle(align: 'left' | 'right' = 'right'): React.CSSProperties {
  return {
    padding: '11px 16px', textAlign: align,
    fontSize: 11, fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    whiteSpace: 'nowrap',
  }
}

function tdStyle(): React.CSSProperties {
  return { padding: '13px 16px', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right' }
}
