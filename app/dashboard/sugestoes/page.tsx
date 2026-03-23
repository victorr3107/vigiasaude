'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Sugestao {
  id: string
  titulo: string
  descricao: string
  categoria: string
  municipio_ibge: string
  municipio_nome: string
  status: string
  resposta_admin: string | null
  data_criacao: string
  data_atualizacao: string
  visualizada_admin: boolean
  perfis: { nome: string; email: string }
}

const STATUS_CONFIG: Record<string, { label: string; cor: string; bg: string; border: string }> = {
  NOVA:         { label: 'Nova',              cor: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)' },
  EM_ANALISE:   { label: 'Em análise',        cor: '#60a5fa', bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.25)'  },
  PLANEJADA:    { label: 'Planejada',         cor: '#c084fc', bg: 'rgba(192,132,252,0.10)', border: 'rgba(192,132,252,0.25)' },
  IMPLEMENTADA: { label: 'Implementada',      cor: '#34d399', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.25)'  },
  DESCARTADA:   { label: 'Não implementada',  cor: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)' },
}

const CATEGORIA_LABELS: Record<string, string> = {
  NOVO_GRAFICO: '📊 Novo gráfico',
  NOVA_ROTINA:  '⚙️ Nova rotina',
  MELHORIA:     '✨ Melhoria',
  BUG:          '🐛 Bug',
  OUTRO:        '💬 Outro',
}

const KPI_ORDER = ['NOVA', 'EM_ANALISE', 'PLANEJADA', 'IMPLEMENTADA', 'DESCARTADA']

const KPI_ICONS: Record<string, React.ReactElement> = {
  NOVA:         <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  EM_ANALISE:   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  PLANEJADA:    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  IMPLEMENTADA: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  DESCARTADA:   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
}

