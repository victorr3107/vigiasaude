'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Municipio {
  id: string
  nome: string
  uf: string
}

export default function LoginPage() {
  const [etapa, setEtapa]     = useState<'login' | 'escolher'>('login')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [userId, setUserId]   = useState('')
  const [municipiosDisponiveis, setMunicipiosDisponiveis] = useState<Municipio[]>([])
  const [municipioSelecionado, setMunicipioSelecionado] = useState<Municipio | null>(null)
  const [dropdownAberto, setDropdownAberto] = useState(false)
  const [buscaMunicipio, setBuscaMunicipio] = useState('')
  const [escolhendo, setEscolhendo] = useState(false)

  // Redireciona se já estiver autenticado (suprimido se ?sair=1 estiver na URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('sair') === '1') return          // usuário chegou via logout explícito
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) window.location.href = '/dashboard'
    })
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('E-mail ou senha incorretos. Verifique seus dados e tente novamente.')
      setLoading(false)
      return
    }

    // Auth OK — busca perfil via API admin (bypassa RLS, retorna perfis_municipios completo)
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session!.user.id
    setUserId(uid)

    const res = await fetch(`/api/admin/usuarios/${uid}`)
    const perfilData = await res.json()

    const munis: Municipio[] = (perfilData.perfis_municipios ?? [])
      .map((v: any) => v.municipios)
      .filter(Boolean)
      .map((m: any) => ({ id: m.id, nome: m.nome, uf: m.uf ?? '' }))

    if (munis.length <= 1) {
      // 0 ou 1 município: entra direto
      if (munis.length === 1) {
        await fetch(`/api/admin/usuarios/${uid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ municipio_ativo_id: munis[0].id }),
        })
      }
      window.location.href = '/dashboard'
      return
    }

    // 2+ municípios: pede para escolher (qualquer role)
    setMunicipiosDisponiveis(munis)
    setEtapa('escolher')
    setLoading(false)
  }

  const handleEscolherMunicipio = async (m: Municipio) => {
    setEscolhendo(true)
    await fetch(`/api/admin/usuarios/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ municipio_ativo_id: m.id }),
    })
    window.location.href = '/dashboard'
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        html, body {
          height: 100%;
          font-family: 'Inter', sans-serif;
          background: var(--bg-base);
        }

        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        .orb {
          position: fixed;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.12;
          pointer-events: none;
          z-index: 0;
        }
        .orb-1 { width: 400px; height: 400px; background: var(--accent); top: -100px; left: -100px; }
        .orb-2 { width: 300px; height: 300px; background: var(--info); bottom: -80px; right: -80px; }

        .card {
          width: 100%;
          max-width: 420px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          padding: 40px;
          position: relative;
          z-index: 10;
          animation: fadeUp 0.5s ease both;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .brand { text-align: center; margin-bottom: 32px; }
        .logo-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 56px; height: 56px;
          border-radius: 14px;
          background: linear-gradient(135deg, var(--accent), var(--info));
          margin-bottom: 12px;
          box-shadow: var(--shadow-accent);
        }
        .logo-icon span { color: white; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
        .brand-name { color: var(--text-primary); font-size: 24px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; margin-bottom: 6px; }
        .brand-sub { color: var(--text-secondary); font-size: 13px; }

        .form-title { color: var(--text-primary); font-size: 15px; font-weight: 600; margin-bottom: 20px; }

        .field { margin-bottom: 16px; }
        .field-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }

        label { color: var(--text-secondary); font-size: 13px; font-weight: 500; }

        .forgot {
          color: var(--accent); font-size: 12px; font-weight: 500;
          cursor: pointer; background: none; border: none;
          font-family: 'Inter', sans-serif; transition: color 0.2s;
        }
        .forgot:hover { color: var(--accent-hover); }

        .input-base {
          width: 100%;
          background: var(--bg-input);
          border: 1px solid var(--border-input);
          border-radius: 10px;
          padding: 11px 16px;
          color: var(--text-primary);
          font-size: 14px;
          font-family: 'Inter', sans-serif;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .input-base::placeholder { color: var(--text-dim); }
        .input-base:focus {
          border-color: var(--border-focus);
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }

        /* ── Dropdown ── */
        .dropdown { position: relative; }

        .dropdown-trigger {
          width: 100%;
          background: var(--bg-input);
          border: 1px solid var(--border-input);
          border-radius: 10px;
          padding: 11px 40px 11px 16px;
          color: var(--text-primary);
          font-size: 14px;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          display: flex;
          align-items: center;
          text-align: left;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .dropdown-trigger.placeholder-text { color: var(--text-dim); }
        .dropdown-trigger.open,
        .dropdown-trigger:focus {
          border-color: var(--border-focus);
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }

        .dropdown-arrow {
          position: absolute; right: 14px; top: 50%;
          transform: translateY(-50%);
          color: var(--text-dim); pointer-events: none;
          transition: transform 0.2s;
        }
        .dropdown-arrow.open { transform: translateY(-50%) rotate(180deg); }

        .dropdown-menu {
          position: absolute;
          top: calc(100% + 6px);
          left: 0; right: 0;
          background: var(--bg-modal);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          z-index: 100;
          box-shadow: var(--shadow-modal);
          animation: dropIn 0.15s ease;
        }
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .dropdown-search-wrap {
          padding: 10px 10px 6px;
          border-bottom: 1px solid var(--border);
        }
        .dropdown-search {
          width: 100%;
          background: var(--bg-surface-2);
          border: 1px solid var(--border-input);
          border-radius: 8px;
          padding: 8px 12px 8px 34px;
          color: var(--text-primary);
          font-size: 13px;
          font-family: 'Inter', sans-serif;
          outline: none;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }
        .dropdown-search:focus { border-color: var(--border-focus); }
        .dropdown-search::placeholder { color: var(--text-dim); }
        .dropdown-search-icon {
          position: absolute; left: 22px; top: 50%; transform: translateY(-50%);
          color: var(--text-dim); pointer-events: none;
        }

        .dropdown-list { max-height: 220px; overflow-y: auto; padding: 6px; scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb) transparent; }
        .dropdown-list::-webkit-scrollbar { width: 4px; }
        .dropdown-list::-webkit-scrollbar-track { background: transparent; }
        .dropdown-list::-webkit-scrollbar-thumb { background: var(--border-input); border-radius: 2px; }

        .dropdown-item {
          padding: 10px 12px;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          border-radius: 8px;
          transition: background 0.12s, color 0.12s;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .dropdown-item:hover { background: var(--bg-hover); color: var(--text-primary); }
        .dropdown-item.selected { background: var(--accent-subtle); color: var(--accent); }
        .dropdown-item.selected .dropdown-item-uf { background: var(--accent-subtle); color: var(--accent); border-color: var(--accent-border); }

        .dropdown-item-uf {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          background: var(--bg-surface-2);
          border: 1px solid var(--border-input);
          border-radius: 5px;
          padding: 2px 6px;
          flex-shrink: 0;
        }

        .dropdown-hint {
          padding: 8px 12px;
          color: var(--text-dim);
          font-size: 12px;
          text-align: center;
          font-style: italic;
          border-top: 1px solid var(--border);
          margin-top: 4px;
        }
        .dropdown-empty { padding: 16px 12px; color: var(--text-dim); font-size: 13px; text-align: center; }

        /* ── Input wrap ── */
        .input-wrap { position: relative; }
        .eye-btn {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: var(--text-dim);
          padding: 4px; display: flex; align-items: center; transition: color 0.2s;
        }
        .eye-btn:hover { color: var(--text-secondary); }

        .error-box {
          background: var(--danger-subtle); border: 1px solid var(--danger);
          border-radius: 10px; padding: 10px 14px; color: var(--danger);
          font-size: 13px; margin-bottom: 16px;
        }

        .btn-submit {
          width: 100%; background: var(--accent); color: var(--text-on-accent);
          font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 600;
          border: none; border-radius: 10px; padding: 13px; cursor: pointer;
          transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
          box-shadow: var(--shadow-accent);
        }
        .btn-submit:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-1px); box-shadow: var(--shadow-md); }
        .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        .divider { border: none; border-top: 1px solid var(--border); margin: 20px 0 14px; }
        .support-text { text-align: center; color: var(--text-dim); font-size: 12px; }
        .support-text a { color: var(--accent); text-decoration: none; }

        footer { margin-top: 20px; text-align: center; color: var(--text-dim); font-size: 12px; position: relative; z-index: 0; }

        .spinner {
          display: inline-block; width: 16px; height: 16px;
          border: 2px solid var(--accent-subtle); border-top-color: var(--text-on-accent);
          border-radius: 50%; animation: spin 0.7s linear infinite;
          margin-right: 8px; vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="page">
        <div className="orb orb-1" aria-hidden="true" />
        <div className="orb orb-2" aria-hidden="true" />

        <div className="card">
          <div className="brand">
            <div className="logo-icon"><span>VS</span></div>
            <div className="brand-name">VigiaSaúde</div>
            <div className="brand-sub">Plataforma de Gestão em Saúde Municipal</div>
          </div>

          {etapa === 'escolher' ? (
            /* ── Passo 2: escolher município ── */
            (() => {
              const filtrados = buscaMunicipio.trim()
                ? municipiosDisponiveis.filter(m =>
                    m.nome.toLowerCase().includes(buscaMunicipio.toLowerCase()) ||
                    m.uf.toLowerCase().includes(buscaMunicipio.toLowerCase())
                  )
                : municipiosDisponiveis.slice(0, 5)

              return (
                <>
                  <div className="form-title">Selecione o município</div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
                    Sua conta tem acesso a mais de um município. Escolha com qual deseja trabalhar agora.
                  </p>

                  {/* Dropdown com busca */}
                  <div className="field">
                    <label>Município</label>
                    <div className="dropdown">
                      <button
                        type="button"
                        className={`dropdown-trigger ${!municipioSelecionado ? 'placeholder-text' : ''} ${dropdownAberto ? 'open' : ''}`}
                        onClick={() => { setDropdownAberto(o => !o); setBuscaMunicipio('') }}
                      >
                        {municipioSelecionado
                          ? municipioSelecionado.nome
                          : 'Selecione o município...'}
                        {municipioSelecionado && (
                          <span className="dropdown-item-uf" style={{ marginLeft: 10 }}>{municipioSelecionado.uf}</span>
                        )}
                      </button>
                      <span className={`dropdown-arrow ${dropdownAberto ? 'open' : ''}`}>
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </span>

                      {dropdownAberto && (
                        <div className="dropdown-menu">
                          {/* Campo de busca */}
                          <div className="dropdown-search-wrap" style={{ position: 'relative' }}>
                            <svg className="dropdown-search-icon" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            <input
                              className="dropdown-search"
                              placeholder="Buscar município..."
                              value={buscaMunicipio}
                              onChange={e => setBuscaMunicipio(e.target.value)}
                              autoFocus
                            />
                          </div>

                          <div className="dropdown-list">
                            {filtrados.length === 0 ? (
                              <div className="dropdown-empty">Nenhum município encontrado</div>
                            ) : (
                              filtrados.map(m => (
                                <div
                                  key={m.id}
                                  className={`dropdown-item ${municipioSelecionado?.id === m.id ? 'selected' : ''}`}
                                  onClick={() => {
                                    setMunicipioSelecionado(m)
                                    setDropdownAberto(false)
                                    setBuscaMunicipio('')
                                  }}
                                >
                                  <span>{m.nome}</span>
                                  <span className="dropdown-item-uf">{m.uf}</span>
                                </div>
                              ))
                            )}
                            {!buscaMunicipio && municipiosDisponiveis.length > 5 && (
                              <div className="dropdown-hint">
                                + {municipiosDisponiveis.length - 5} municípios — use a busca para filtrar
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-submit"
                    disabled={!municipioSelecionado || escolhendo}
                    onClick={() => municipioSelecionado && handleEscolherMunicipio(municipioSelecionado)}
                    style={{ marginTop: 8 }}
                  >
                    {escolhendo && <span className="spinner" />}
                    {escolhendo ? 'Entrando...' : 'Entrar no painel'}
                  </button>
                </>
              )
            })()
          ) : (
            <>
              <div className="form-title">Acesse sua conta</div>

              <form onSubmit={handleLogin}>
                {/* E-mail */}
                <div className="field">
                  <label>E-mail</label>
                  <input
                    className="input-base"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@municipio.gov.br"
                    required
                  />
                </div>

                {/* Senha */}
                <div className="field">
                  <div className="field-header">
                    <label>Senha</label>
                    <button type="button" className="forgot">Esqueci minha senha</button>
                  </div>
                  <div className="input-wrap">
                    <input
                      className="input-base"
                      type={showPassword ? 'text' : 'password'}
                      style={{ paddingRight: '44px' }}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                    <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? (
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                          <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {error && <div className="error-box">{error}</div>}

                <button type="submit" className="btn-submit" disabled={loading}>
                  {loading && <span className="spinner" />}
                  {loading ? 'Verificando...' : 'Entrar'}
                </button>
              </form>

              <hr className="divider" />
              <p className="support-text">
                Problemas de acesso? <a href="mailto:suporte@vigiasaude.com.br">Contate o suporte</a>
              </p>
            </>
          )}
        </div>

        <footer>© 2026 VigiaSaúde — Dados protegidos conforme LGPD</footer>
      </div>
    </>
  )
}
