'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Municipio {
  id: string
  nome: string
  uf: string
  ativo: boolean
}

interface PaginatedResult {
  data: Municipio[]
  total: number
  page: number
  limit: number
  totalPages: number
}

type FiltroStatus = 'true' | 'false' | 'todos'

const LIMIT_OPTIONS = [10, 20, 50]

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function ToggleSwitch({ checked, onChange, disabled, label }: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: checked ? 'var(--accent)' : 'var(--bg-input)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-input)'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.2s, border-color 0.2s',
        position: 'relative', flexShrink: 0,
        outline: 'none',
      }}
    >
      <div style={{
        position: 'absolute', top: 2,
        left: checked ? 19 : 2,
        width: 16, height: 16,
        borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}

// ── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, total, limit, onPage, onLimit }: {
  page: number
  totalPages: number
  total: number
  limit: number
  onPage: (p: number) => void
  onLimit: (l: number) => void
}) {
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end   = Math.min(page * limit, total)

  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
    if (totalPages <= 5) return i + 1
    if (page <= 3) return i + 1
    if (page >= totalPages - 2) return totalPages - 4 + i
    return page - 2 + i
  })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 20px',
      borderTop: '1px solid var(--border)',
      flexWrap: 'wrap', gap: 12,
    }}>
      {/* Info + itens por página */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {total === 0 ? '0 resultados' : `${start}–${end} de ${total}`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>por página:</span>
          {LIMIT_OPTIONS.map(l => (
            <button key={l} onClick={() => onLimit(l)}
              style={{
                padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border-input)',
                background: limit === l ? 'var(--accent-subtle)' : 'transparent',
                color: limit === l ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 12, fontWeight: limit === l ? 600 : 400,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Botões de página */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <PagBtn label="←" onClick={() => onPage(page - 1)} disabled={page === 1} />
          {pages[0] > 1 && (
            <>
              <PagBtn label="1" onClick={() => onPage(1)} active={false} />
              {pages[0] > 2 && <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>…</span>}
            </>
          )}
          {pages.map(p => <PagBtn key={p} label={String(p)} onClick={() => onPage(p)} active={p === page} />)}
          {pages[pages.length - 1] < totalPages && (
            <>
              {pages[pages.length - 1] < totalPages - 1 && <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>…</span>}
              <PagBtn label={String(totalPages)} onClick={() => onPage(totalPages)} active={false} />
            </>
          )}
          <PagBtn label="→" onClick={() => onPage(page + 1)} disabled={page === totalPages} />
        </div>
      )}
    </div>
  )
}

function PagBtn({ label, onClick, active, disabled }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        minWidth: 44, minHeight: 44, borderRadius: 8,
        border: '1px solid var(--border-input)',
        background: active ? 'var(--accent)' : 'var(--bg-input)',
        color: active ? 'var(--text-on-accent)' : disabled ? 'var(--text-dim)' : 'var(--text-secondary)',
        fontSize: 13, fontWeight: active ? 600 : 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontFamily: 'inherit',
        transition: 'all 0.15s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      {label}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MunicipiosPage() {
  const [result, setResult]     = useState<PaginatedResult | null>(null)
  const [loading, setLoading]   = useState(false)
  const [busca, setBusca]       = useState('')
  const [filtro, setFiltro]     = useState<FiltroStatus>('true')
  const [page, setPage]         = useState(1)
  const [limit, setLimit]       = useState(10)
  const [toggling, setToggling] = useState<string | null>(null)
  const [toast, setToast]       = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)

  const searchTimer = useRef<NodeJS.Timeout | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)

  const showToast = (msg: string, tipo: 'ok' | 'erro' = 'ok') => {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Fetch ──
  const fetchMunicipios = useCallback(async (
    q: string, f: FiltroStatus, p: number, l: number
  ) => {
    // Exige busca mínima para listar inativos ou todos
    if (f !== 'true' && q.trim().length < 2) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        busca: q.trim(),
        ativo: f,
        page: String(p),
        limit: String(l),
      })
      const res = await fetch(`/api/admin/municipios?${params}`)
      const data = await res.json()
      if (res.ok) setResult(data)
      else showToast(data.error ?? 'Erro ao buscar municípios.', 'erro')
    } catch {
      showToast('Falha de conexão.', 'erro')
    } finally {
      setLoading(false)
    }
  }, [])

  // Carrega ativos na entrada
  useEffect(() => { fetchMunicipios('', 'true', 1, limit) }, [])

  // Debounce da busca
  const handleBusca = (valor: string) => {
    setBusca(valor)
    setPage(1)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      fetchMunicipios(valor, filtro, 1, limit)
    }, 400)
  }

  const handleFiltro = (f: FiltroStatus) => {
    setFiltro(f)
    setPage(1)
    // Se trocar para inativos/todos sem busca, limpa resultado e foca input
    if (f !== 'true' && busca.trim().length < 2) {
      setResult(null)
      setTimeout(() => inputRef.current?.focus(), 100)
      return
    }
    fetchMunicipios(busca, f, 1, limit)
  }

  const handlePage = (p: number) => {
    setPage(p)
    fetchMunicipios(busca, filtro, p, limit)
  }

  const handleLimit = (l: number) => {
    setLimit(l)
    setPage(1)
    fetchMunicipios(busca, filtro, 1, l)
  }

  // ── Toggle ativo ──
  const handleToggle = async (m: Municipio) => {
    setToggling(m.id)
    // Otimista
    setResult(prev => prev ? {
      ...prev,
      data: prev.data.map(x => x.id === m.id ? { ...x, ativo: !x.ativo } : x),
    } : prev)

    try {
      const res = await fetch(`/api/admin/municipios/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !m.ativo }),
      })
      if (!res.ok) {
        // Reverte
        setResult(prev => prev ? {
          ...prev,
          data: prev.data.map(x => x.id === m.id ? { ...x, ativo: m.ativo } : x),
        } : prev)
        showToast('Erro ao atualizar município.', 'erro')
      } else {
        showToast(`${m.nome} ${!m.ativo ? 'ativado' : 'desativado'}.`)
        // Se filtro ativo e desativou: remove da lista
        if (filtro === 'true' && m.ativo) {
          setResult(prev => prev ? {
            ...prev,
            data: prev.data.filter(x => x.id !== m.id),
            total: prev.total - 1,
          } : prev)
        }
        if (filtro === 'false' && !m.ativo) {
          setResult(prev => prev ? {
            ...prev,
            data: prev.data.filter(x => x.id !== m.id),
            total: prev.total - 1,
          } : prev)
        }
      }
    } catch {
      setResult(prev => prev ? {
        ...prev,
        data: prev.data.map(x => x.id === m.id ? { ...x, ativo: m.ativo } : x),
      } : prev)
      showToast('Falha de conexão.', 'erro')
    } finally {
      setToggling(null)
    }
  }

  // ── Estado de busca obrigatória ──
  const precisaBusca = filtro !== 'true' && busca.trim().length < 2

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Municípios
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {result ? `${result.total.toLocaleString('pt-BR')} município${result.total !== 1 ? 's' : ''} encontrado${result.total !== 1 ? 's' : ''}` : '5.571 municípios brasileiros cadastrados'}
        </p>
      </div>

      {/* Controles ── */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16, overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: 0,
      }}>
        {/* Barra de filtros */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          gap: 12, flexWrap: 'wrap',
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <svg
              aria-hidden="true"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref={inputRef}
              className="search-input"
              style={{ width: '100%' }}
              placeholder={filtro !== 'true' ? 'Digite ao menos 2 letras para buscar…' : 'Buscar por nome do município…'}
              value={busca}
              onChange={e => handleBusca(e.target.value)}
              aria-label="Buscar município"
            />
            {busca && (
              <button
                onClick={() => { setBusca(''); handleBusca('') }}
                aria-label="Limpar busca"
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 16, lineHeight: 1,
                  display: 'flex', alignItems: 'center',
                }}
              >×</button>
            )}
          </div>

          {/* Filtro status */}
          <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="Filtrar por status">
            {([
              { value: 'true',  label: 'Ativos' },
              { value: 'false', label: 'Inativos' },
              { value: 'todos', label: 'Todos' },
            ] as { value: FiltroStatus; label: string }[]).map(f => (
              <button
                key={f.value}
                className={`filter-btn${filtro === f.value ? ' active' : ''}`}
                onClick={() => handleFiltro(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Aviso busca obrigatória */}
        {precisaBusca && (
          <div style={{
            padding: '32px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            color: 'var(--text-muted)', textAlign: 'center',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-border)" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
              Digite ao menos 2 letras para pesquisar
            </p>
            <p style={{ fontSize: 13 }}>
              Para ver municípios inativos ou todos, use a busca acima
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && !precisaBusca && (
          <div style={{ padding: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Buscando municípios…</span>
          </div>
        )}

        {/* Tabela */}
        {!loading && !precisaBusca && result && (
          <>
            {result.data.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
                Nenhum município encontrado para esta busca.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }} role="table">
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-2)' }}>
                      {['Município', 'UF', 'Status', 'Ação'].map(h => (
                        <th key={h} style={{
                          padding: '12px 20px', textAlign: h === 'Ação' ? 'center' : 'left',
                          fontSize: 11, fontWeight: 600,
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map(m => (
                      <tr key={m.id} className="table-row">
                        {/* Nome */}
                        <td style={{ padding: '13px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: 20,
                              background: m.ativo ? 'var(--accent-subtle)' : 'var(--bg-surface-2)',
                              border: '1px solid var(--border)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 700, flexShrink: 0,
                              color: m.ativo ? 'var(--accent)' : 'var(--text-dim)',
                            }}>
                              {m.uf}
                            </div>
                            <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                              {m.nome}
                            </span>
                          </div>
                        </td>

                        {/* UF */}
                        <td style={{ padding: '13px 20px', fontSize: 13, color: 'var(--text-muted)' }}>
                          {m.uf}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '13px 20px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: 13, fontWeight: 500,
                            color: m.ativo ? 'var(--success)' : 'var(--text-dim)',
                          }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: '50%',
                              background: m.ativo ? 'var(--success)' : 'var(--border-strong)',
                              display: 'inline-block',
                              boxShadow: m.ativo ? '0 0 6px var(--accent-glow)' : 'none',
                            }} />
                            {m.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>

                        {/* Toggle */}
                        <td style={{ padding: '13px 20px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 50, textAlign: 'right' }}>
                              {m.ativo ? 'Desativar' : 'Ativar'}
                            </span>
                            <ToggleSwitch
                              checked={m.ativo}
                              onChange={() => handleToggle(m)}
                              disabled={toggling === m.id}
                              label={`${m.ativo ? 'Desativar' : 'Ativar'} ${m.nome}`}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginação */}
            {result.total > 0 && (
              <Pagination
                page={result.page}
                totalPages={result.totalPages}
                total={result.total}
                limit={result.limit}
                onPage={handlePage}
                onLimit={handleLimit}
              />
            )}
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.tipo}`} role="status" aria-live="polite">
          {toast.tipo === 'ok' ? '✓' : '⚠'} {toast.msg}
        </div>
      )}
    </div>
  )
}