export default function AdminSugestoesPage() {
  const [sugestoes, setSugestoes]           = useState<Sugestao[]>([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState('')
  const [filtros, setFiltros]               = useState({ status: '', categoria: '', busca: '' })
  const [pagina, setPagina]                 = useState(1)
  const [total, setTotal]                   = useState(0)
  const [totais, setTotais]                 = useState<Record<string, number>>({})
  const [modalAberto, setModalAberto]       = useState(false)
  const [selecionada, setSelecionada]       = useState<Sugestao | null>(null)
  const [resposta, setResposta]             = useState('')
  const [statusNovo, setStatusNovo]         = useState('')
  const [salvando, setSalvando]             = useState(false)
  const [toast, setToast]                   = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)

  const LIMIT = 20
  const totalPaginas = Math.ceil(total / LIMIT)

  const showToast = (msg: string, tipo: 'ok' | 'erro' = 'ok') => {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => { carregar() }, [filtros, pagina])

  const carregar = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Não autenticado')

      const params = new URLSearchParams({
        status: filtros.status,
        categoria: filtros.categoria,
        busca: filtros.busca,
        page: pagina.toString(),
        limit: String(LIMIT),
      })

      const res = await fetch(`/api/admin/sugestoes?${params}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error('Erro ao carregar')

      const data = await res.json()
      setSugestoes(data.sugestoes)
      setTotal(data.pagination.total)
      setTotais(data.totais)
    } catch {
      setError('Não foi possível carregar as sugestões. Verifique sua conexão.')
    } finally {
      setLoading(false)
    }
  }

  const abrirModal = (s: Sugestao) => {
    setSelecionada(s)
    setStatusNovo(s.status)
    setResposta(s.resposta_admin ?? '')
    setModalAberto(true)
  }

  const salvar = async () => {
    if (!selecionada || !statusNovo) return
    setSalvando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error()

      const res = await fetch(`/api/admin/sugestoes/${selecionada.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status: statusNovo, resposta_admin: resposta.trim() || null }),
      })
      if (!res.ok) throw new Error()

      showToast('Resposta salva com sucesso!')
      setModalAberto(false)
      carregar()
    } catch {
      showToast('Erro ao salvar resposta', 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const setFiltroStatus = (s: string) => {
    setFiltros(f => ({ ...f, status: f.status === s ? '' : s }))
    setPagina(1)
  }

  // ── Loading inicial ────────────────────────────────────────────────────────
  if (loading && sugestoes.length === 0) return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 300 }}>
      <div style={{ width: 36, height: 36, border: '3px solid var(--accent-subtle)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Carregando sugestões...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (error) return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <p style={{ color: '#f87171', fontSize: 15 }}>{error}</p>
      <button onClick={carregar} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 14 }}>
        Tentar novamente
      </button>
    </div>
  )

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }`}</style>

      {/* Cabeçalho */}
      <div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Sugestões dos Usuários
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Gerencie e responda as sugestões enviadas pelos usuários da plataforma.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid-auto-md">
        {KPI_ORDER.map(key => {
          const cfg = STATUS_CONFIG[key]
          const ativo = filtros.status === key
          return (
            <button
              key={key}
              onClick={() => setFiltroStatus(key)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 12,
                padding: '18px 20px',
                background: ativo ? cfg.bg : 'var(--bg-surface)',
                border: `1px solid ${ativo ? cfg.border : 'var(--border)'}`,
                borderRadius: 14,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.18s',
                boxShadow: ativo ? `0 0 0 1px ${cfg.border}` : 'none',
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

      {/* Filtros */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12,
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '16px 20px',
      }}>
        <div>
          <label className="form-label">Status</label>
          <select
            className="form-input"
            value={filtros.status}
            onChange={e => { setFiltros(f => ({ ...f, status: e.target.value })); setPagina(1) }}
          >
            <option value="">Todos</option>
            {KPI_ORDER.map(k => <option key={k} value={k}>{STATUS_CONFIG[k].label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Categoria</label>
          <select
            className="form-input"
            value={filtros.categoria}
            onChange={e => { setFiltros(f => ({ ...f, categoria: e.target.value })); setPagina(1) }}
          >
            <option value="">Todas</option>
            {Object.entries(CATEGORIA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Busca</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            <input
              className="form-input"
              style={{ paddingLeft: 32 }}
              value={filtros.busca}
              onChange={e => { setFiltros(f => ({ ...f, busca: e.target.value })); setPagina(1) }}
              placeholder="Buscar por título..."
            />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>

        {/* Cabeçalho da tabela + Linhas: envolve em scroll horizontal */}
        <div style={{ overflowX: 'auto' }}>

        {/* Cabeçalho da tabela */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 140px 160px 160px 100px 130px 110px',
          padding: '10px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-base)',
          minWidth: 900,
        }}>
          {['Sugestão', 'Categoria', 'Município', 'Usuário', 'Data', 'Status', 'Ação'].map(col => (
            <span key={col} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {col}
            </span>
          ))}
        </div>

        {/* Linhas */}
        {loading ? (
          <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div style={{ width: 20, height: 20, border: '2px solid var(--accent-subtle)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Atualizando...</span>
          </div>
        ) : sugestoes.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 15, fontWeight: 500 }}>Nenhuma sugestão encontrada.</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Tente ajustar os filtros acima.</p>
          </div>
        ) : (
          sugestoes.map((s, i) => {
            const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.NOVA
            const isNova = !s.visualizada_admin
            return (
              <div
                key={s.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 140px 160px 160px 100px 130px 110px',
                  padding: '14px 20px',
                  borderBottom: i < sugestoes.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  background: isNova ? 'rgba(96,165,250,0.04)' : 'transparent',
                  alignItems: 'center',
                  transition: 'background 0.15s',
                  minWidth: 900,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-subtle)')}
                onMouseLeave={e => (e.currentTarget.style.background = isNova ? 'rgba(96,165,250,0.04)' : 'transparent')}
              >
                {/* Sugestão */}
                <div style={{ minWidth: 0, paddingRight: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isNova && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', flexShrink: 0 }} />}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.titulo}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.descricao}
                  </p>
                </div>

                {/* Categoria */}
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {CATEGORIA_LABELS[s.categoria] ?? s.categoria}
                </span>

                {/* Município */}
                <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.municipio_nome}
                </span>

                {/* Usuário */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.perfis.nome}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.perfis.email}
                  </div>
                </div>

                {/* Data */}
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {format(new Date(s.data_criacao), 'dd/MM/yyyy', { locale: ptBR })}
                </span>

                {/* Status badge */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '3px 10px', borderRadius: 999,
                  fontSize: 11, fontWeight: 600,
                  color: cfg.cor, background: cfg.bg, border: `1px solid ${cfg.border}`,
                  whiteSpace: 'nowrap',
                }}>
                  {cfg.label}
                </span>

                {/* Ação */}
                <button
                  onClick={() => abrirModal(s)}
                  style={{
                    padding: '6px 14px', borderRadius: 8,
                    border: '1px solid var(--border-input)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: 12, fontWeight: 500,
                    transition: 'all 0.15s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-input)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  Responder
                </button>
              </div>
            )
          })
        )}

        </div>{/* fim overflowX */}

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px', borderTop: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {total} sugestão{total !== 1 ? 'ões' : ''} · página {pagina} de {totalPaginas}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina === 1}
                style={{ padding: '5px 14px', borderRadius: 7, border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: pagina === 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: pagina === 1 ? 'default' : 'pointer', fontSize: 13, fontFamily: 'inherit' }}
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
                style={{ padding: '5px 14px', borderRadius: 7, border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: pagina === totalPaginas ? 'var(--text-muted)' : 'var(--text-primary)', cursor: pagina === totalPaginas ? 'default' : 'pointer', fontSize: 13, fontFamily: 'inherit' }}
              >
                Próxima →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal de decisão ───────────────────────────────────────────────────── */}
      {modalAberto && selecionada && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => !salvando && setModalAberto(false)}
            aria-hidden="true"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 200 }}
          />

          {/* Painel */}
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'calc(100% - 32px)', maxWidth: 620, zIndex: 201,
              background: 'var(--bg-modal)',
              border: '1px solid var(--border-strong)',
              borderRadius: 20,
              boxShadow: 'var(--shadow-modal)',
              overflow: 'hidden',
              maxHeight: '92dvh',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{ padding: '22px 28px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
              <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    color: STATUS_CONFIG[selecionada.status]?.cor,
                    background: STATUS_CONFIG[selecionada.status]?.bg,
                    border: `1px solid ${STATUS_CONFIG[selecionada.status]?.border}`,
                  }}>
                    {STATUS_CONFIG[selecionada.status]?.label}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {CATEGORIA_LABELS[selecionada.categoria] ?? selecionada.categoria}
                  </span>
                </div>
                <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                  {selecionada.titulo}
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>
                  {selecionada.perfis.nome} · {selecionada.municipio_nome} · {format(new Date(selecionada.data_criacao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
              <button
                onClick={() => !salvando && setModalAberto(false)}
                aria-label="Fechar"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Descrição do usuário */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                  Descrição enviada pelo usuário
                </p>
                <div style={{
                  background: 'var(--bg-base)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '14px 16px',
                  fontSize: 14, color: 'var(--text-primary)',
                  lineHeight: 1.65, whiteSpace: 'pre-wrap',
                }}>
                  {selecionada.descricao}
                </div>
              </div>

              {/* Decisão — seleção de status */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                  Decisão
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {KPI_ORDER.map(key => {
                    const cfg = STATUS_CONFIG[key]
                    const ativo = statusNovo === key
                    return (
                      <button
                        key={key}
                        onClick={() => setStatusNovo(key)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 14px', borderRadius: 10,
                          border: `1px solid ${ativo ? cfg.border : 'var(--border-input)'}`,
                          background: ativo ? cfg.bg : 'var(--bg-input)',
                          cursor: 'pointer', textAlign: 'left',
                          transition: 'all 0.15s',
                          fontFamily: 'inherit',
                        }}
                      >
                        <span style={{ color: cfg.cor, opacity: ativo ? 1 : 0.5, flexShrink: 0 }}>
                          {KPI_ICONS[key]}
                        </span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: ativo ? 600 : 400, color: ativo ? cfg.cor : 'var(--text-primary)' }}>
                            {cfg.label}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                            {{
                              NOVA:         'Ainda não analisada',
                              EM_ANALISE:   'Em avaliação pela equipe',
                              PLANEJADA:    'Será desenvolvida em breve',
                              IMPLEMENTADA: 'Já disponível na plataforma',
                              DESCARTADA:   'Não será implementada neste momento',
                            }[key]}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Resposta / devolutiva */}
              <div>
                <label className="form-label" htmlFor="sug-resposta" style={{ marginBottom: 8, display: 'block' }}>
                  Devolutiva ao usuário <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span>
                </label>
                <textarea
                  id="sug-resposta"
                  className="form-input"
                  value={resposta}
                  onChange={e => setResposta(e.target.value)}
                  rows={4}
                  placeholder="Explique para o usuário o motivo da decisão ou próximos passos..."
                  style={{ resize: 'none' }}
                />
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Esta mensagem será exibida para o usuário em "Minhas Sugestões".
                </p>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 28px',
              borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              flexShrink: 0,
            }}>
              <button
                onClick={() => !salvando && setModalAberto(false)}
                style={{ padding: '9px 20px', borderRadius: 9, border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', transition: 'color 0.15s' }}
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando || !statusNovo}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 24px', borderRadius: 9,
                  border: 'none',
                  background: salvando || !statusNovo ? 'var(--border-strong)' : 'var(--accent)',
                  color: '#fff',
                  cursor: salvando || !statusNovo ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 600,
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
              >
                {salvando ? (
                  <>
                    <div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Salvando...
                  </>
                ) : 'Salvar decisão'}
              </button>
            </div>
          </div>
        </>
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
