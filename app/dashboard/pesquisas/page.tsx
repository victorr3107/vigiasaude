'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Pesquisa {
  id: string
  titulo: string
  descricao: string | null
  status: string
  data_inicio: string | null
  data_fim: string | null
  publico_alvo: string
  total_respostas: number
  total_completas: number
}

const STATUS_CONFIG: Record<string, { label: string; cor: string; bg: string; border: string }> = {
  RASCUNHO:  { label: 'Rascunho',  cor: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)' },
  ATIVA:     { label: 'Ativa',     cor: '#34d399', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.25)'  },
  ENCERRADA: { label: 'Encerrada', cor: '#60a5fa', bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.25)'  },
  ARQUIVADA: { label: 'Arquivada', cor: '#64748b', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.20)' },
}

const PUBLICO_LABELS: Record<string, string> = {
  TODOS:                  'Todos os usuários',
  PERFIL_ESPECIFICO:      'Perfil específico',
  MUNICIPIOS_ESPECIFICOS: 'Municípios específicos',
}

const KPI_STATUSES = ['RASCUNHO', 'ATIVA', 'ENCERRADA', 'ARQUIVADA']

const KPI_ICONS: Record<string, React.ReactElement> = {
  RASCUNHO:  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  ATIVA:     <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  ENCERRADA: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  ARQUIVADA: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
}

