'use client'

// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/page.tsx  —  Visão Geral
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ── tipos ──────────────────────────────────────────────────────────────────

interface UsuarioRecente {
  id: string
  nome: string
  email: string
  role: string
  ativo: boolean
  criado_em: string
  municipios: { id: string; nome: string } | null
}

interface ProducaoResumo {
  competencia: string
  atendimento_individual: number
  atendimento_odonto: number
  procedimentos: number
  visita_domiciliar: number
}

interface OverviewData {
  usuarios: { total: number; ativos: number; inativos: number }
  municipiosAtivos: number
  recentes: UsuarioRecente[]
  producao: { ultimo: ProducaoResumo | null; anterior: ProducaoResumo | null }
  anual: { total: number; mesesComDados: number; anoAtual: number } | null
}

// ── ícones SVG ─────────────────────────────────────────────────────────────

const IcoUsers = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const IcoUserCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/>
    <polyline points="17 11 19 13 23 9"/>
  </svg>
)
const IcoUserMinus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/>
    <line x1="23" y1="11" x2="17" y2="11"/>
  </svg>
)
const IcoBuilding = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)

// ── skeleton ───────────────────────────────────────────────────────────────

function Skeleton({ w = '100%', h = 20, radius = 6 }: { w?: string | number; h?: number; radius?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: radius,
      background: 'var(--bg-surface-2)',
      animation: 'pulse 1.5s ease-in-out infinite',
    }} />
  )
}

