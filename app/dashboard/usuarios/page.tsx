'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface Municipio { id: string; nome: string; uf?: string }
interface MunicipioVinculado { municipio_id: string; municipios: { id: string; nome: string; uf?: string } }
interface Usuario {
  id: string; nome: string; email: string; role: string
  ativo: boolean; criado_em: string
  municipio_ativo_id: string | null
  municipios: { id: string; nome: string } | null
  perfis_municipios?: MunicipioVinculado[]
}

const ROLES = ['super_admin', 'admin_municipal', 'operacional']

// ── Combobox com busca de município ───────────────────────────────────────────
function MunicipioCombobox({ value, initialLabel = '', onChange, placeholder, excludeIds = [] }: {
  value: string
  initialLabel?: string
  onChange: (id: string, nome: string, uf?: string) => void
  placeholder?: string
  excludeIds?: string[]
}) {
  const [open, setOpen]       = useState(false)
  const [busca, setBusca]     = useState('')
  const [label, setLabel]     = useState(initialLabel)
  const [results, setResults] = useState<Municipio[]>([])
  const [loading, setLoading] = useState(false)
  const ref    = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fecha ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setBusca('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Busca ao digitar (debounce 300ms, mín 2 chars)
  useEffect(() => {
    if (busca.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res  = await fetch(`/api/admin/municipios?busca=${encodeURIComponent(busca)}&ativo=todos&limit=50`)
        const json = await res.json()
        const all: Municipio[] = Array.isArray(json) ? json : (json.data ?? [])
        setResults(excludeIds.length > 0 ? all.filter(m => !excludeIds.includes(m.id)) : all)
      } finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [busca, excludeIds])

  const handleOpen = () => {
    setOpen(true); setBusca('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleSelect = (m: Municipio) => {
    onChange(m.id, m.nome, m.uf)
    setLabel(m.nome)
    setOpen(false); setBusca('')
  }

  const handleClear = () => {
    onChange('', '')
    setLabel('')
    setOpen(false); setBusca('')
  }

  // Sincroniza label quando value muda externamente
  useEffect(() => { if (!value) setLabel('') }, [value])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        style={{
          width: '100%', textAlign: 'left', padding: '10px 36px 10px 12px',
          background: 'var(--bg-input)', border: `1px solid ${open ? 'var(--accent-border)' : 'var(--border-input)'}`,
          borderRadius: 10, color: label ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
          boxShadow: open ? '0 0 0 3px rgba(16,185,129,0.15)' : 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          display: 'flex', alignItems: 'center', gap: 8,
          overflow: 'hidden', whiteSpace: 'nowrap',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label || '— Nenhum —'}
        </span>
        <svg style={{ position: 'absolute', right: 10, top: '50%', transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`, transition: 'transform 0.2s', color: 'var(--text-muted)', pointerEvents: 'none', flexShrink: 0 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--bg-modal)', border: '1px solid var(--border-strong)',
          borderRadius: 12, zIndex: 400,
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}>
          {/* Input de busca */}
          <div style={{ padding: '8px 8px 4px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'relative' }}>
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                ref={inputRef}
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder={placeholder ?? 'Digite o nome do município...'}
                style={{
                  width: '100%', padding: '8px 10px 8px 30px',
                  background: 'var(--bg-input)', border: '1px solid var(--border-input)',
                  borderRadius: 8, color: 'var(--text-primary)', fontSize: 13,
                  fontFamily: 'inherit', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Lista de resultados */}
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {/* Opção "Nenhum" */}
            <div
              onClick={handleClear}
              style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
            >
              — Nenhum —
            </div>

            {loading && (
              <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                Buscando...
              </div>
            )}

            {!loading && busca.length < 2 && (
              <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                Digite ao menos 2 letras para buscar
              </div>
            )}

            {!loading && busca.length >= 2 && results.length === 0 && (
              <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                Nenhum município encontrado
              </div>
            )}

            {results.map(m => (
              <div
                key={m.id}
                onClick={() => handleSelect(m)}
                style={{
                  padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: m.id === value ? 'var(--accent-subtle)' : 'transparent',
                  color: m.id === value ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                onMouseEnter={e => { if (m.id !== value) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (m.id !== value) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <span>{m.nome}</span>
                {m.uf && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{m.uf}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function ModalCadastro({ municipios: _municipios, onClose, onSave }: {
  municipios: Municipio[]
  onClose: () => void
  onSave: (u: Usuario) => void
}) {
  const [form, setForm] = useState({
    nome: '', email: '', senha: '', confirmarSenha: '',
    municipio_id: '', municipio_nome: '', role: 'operacional', ativo: true,
  })
  const [erro, setErro] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    setErro('')
    if (!form.nome.trim())        return setErro('Informe o nome completo do usuário.')
    if (!form.email.includes('@')) return setErro('Digite um e-mail válido para continuar.')
    if (form.senha.length < 8)    return setErro('A senha precisa ter pelo menos 8 caracteres.')
    if (form.senha !== form.confirmarSenha) return setErro('As senhas não coincidem. Verifique e tente novamente.')

    setSaving(true)
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome, email: form.email, senha: form.senha,
          role: form.role, municipio_id: form.municipio_id || null, ativo: form.ativo,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error ?? 'Algo deu errado ao cadastrar. Tente novamente.'); return }
      onSave(data)
    } catch { setErro('Sem conexão com o servidor. Verifique sua internet e tente novamente.') } finally { setSaving(false) }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 200 }}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'calc(100% - 32px)', maxWidth: 490, zIndex: 201,
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-strong)',
          borderRadius: 20,
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
          maxHeight: '90dvh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '22px 28px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h2 id="modal-title" style={{ fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              Novo Usuário
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              Cadastra no Auth e vincula ao município
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            style={{
              background: 'var(--bg-input)', border: '1px solid var(--border-input)',
              borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s',
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1 }}>
          {/* Nome */}
          <div>
            <label className="form-label" htmlFor="u-nome">Nome completo</label>
            <input id="u-nome" className="form-input" placeholder="Ana Paula Ferreira"
              value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </div>

          {/* Email */}
          <div>
            <label className="form-label" htmlFor="u-email">E-mail</label>
            <input id="u-email" className="form-input" type="email" placeholder="usuario@municipio.sp.gov.br"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>

          {/* Senhas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <div>
              <label className="form-label" htmlFor="u-senha">Senha</label>
              <input id="u-senha" className="form-input" type="password" placeholder="Mín. 8 caracteres"
                value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} />
            </div>
            <div>
              <label className="form-label" htmlFor="u-confirmar">Confirmar senha</label>
              <input id="u-confirmar" className="form-input" type="password" placeholder="Repita a senha"
                value={form.confirmarSenha} onChange={e => setForm(f => ({ ...f, confirmarSenha: e.target.value }))} />
            </div>
          </div>

          {/* Município + Role */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <div>
              <label className="form-label">Município</label>
              <MunicipioCombobox
                value={form.municipio_id}
                onChange={(id, nome) => setForm(f => ({ ...f, municipio_id: id, municipio_nome: nome }))}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="u-role">Role</label>
              <select id="u-role" className="form-input"
                value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Toggle ativo */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 10, padding: '10px 14px',
          }}>
            <div>
              <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>Usuário ativo</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Permite login imediato após cadastro</p>
            </div>
            <button
              role="switch"
              aria-checked={form.ativo}
              aria-label="Ativar usuário"
              onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
              style={{
                width: 44, height: 24, borderRadius: 12,
                background: form.ativo ? 'var(--accent)' : 'var(--bg-input)',
                border: `1px solid ${form.ativo ? 'var(--accent)' : 'var(--border-input)'}`,
                cursor: 'pointer', transition: 'background 0.2s, border-color 0.2s',
                position: 'relative', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 3,
                left: form.ativo ? 23 : 3,
                width: 16, height: 16,
                borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </button>
          </div>

          {/* Erro */}
          {erro && (
            <div role="alert" style={{
              background: 'var(--danger-subtle)',
              border: '1px solid var(--danger)',
              borderRadius: 10, padding: '10px 14px',
              color: 'var(--danger)', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span aria-hidden="true">⚠️</span> {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 28px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} style={{
            padding: '10px 20px', borderRadius: 10,
            background: 'transparent', border: '1px solid var(--border-input)',
            color: 'var(--text-muted)', fontSize: 14, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'border-color 0.2s, color 0.2s',
          }}>
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving} style={{
            padding: '10px 24px', borderRadius: 10,
            background: saving ? 'var(--accent-subtle)' : 'var(--accent)',
            border: 'none', color: saving ? 'var(--accent)' : '#fff',
            fontSize: 14, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'background 0.2s',
            boxShadow: saving ? 'none' : 'var(--shadow-accent)',
          }}>
            {saving ? (
              <>
                <span style={{ width: 14, height: 14, border: '2px solid var(--accent-border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
                Salvando...
              </>
            ) : '+ Cadastrar usuário'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Modal Editar ──────────────────────────────────────────────────────────────
function ModalEditar({ usuario, onClose, onSave }: {
  usuario: Usuario
  onClose: () => void
  onSave: (u: Usuario) => void
}) {
  const vinculadosIniciais: Municipio[] = (usuario.perfis_municipios ?? [])
    .map(v => ({ id: v.municipios.id, nome: v.municipios.nome, uf: v.municipios.uf }))

  const [form, setForm] = useState({ nome: usuario.nome, role: usuario.role, ativo: usuario.ativo })
  const [vinculados, setVinculados] = useState<Municipio[]>(vinculadosIniciais)
  const [erro, setErro]     = useState('')
  const [saving, setSaving] = useState(false)

  const addMunicipio = (id: string, nome: string, uf?: string) => {
    if (!id || vinculados.some(v => v.id === id)) return
    setVinculados(prev => [...prev, { id, nome, uf }])
  }

  const removeMunicipio = (id: string) => {
    setVinculados(prev => prev.filter(v => v.id !== id))
  }

  const handleSubmit = async () => {
    setErro('')
    if (!form.nome.trim()) return setErro('Informe o nome completo do usuário.')

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/usuarios/${usuario.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome:          form.nome,
          role:          form.role,
          ativo:         form.ativo,
          municipios_ids: vinculados.map(v => v.id),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error ?? 'Não foi possível salvar. Tente novamente.'); return }
      onSave(data)
    } catch { setErro('Sem conexão com o servidor. Verifique sua internet e tente novamente.') }
    finally { setSaving(false) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 200 }} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="modal-edit-title" style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'calc(100% - 32px)', maxWidth: 490, zIndex: 201,
        background: 'var(--bg-modal)', border: '1px solid var(--border-strong)',
        borderRadius: 20, boxShadow: 'var(--shadow-modal)',
        overflow: 'hidden', maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '22px 28px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 id="modal-edit-title" style={{ fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Editar Usuário</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{usuario.email}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar modal" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1 }}>

          {/* Nome */}
          <div>
            <label className="form-label" htmlFor="e-nome">Nome completo</label>
            <input id="e-nome" className="form-input" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </div>

          {/* Role */}
          <div>
            <label className="form-label" htmlFor="e-role">Perfil de acesso</label>
            <select id="e-role" className="form-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Municípios vinculados */}
          <div>
            <label className="form-label">Municípios vinculados</label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              O usuário poderá alternar entre esses municípios no painel.
            </p>

            {/* Chips dos municípios já vinculados */}
            {vinculados.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {vinculados.map(m => (
                  <div key={m.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)',
                    borderRadius: 20, padding: '4px 10px 4px 12px', fontSize: 13,
                    color: 'var(--accent)', fontWeight: 500,
                  }}>
                    <span>{m.nome}{m.uf ? ` · ${m.uf}` : ''}</span>
                    <button
                      onClick={() => removeMunicipio(m.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', padding: 0, opacity: 0.7 }}
                      title={`Remover ${m.nome}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Combobox para adicionar */}
            <MunicipioCombobox
              value=""
              onChange={(id, nome, uf) => addMunicipio(id, nome, uf)}
              placeholder="Buscar e adicionar município..."
              excludeIds={vinculados.map(v => v.id)}
            />
          </div>

          {/* Toggle ativo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
            <div>
              <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>Usuário ativo</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Permite acesso ao sistema</p>
            </div>
            <button role="switch" aria-checked={form.ativo} aria-label="Ativar usuário"
              onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
              style={{ width: 44, height: 24, borderRadius: 12, background: form.ativo ? 'var(--accent)' : 'var(--bg-input)', border: `1px solid ${form.ativo ? 'var(--accent)' : 'var(--border-input)'}`, cursor: 'pointer', transition: 'background 0.2s', position: 'relative', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 3, left: form.ativo ? 23 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </button>
          </div>

          {erro && (
            <div role="alert" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '10px 14px', color: 'var(--danger)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden="true">⚠️</span> {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border-input)', color: 'var(--text-muted)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving} style={{ padding: '10px 24px', borderRadius: 10, background: saving ? 'var(--accent-subtle)' : 'var(--accent)', border: 'none', color: saving ? 'var(--accent)' : '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, boxShadow: saving ? 'none' : 'var(--shadow-accent)' }}>
            {saving
              ? <><span style={{ width: 14, height: 14, border: '2px solid var(--accent-border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', display: 'inline-block', animation: 'spin .8s linear infinite' }} />Salvando...</>
              : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function UsuariosPage() {
  const [users, setUsers]       = useState<Usuario[]>([])
  const [municipios, setMunicipios] = useState<Municipio[]>([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando]   = useState<Usuario | null>(null)
  const [filtro, setFiltro]     = useState<'todos' | 'ativos' | 'inativos'>('todos')
  const [busca, setBusca]       = useState('')
  const [toast, setToast]       = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const showToast = (msg: string, tipo: 'ok' | 'erro' = 'ok') => {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/usuarios')
      const data = await res.json()
      if (res.ok) setUsers(data)
      else showToast(data.error ?? 'Não foi possível carregar os usuários.', 'erro')
    } catch { showToast('Sem conexão com o servidor.', 'erro') }
    finally { setLoading(false) }
  }, [])

  const fetchMunicipios = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/municipios?limit=50&ativo=todos')
      if (res.ok) {
        const json = await res.json()
        setMunicipios(Array.isArray(json) ? json : (json.data ?? []))
      }
    } catch {}
  }, [])

  useEffect(() => { fetchUsers(); fetchMunicipios() }, [fetchUsers, fetchMunicipios])

  const handleSave = (novo: Usuario) => {
    setUsers(prev => [novo, ...prev])
    setShowModal(false)
    showToast(`Usuário ${novo.nome} cadastrado!`)
  }

  const handleEditSave = (atualizado: Usuario) => {
    setUsers(prev => prev.map(u => u.id === atualizado.id ? atualizado : u))
    setEditando(null)
    showToast(`${atualizado.nome} atualizado!`)
  }

  const toggleAtivo = async (u: Usuario) => {
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ativo: !x.ativo } : x))
    try {
      const res = await fetch(`/api/admin/usuarios/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !u.ativo }),
      })
      if (!res.ok) {
        setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ativo: u.ativo } : x))
        showToast('Não foi possível atualizar o status. Tente novamente.', 'erro')
      } else {
        showToast(`${u.nome} foi ${!u.ativo ? 'ativado' : 'desativado'} com sucesso.`)
      }
    } catch {
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ativo: u.ativo } : x))
      showToast('Sem conexão com o servidor.', 'erro')
    }
  }

  const handleDelete = async (u: Usuario) => {
    if (!confirm(`Tem certeza que deseja remover ${u.nome}?\n\nEssa ação é permanente e não pode ser desfeita.`)) return
    setUsers(prev => prev.filter(x => x.id !== u.id))
    try {
      const res = await fetch(`/api/admin/usuarios/${u.id}`, { method: 'DELETE' })
      if (!res.ok) { fetchUsers(); showToast('Não foi possível remover o usuário. Tente novamente.', 'erro') }
      else showToast(`${u.nome} foi removido com sucesso.`)
    } catch { fetchUsers(); showToast('Sem conexão com o servidor.', 'erro') }
  }

  const roleColor = (role: string) => {
    if (role === 'super_admin')    return 'var(--role-super)'
    if (role === 'admin_municipal') return 'var(--role-admin)'
    return 'var(--role-operador)'
  }

  const filtered = users.filter(u => {
    const matchFiltro = filtro === 'todos' || (filtro === 'ativos' && u.ativo) || (filtro === 'inativos' && !u.ativo)
    const q = busca.toLowerCase()
    const matchBusca = !busca
      || u.nome.toLowerCase().includes(q)
      || u.email.toLowerCase().includes(q)
      || (u.municipios?.nome ?? '').toLowerCase().includes(q)
    return matchFiltro && matchBusca
  })

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Usuários
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {loading ? 'Carregando...' : `${users.length} cadastrados · ${users.filter(u => u.ativo).length} ativos`}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: '11px 22px', background: 'var(--accent)',
            border: 'none', borderRadius: 12,
            color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: 'var(--shadow-accent)',
            transition: 'background 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-hover)'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'}
        >
          + Novo usuário
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: 20, gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="Filtrar por status">
          {(['todos', 'ativos', 'inativos'] as const).map(f => (
            <button key={f} className={`filter-btn${filtro === f ? ' active' : ''}`} onClick={() => setFiltro(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <svg
            aria-hidden="true"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="search-input"
            placeholder="Buscar nome, e-mail, município..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            aria-label="Buscar usuários"
          />
        </div>
      </div>

      {/* Tabela */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16, overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {loading ? (
          <div style={{ padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div className="spinner" />
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Carregando usuários...</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} role="table">
              <thead>
                <tr style={{ background: 'var(--bg-surface-2)' }}>
                  {['Usuário', 'Município', 'Role', 'Status', 'Cadastrado em', 'Ações'].map(h => (
                    <th key={h} style={{
                      padding: '13px 20px', textAlign: 'left',
                      fontSize: 11, fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
                      {busca ? 'Nenhum resultado para a busca.' : 'Nenhum usuário encontrado.'}
                    </td>
                  </tr>
                ) : filtered.map(u => (
                  <tr key={u.id} className="table-row">
                    {/* Usuário */}
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%',
                          background: u.ativo
                            ? 'linear-gradient(135deg, var(--accent), var(--accent-hover))'
                            : 'var(--bg-surface-2)',
                          border: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700,
                          color: u.ativo ? '#fff' : 'var(--text-muted)',
                          flexShrink: 0,
                        }}>
                          {u.nome.charAt(0)}
                        </div>
                        <div>
                          <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.2 }}>{u.nome}</p>
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{u.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Município */}
                    <td style={{ padding: '14px 20px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {u.municipios?.nome ?? <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </td>

                    {/* Role */}
                    <td style={{ padding: '14px 20px' }}>
                      <span className="role-badge" style={{
                        background: 'var(--bg-surface-2)',
                        color: roleColor(u.role),
                        border: `1px solid var(--border)`,
                      }}>
                        {u.role}
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: u.ativo ? 'var(--success)' : 'var(--warning)' }}>
                        <span className="status-dot" style={{
                          background: u.ativo ? 'var(--success)' : 'var(--warning)',
                          boxShadow: u.ativo ? '0 0 6px var(--accent-glow)' : '0 0 6px var(--warning-subtle)',
                        }} />
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>

                    {/* Data */}
                    <td style={{ padding: '14px 20px', fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(u.criado_em).toLocaleDateString('pt-BR')}
                    </td>

                    {/* Ações */}
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="action-btn"
                          title="Editar usuário"
                          aria-label={`Editar ${u.nome}`}
                          onClick={() => setEditando(u)}
                          style={{ color: 'var(--accent)' }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button
                          className="action-btn"
                          title={u.ativo ? 'Desativar usuário' : 'Ativar usuário'}
                          aria-label={u.ativo ? `Desativar ${u.nome}` : `Ativar ${u.nome}`}
                          onClick={() => toggleAtivo(u)}
                          style={{ color: u.ativo ? 'var(--warning)' : 'var(--success)' }}
                        >
                          {u.ativo
                            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>
                            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                          }
                        </button>
                        <button
                          className="action-btn"
                          title="Excluir usuário"
                          aria-label={`Excluir ${u.nome}`}
                          onClick={() => handleDelete(u)}
                          style={{ color: 'var(--danger)' }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/>
                            <path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <ModalCadastro
          municipios={municipios}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}

      {editando && (
        <ModalEditar
          usuario={editando}
          onClose={() => setEditando(null)}
          onSave={handleEditSave}
        />
      )}

      {toast && (
        <div className={`toast ${toast.tipo}`} role="status" aria-live="polite">
          {toast.tipo === 'ok' ? '✓' : '⚠'} {toast.msg}
        </div>
      )}
    </div>
  )
}