export default function PesquisasAdminPage() {
  const [pesquisas, setPesquisas]           = useState<Pesquisa[]>([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState('')
  const [filtroStatus, setFiltroStatus]     = useState('')
  const [encerrando, setEncerrando]         = useState<string | null>(null)
  const [toast, setToast]                   = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)

  const showToast = (msg: string, tipo: 'ok' | 'erro' = 'ok') => {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => { carregar() }, [])

  const carregar = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Não autenticado')

      const res = await fetch('/api/admin/pesquisas', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error('Erro ao carregar')
      setPesquisas(await res.json())
    } catch {
      setError('Não foi possível carregar as pesquisas. Verifique sua conexão.')
    } finally {
      setLoading(false)
    }
  }

  const encerrar = async (id: string) => {
    if (!confirm('Encerrar esta pesquisa? Esta ação não pode ser desfeita.')) return
    setEncerrando(id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error()
      const res = await fetch(`/api/admin/pesquisas/${id}/encerrar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error()
      showToast('Pesquisa encerrada com sucesso.')
      carregar()
    } catch {
      showToast('Erro ao encerrar pesquisa.', 'erro')
    } finally {
      setEncerrando(null)
    }
  }

  // Totais por status para KPIs
  const totais = KPI_STATUSES.reduce((acc, s) => {
    acc[s] = pesquisas.filter(p => p.status === s).length
    return acc
  }, {} as Record<string, number>)

  const lista = filtroStatus ? pesquisas.filter(p => p.status === filtroStatus) : pesquisas

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading && pesquisas.length === 0) return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 300 }}>
      <div style={{ width: 36, height: 36, border: '3px solid var(--accent-subtle)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Carregando pesquisas...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (error) return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <p style={{ color: '#f87171', fontSize: 15 }}>{error}</p>
      <button onClick={carregar} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
        Tentar novamente
      </button>
    </div>
  )

  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 1280 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Pesquisas de Satisfação
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Crie e gerencie pesquisas para coletar feedback dos usuários.
          </p>
        </div>
        <Link
          href="/dashboard/pesquisas/nova"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', borderRadius: 10,
            background: 'var(--accent)', color: '#fff',
            fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
            textDecoration: 'none', whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nova Pesquisa
        </Link>
      </div>

      {/* KPI Cards — filtros clicáveis */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {KPI_STATUSES.map(key => {
          const cfg = STATUS_CONFIG[key]
          const ativo = filtroStatus === key
          return (
            <button
              key={key}
              onClick={() => setFiltroStatus(f => f === key ? '' : key)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 12,
                padding: '18px 20px',
                background: ativo ? cfg.bg : 'var(--bg-surface)',
                border: `1px solid ${ativo ? cfg.border : 'var(--border)'}`,
                borderRadius: 14,
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.18s',
                boxShadow: ativo ? `0 0 0 1px ${cfg.border}` : 'none',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ color: cfg.cor, opacity: ativo ? 1 : 0.7 }}>
                {KPI_ICONS[key]}
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: ativo ? cfg.cor : 'var(--text-primary)', lineHeight: 1, fontFamily: 'Syne, sans-serif' }}>
                  {totais[key] ?? 0}
                </div>
                <div style={{ fontSize: 12, color: ativo ? cfg.cor : 'var(--text-muted)', marginTop: 4, fontWeight: ativo ? 600 : 400 }}>
                  {cfg.label}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Lista de pesquisas */}
      {lista.length === 0 ? (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '56px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>📋</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            {filtroStatus ? `Nenhuma pesquisa ${STATUS_CONFIG[filtroStatus]?.label.toLowerCase()}` : 'Nenhuma pesquisa criada'}
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
            {filtroStatus ? 'Tente selecionar outro filtro acima.' : 'Comece criando sua primeira pesquisa de satisfação.'}
          </p>
          {!filtroStatus && (
            <Link
              href="/dashboard/pesquisas/nova"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '9px 20px', borderRadius: 10,
                background: 'var(--accent)', color: '#fff',
                fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                textDecoration: 'none',
              }}
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Criar primeira pesquisa
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lista.map(p => {
            const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.RASCUNHO
            const taxa = p.total_respostas > 0
              ? Math.round((p.total_completas / p.total_respostas) * 100)
              : 0
            const isEncerrando = encerrando === p.id

            return (
              <div
                key={p.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  animation: 'fadeIn 0.2s ease',
                }}
              >
                {/* Status badge + info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '3px 10px', borderRadius: 999,
                      fontSize: 11, fontWeight: 600,
                      color: cfg.cor, background: cfg.bg, border: `1px solid ${cfg.border}`,
                      whiteSpace: 'nowrap',
                    }}>
                      {cfg.label}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {PUBLICO_LABELS[p.publico_alvo] ?? p.publico_alvo}
                    </span>
                  </div>

                  <h3 style={{
                    fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700,
                    color: 'var(--text-primary)', marginBottom: 4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {p.titulo}
                  </h3>

                  {p.descricao && (
                    <p style={{
                      fontSize: 13, color: 'var(--text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      marginBottom: 4,
                    }}>
                      {p.descricao}
                    </p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 8 }}>
                    {p.data_inicio && p.data_fim && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        {format(new Date(p.data_inicio), "dd/MM/yy", { locale: ptBR })} — {format(new Date(p.data_fim), "dd/MM/yy", { locale: ptBR })}
                      </span>
                    )}
                    {p.status !== 'RASCUNHO' && (
                      <>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.total_completas}</strong> completas
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.total_respostas}</strong> exibições
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          taxa{' '}
                          <strong style={{ color: taxa >= 50 ? '#34d399' : taxa >= 25 ? '#f59e0b' : 'var(--text-primary)', fontWeight: 600 }}>
                            {taxa}%
                          </strong>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {p.status === 'RASCUNHO' && (
                    <Link
                      href={`/dashboard/pesquisas/${p.id}/editar`}
                      style={{
                        padding: '7px 16px', borderRadius: 8,
                        border: '1px solid var(--border-input)',
                        background: 'var(--bg-input)',
                        color: 'var(--text-secondary)',
                        fontSize: 13, fontWeight: 500,
                        textDecoration: 'none', fontFamily: 'inherit',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Editar
                    </Link>
                  )}

                  {p.status === 'ATIVA' && (
                    <>
                      <Link
                        href={`/dashboard/pesquisas/${p.id}/relatorio`}
                        style={{
                          padding: '7px 16px', borderRadius: 8,
                          border: '1px solid var(--border-input)',
                          background: 'var(--bg-input)',
                          color: 'var(--text-secondary)',
                          fontSize: 13, fontWeight: 500,
                          textDecoration: 'none', fontFamily: 'inherit',
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                        Resultados
                      </Link>
                      <button
                        onClick={() => encerrar(p.id)}
                        disabled={isEncerrando}
                        style={{
                          padding: '7px 16px', borderRadius: 8,
                          border: '1px solid rgba(248,113,113,0.3)',
                          background: 'rgba(248,113,113,0.08)',
                          color: '#f87171',
                          fontSize: 13, fontWeight: 500,
                          cursor: isEncerrando ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit',
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          opacity: isEncerrando ? 0.6 : 1,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        {isEncerrando
                          ? <div style={{ width: 12, height: 12, border: '2px solid rgba(248,113,113,0.3)', borderTopColor: '#f87171', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                          : <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                        }
                        {isEncerrando ? 'Encerrando...' : 'Encerrar'}
                      </button>
                    </>
                  )}

                  {(p.status === 'ENCERRADA' || p.status === 'ARQUIVADA') && (
                    <Link
                      href={`/dashboard/pesquisas/${p.id}/relatorio`}
                      style={{
                        padding: '7px 16px', borderRadius: 8,
                        border: `1px solid ${cfg.border}`,
                        background: cfg.bg,
                        color: cfg.cor,
                        fontSize: 13, fontWeight: 600,
                        textDecoration: 'none', fontFamily: 'inherit',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                      Ver relatório
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 88, right: 24, zIndex: 300,
          padding: '11px 20px', borderRadius: 10,
          background: toast.tipo === 'ok' ? 'var(--accent)' : '#ef4444',
          color: '#fff', fontSize: 14, fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          animation: 'fadeIn 0.25s ease',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