// ── KPI card ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, icon, loading, compact }: {
  label: string; value: number; sub: string; accent: string; icon: React.ReactNode; loading: boolean; compact?: boolean
}) {
  return (
    <div className="kpi-card"
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = accent + '55' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}
    >
      <div style={{
        position: 'absolute', top: -40, right: -20,
        width: 120, height: 120,
        background: accent, opacity: 0.07,
        borderRadius: '50%', filter: 'blur(30px)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: compact ? 8 : 12 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: compact ? 11 : 13, fontWeight: 500, lineHeight: 1.3 }}>{label}</span>
        {!compact && (
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: accent + '18',
            border: `1px solid ${accent}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: accent, flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
      </div>

      <div style={{ marginBottom: compact ? 10 : 16 }}>
        {loading ? (
          <Skeleton w={60} h={compact ? 24 : 36} />
        ) : (
          <span style={{
            fontSize: 'clamp(18px, 4vw, 36px)', fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'Syne, sans-serif',
            lineHeight: 1,
          }}>
            {value.toLocaleString('pt-BR')}
          </span>
        )}
        <p style={{ color: 'var(--text-muted)', fontSize: compact ? 11 : 12, marginTop: 4 }}>{sub}</p>
      </div>

      <div style={{
        height: 3, borderRadius: 4,
        background: `linear-gradient(90deg, ${accent}, transparent)`,
        marginTop: 'auto',
      }} />
    </div>
  )
}

// ── page ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data: perfil } = await supabase
        .from('perfis')
        .select('municipio_ativo_id')
        .eq('id', session.user.id)
        .single()
      const mid = perfil?.municipio_ativo_id
      const url = mid ? `/api/admin/overview?municipio_id=${mid}` : '/api/admin/overview'
      fetch(url)
        .then(r => r.json())
        .then(setData)
        .catch(() => setErro('Não foi possível carregar os dados.'))
        .finally(() => setLoading(false))
    })
  }, [])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const kpis = [
    { label: 'Total de Usuários', value: data?.usuarios.total    ?? 0, sub: 'cadastrados no sistema', accent: 'var(--chart-indigo)', icon: <IcoUsers /> },
    { label: 'Usuários Ativos',   value: data?.usuarios.ativos   ?? 0, sub: 'com acesso liberado',    accent: 'var(--chart-green)', icon: <IcoUserCheck /> },
    { label: 'Usuários Inativos', value: data?.usuarios.inativos ?? 0, sub: 'acesso suspenso',        accent: 'var(--chart-amber)', icon: <IcoUserMinus /> },
    { label: 'Municípios Ativos', value: data?.municipiosAtivos  ?? 0, sub: 'plataforma habilitada',  accent: 'var(--chart-blue)', icon: <IcoBuilding /> },
  ]

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 700,
          color: 'var(--text-primary)', marginBottom: 6,
        }}>
          Visão Geral
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Painel administrativo · dados em tempo real
        </p>
      </div>

      {erro && (
        <div style={{
          background: 'var(--danger-subtle)', border: '1px solid var(--danger)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 24,
          color: 'var(--error)', fontSize: 14,
        }}>
          {erro}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16, marginBottom: 24 }}>
        {kpis.map(k => <KpiCard key={k.label} {...k} loading={loading} compact={isMobile} />)}
      </div>

      {/* Resumo de produção */}
      {!loading && data?.producao?.ultimo && (() => {
        const u = data.producao.ultimo
        const a = data.producao.anterior
        const totalUlt = u.atendimento_individual + u.atendimento_odonto + u.procedimentos + u.visita_domiciliar
        const totalAnt = a ? a.atendimento_individual + a.atendimento_odonto + a.procedimentos + a.visita_domiciliar : 0
        const varPct = totalAnt > 0 ? ((totalUlt - totalAnt) / totalAnt) * 100 : null
        const mesLabel = (() => {
          const m: Record<string, string> = { '01':'Jan','02':'Fev','03':'Mar','04':'Abr','05':'Mai','06':'Jun','07':'Jul','08':'Ago','09':'Set','10':'Out','11':'Nov','12':'Dez' }
          return m[u.competencia.slice(5, 7)] ?? u.competencia.slice(5, 7)
        })()
        const anoLabel = u.competencia.slice(0, 4)
        return (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 16, padding: '20px 24px', marginBottom: 24,
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                  Produção APS
                </h2>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Último mês: {mesLabel}/{anoLabel}
                  {data.anual ? ` · ${data.anual.mesesComDados} meses com dados em ${data.anual.anoAtual}` : ''}
                </span>
              </div>
              {varPct !== null && (
                <span style={{
                  fontSize: 12, fontWeight: 700, borderRadius: 20, padding: '3px 10px',
                  background: varPct >= 0 ? 'var(--success-subtle)' : 'var(--danger-subtle)',
                  color: varPct >= 0 ? 'var(--success)' : 'var(--danger)',
                }}>
                  {varPct >= 0 ? '+' : ''}{varPct.toFixed(1)}% vs mês anterior
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 16 }}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total mensal</span>
                <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginTop: 2 }}>
                  {totalUlt.toLocaleString('pt-BR')}
                </p>
              </div>
              {[
                { label: 'At. Individual', value: u.atendimento_individual },
                { label: 'Procedimentos', value: u.procedimentos },
                { label: 'Odontológico', value: u.atendimento_odonto },
                { label: 'Visita ACS', value: u.visita_domiciliar },
              ].map(item => (
                <div key={item.label}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{item.label}</span>
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'Syne, sans-serif', marginTop: 2 }}>
                    {item.value.toLocaleString('pt-BR')}
                  </p>
                </div>
              ))}
            </div>
            {data.anual && data.anual.total > 0 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Total {data.anual.anoAtual}: <strong style={{ color: 'var(--text-primary)' }}>{data.anual.total.toLocaleString('pt-BR')}</strong> atendimentos
                </span>
                <a href="/dashboard/producao-aps" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                  Ver detalhes →
                </a>
              </div>
            )}
          </div>
        )
      })()}

      {/* Tabela usuários recentes */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16, overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            Usuários Recentes
          </h2>
          <a href="/dashboard/usuarios" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
            Ver todos →
          </a>
        </div>

        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[...Array(4)].map((_, i) => <Skeleton key={i} h={36} />)}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} role="table" aria-label="Usuários recentes">
              <thead>
                <tr style={{ background: 'var(--bg-surface-2)' }}>
                  {['Nome', 'E-mail', 'Município', 'Role', 'Status', 'Cadastro'].map(h => (
                    <th key={h} style={{
                      padding: '12px 20px', textAlign: 'left',
                      fontSize: 11, fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.recentes ?? []).map(u => (
                  <tr key={u.id} className="table-row">
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%',
                          background: u.ativo
                            ? 'linear-gradient(135deg, var(--accent), var(--accent-hover))'
                            : 'var(--bg-surface-2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700,
                          color: u.ativo ? '#fff' : 'var(--text-muted)',
                          flexShrink: 0, border: '1px solid var(--border)',
                        }}>
                          {u.nome.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                          {u.nome}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: 'var(--text-muted)' }}>{u.email}</td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {u.municipios?.nome ?? '—'}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        background: 'var(--bg-surface-2)',
                        color: u.role === 'super_admin' ? 'var(--role-super)'
                             : u.role === 'admin_municipal' ? 'var(--role-admin)'
                             : 'var(--role-operador)',
                        border: '1px solid var(--border)',
                        borderRadius: 20, padding: '3px 10px',
                        fontSize: 12, fontWeight: 600,
                      }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 13, fontWeight: 500,
                        color: u.ativo ? 'var(--success)' : 'var(--warning)',
                      }}>
                        <span className="status-dot" style={{
                          background: u.ativo ? 'var(--success)' : 'var(--warning)',
                          boxShadow: u.ativo ? '0 0 6px var(--accent-glow)' : '0 0 6px var(--warning-subtle)',
                        }} />
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: 'var(--text-muted)' }}>
                      {new Date(u.criado_em).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
                {(data?.recentes ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                      Nenhum usuário cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
