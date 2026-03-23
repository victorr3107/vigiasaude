'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/app/contexts/ThemeContext'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Perfil {
  id: string
  nome: string
  email: string
  role: string
  tema: 'dark' | 'light'
  criado_em: string
}

type Aba = 'perfil' | 'interface' | 'sobre'

// ── Versão do sistema ─────────────────────────────────────────────────────────
const VERSAO = '0.1.0-alpha'
const BUILD_DATE = '2026'

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
      marginBottom: 16,
    }}>
      <div style={{
        padding: '18px 24px',
        borderBottom: '1px solid var(--border)',
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: description ? 3 : 0 }}>
          {title}
        </h2>
        {description && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{description}</p>
        )}
      </div>
      <div style={{ padding: '20px 24px' }}>
        {children}
      </div>
    </div>
  )
}

// ── Aba Perfil ────────────────────────────────────────────────────────────────
function AbaPerfil({ perfil, onUpdate }: { perfil: Perfil; onUpdate: (nome: string) => void }) {
  const [nome, setNome]               = useState(perfil.nome)
  const [senhaAtual, setSenhaAtual]   = useState('')
  const [novaSenha, setNovaSenha]     = useState('')
  const [confirmar, setConfirmar]     = useState('')
  const [savingNome, setSavingNome]   = useState(false)
  const [savingSenha, setSavingSenha] = useState(false)
  const [erroNome, setErroNome]       = useState('')
  const [erroSenha, setErroSenha]     = useState('')
  const [toast, setToast]             = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)

  const showToast = (msg: string, tipo: 'ok' | 'erro' = 'ok') => {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  const handleSaveNome = async () => {
    setErroNome('')
    if (!nome.trim()) return setErroNome('Nome não pode ser vazio.')
    if (nome.trim() === perfil.nome) return setErroNome('O nome é o mesmo atual.')

    setSavingNome(true)
    try {
      const res = await fetch('/api/admin/perfil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: perfil.id, nome: nome.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setErroNome(data.error); return }
      onUpdate(nome.trim())
      showToast('Nome atualizado com sucesso!')
    } catch { setErroNome('Falha de conexão.') }
    finally { setSavingNome(false) }
  }

  const handleSaveSenha = async () => {
    setErroSenha('')
    if (!senhaAtual) return setErroSenha('Informe a senha atual.')
    if (novaSenha.length < 8) return setErroSenha('Nova senha deve ter ao menos 8 caracteres.')
    if (novaSenha !== confirmar) return setErroSenha('As senhas não conferem.')
    if (novaSenha === senhaAtual) return setErroSenha('A nova senha deve ser diferente da atual.')

    setSavingSenha(true)
    try {
      // Valida senha atual via Supabase Auth
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: perfil.email,
        password: senhaAtual,
      })
      if (signInError) { setErroSenha('Senha atual incorreta.'); return }

      const res = await fetch('/api/admin/perfil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: perfil.id, novaSenha }),
      })
      const data = await res.json()
      if (!res.ok) { setErroSenha(data.error); return }

      setSenhaAtual('')
      setNovaSenha('')
      setConfirmar('')
      showToast('Senha alterada com sucesso!')
    } catch { setErroSenha('Falha de conexão.') }
    finally { setSavingSenha(false) }
  }

  return (
    <>
      {/* Identidade */}
      <Section title="Identidade" description="Suas informações exibidas no sistema">
        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700, color: '#fff', flexShrink: 0,
            boxShadow: 'var(--shadow-accent)',
          }}>
            {perfil.nome.charAt(0).toUpperCase()}
          </div>
          <div>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{perfil.nome}</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{perfil.email}</p>
            <span style={{
              display: 'inline-block', marginTop: 6,
              background: 'var(--accent-subtle)', color: 'var(--accent)',
              border: '1px solid var(--accent-border)',
              borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
            }}>
              {perfil.role}
            </span>
          </div>
        </div>

        {/* Campo nome */}
        <div style={{ maxWidth: 400 }}>
          <label className="form-label" htmlFor="cfg-nome">Nome de exibição</label>
          <input
            id="cfg-nome"
            className="form-input"
            value={nome}
            onChange={e => setNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveNome()}
          />
          {erroNome && (
            <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>⚠ {erroNome}</p>
          )}
          <div style={{ marginTop: 12 }}>
            <BtnPrimary onClick={handleSaveNome} loading={savingNome} label="Salvar nome" />
          </div>
        </div>
      </Section>

      {/* Alterar senha */}
      <Section title="Alterar senha" description="Recomendamos uma senha com letras, números e símbolos">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 400 }}>
          <div>
            <label className="form-label" htmlFor="cfg-senha-atual">Senha atual</label>
            <input id="cfg-senha-atual" className="form-input" type="password" placeholder="••••••••"
              value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} />
          </div>
          <div>
            <label className="form-label" htmlFor="cfg-nova-senha">Nova senha</label>
            <input id="cfg-nova-senha" className="form-input" type="password" placeholder="Mín. 8 caracteres"
              value={novaSenha} onChange={e => setNovaSenha(e.target.value)} />
          </div>
          <div>
            <label className="form-label" htmlFor="cfg-confirmar">Confirmar nova senha</label>
            <input id="cfg-confirmar" className="form-input" type="password" placeholder="Repita a nova senha"
              value={confirmar} onChange={e => setConfirmar(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveSenha()} />
          </div>

          {/* Indicador de força */}
          {novaSenha && <SenhaForca senha={novaSenha} />}

          {erroSenha && (
            <div role="alert" style={{
              background: 'var(--danger-subtle)', border: '1px solid var(--danger)',
              borderRadius: 10, padding: '10px 14px',
              color: 'var(--danger)', fontSize: 13,
            }}>
              ⚠ {erroSenha}
            </div>
          )}

          <div>
            <BtnPrimary onClick={handleSaveSenha} loading={savingSenha} label="Alterar senha" />
          </div>
        </div>
      </Section>

      {/* Dados da conta */}
      <Section title="Dados da conta" description="Informações somente leitura">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 500 }}>
          {[
            { label: 'E-mail', value: perfil.email },
            { label: 'Role', value: perfil.role },
            { label: 'Membro desde', value: new Date(perfil.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) },
            { label: 'ID', value: perfil.id.slice(0, 8) + '…' },
          ].map(item => (
            <div key={item.label}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                {item.label}
              </p>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {toast && (
        <div className={`toast ${toast.tipo}`} role="status" aria-live="polite">
          {toast.tipo === 'ok' ? '✓' : '⚠'} {toast.msg}
        </div>
      )}
    </>
  )
}

// ── Indicador de força da senha ────────────────────────────────────────────────
function SenhaForca({ senha }: { senha: string }) {
  const checks = [
    { label: 'Ao menos 8 caracteres',        ok: senha.length >= 8 },
    { label: 'Letras maiúsculas e minúsculas',ok: /[a-z]/.test(senha) && /[A-Z]/.test(senha) },
    { label: 'Ao menos um número',            ok: /\d/.test(senha) },
    { label: 'Ao menos um símbolo',           ok: /[^a-zA-Z0-9]/.test(senha) },
  ]
  const score = checks.filter(c => c.ok).length
  const color = score <= 1 ? 'var(--danger)' : score === 2 ? 'var(--warning)' : score === 3 ? 'var(--info)' : 'var(--success)'
  const label = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'][score]

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            flex: 1, height: 6, borderRadius: 4,
            background: i < score ? color : 'var(--border-strong)',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {checks.map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: c.ok ? 'var(--success)' : 'var(--text-dim)' }}>
              {c.ok ? '✓' : '○'}
            </span>
            <span style={{ fontSize: 12, color: c.ok ? 'var(--text-secondary)' : 'var(--text-dim)' }}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Aba Interface ─────────────────────────────────────────────────────────────
function AbaInterface({ perfil }: { perfil: Perfil }) {
  const { tema, toggleTema, isDark } = useTheme()

  return (
    <>
      <Section title="Aparência" description="Escolha como o sistema se apresenta para você">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 480 }}>
          {/* Dark */}
          <button
            onClick={() => !isDark && toggleTema()}
            aria-pressed={isDark}
            style={{
              background: isDark ? 'var(--accent-subtle)' : 'var(--bg-input)',
              border: `2px solid ${isDark ? 'var(--accent)' : 'var(--border-input)'}`,
              borderRadius: 14, padding: 16, cursor: 'pointer',
              textAlign: 'left', transition: 'all 0.2s',
            }}
          >
            <div style={{
              width: '100%', height: 64, borderRadius: 8,
              background: '#020617',
              border: '1px solid rgba(255,255,255,0.1)',
              marginBottom: 12, position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, background: 'rgba(255,255,255,0.03)', borderRight: '1px solid rgba(255,255,255,0.07)' }} />
              <div style={{ position: 'absolute', left: 36, top: 8, right: 8, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ position: 'absolute', left: 36, top: 22, right: 24, height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
              <div style={{ position: 'absolute', left: 36, top: 34, width: 20, height: 6, borderRadius: 4, background: 'rgba(16,185,129,0.4)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>🌙 Escuro</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Menos fadiga visual à noite</p>
              </div>
              {isDark && <span style={{ fontSize: 16 }}>✓</span>}
            </div>
          </button>

          {/* Light */}
          <button
            onClick={() => isDark && toggleTema()}
            aria-pressed={!isDark}
            style={{
              background: !isDark ? 'var(--accent-subtle)' : 'var(--bg-input)',
              border: `2px solid ${!isDark ? 'var(--accent)' : 'var(--border-input)'}`,
              borderRadius: 14, padding: 16, cursor: 'pointer',
              textAlign: 'left', transition: 'all 0.2s',
            }}
          >
            <div style={{
              width: '100%', height: 64, borderRadius: 8,
              background: '#F1F5F9',
              border: '1px solid rgba(0,0,0,0.08)',
              marginBottom: 12, position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, background: 'rgba(255,255,255,0.8)', borderRight: '1px solid rgba(0,0,0,0.06)' }} />
              <div style={{ position: 'absolute', left: 36, top: 8, right: 8, height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.07)' }} />
              <div style={{ position: 'absolute', left: 36, top: 22, right: 24, height: 6, borderRadius: 4, background: 'rgba(0,0,0,0.05)' }} />
              <div style={{ position: 'absolute', left: 36, top: 34, width: 20, height: 6, borderRadius: 4, background: 'rgba(5,150,105,0.4)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>☀️ Claro</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Melhor em ambientes iluminados</p>
              </div>
              {!isDark && <span style={{ fontSize: 16 }}>✓</span>}
            </div>
          </button>
        </div>

        <p style={{ marginTop: 14, fontSize: 12, color: 'var(--text-dim)' }}>
          ✓ Preferência salva automaticamente no seu perfil
        </p>
      </Section>
    </>
  )
}

// ── Aba Sobre ─────────────────────────────────────────────────────────────────
function AbaSobre() {
  const itens = [
    {
      label: 'Sistema',
      value: 'VigiaSaúde — Plataforma de gestão de saúde pública municipal',
    },
    { label: 'Versão',  value: `v${VERSAO} · ${BUILD_DATE}` },
    { label: 'Stack',   value: 'Next.js 15 · Supabase · TypeScript' },
    { label: 'Suporte', value: 'vihh.rodrigues@gmail.com' },
  ]

  return (
    <>
      <Section title="Sobre o sistema">
        {/* Logo área */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '20px 24px',
          background: 'var(--bg-surface-2)',
          borderRadius: 12,
          marginBottom: 20,
          border: '1px solid var(--border)',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-accent)',
            flexShrink: 0,
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <p style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Vigia<span style={{ color: 'var(--accent)' }}>Saúde</span>
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              Inteligência em saúde pública municipal
            </p>
          </div>
          <span style={{
            marginLeft: 'auto',
            background: 'var(--warning-subtle)', color: 'var(--warning)',
            border: '1px solid var(--warning)',
            borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700,
            opacity: 0.8,
          }}>
            ALPHA
          </span>
        </div>

        {/* Infos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {itens.map(item => (
            <div key={item.label} style={{
              display: 'flex', alignItems: 'flex-start', gap: 16,
              paddingBottom: 14, borderBottom: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 80, paddingTop: 1 }}>
                {item.label}
              </span>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Fontes de dados" description="Sistemas do Ministério da Saúde integrados ou previstos">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {[
            { sigla: 'SISAB',  nome: 'Atenção Básica',            status: 'previsto' },
            { sigla: 'SIASUS', nome: 'Produção Ambulatorial',      status: 'previsto' },
            { sigla: 'SIHSUS', nome: 'Internações Hospitalares',   status: 'previsto' },
            { sigla: 'CNES',   nome: 'Estabelecimentos',           status: 'previsto' },
            { sigla: 'FNS',    nome: 'Repasses Financeiros',       status: 'previsto' },
            { sigla: 'RNDS',   nome: 'Rede Nac. de Dados de Saúde',status: 'futuro'   },
          ].map(f => (
            <div key={f.sigla} style={{
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {f.sigla}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, borderRadius: 20, padding: '2px 8px',
                  background: f.status === 'previsto' ? 'var(--info-subtle)' : 'var(--bg-input)',
                  color: f.status === 'previsto' ? 'var(--info)' : 'var(--text-dim)',
                  border: `1px solid ${f.status === 'previsto' ? 'var(--info)' : 'var(--border)'}`,
                  opacity: f.status === 'previsto' ? 1 : 0.6,
                }}>
                  {f.status === 'previsto' ? 'previsto' : 'futuro'}
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.nome}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

// ── Botão primário reutilizável ────────────────────────────────────────────────
function BtnPrimary({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      padding: '10px 22px', borderRadius: 10,
      background: loading ? 'var(--accent-subtle)' : 'var(--accent)',
      border: 'none',
      color: loading ? 'var(--accent)' : '#fff',
      fontSize: 14, fontWeight: 600,
      cursor: loading ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit',
      display: 'flex', alignItems: 'center', gap: 8,
      transition: 'background 0.2s',
      boxShadow: loading ? 'none' : 'var(--shadow-accent)',
    }}>
      {loading && (
        <span style={{
          width: 14, height: 14,
          border: '2px solid var(--accent-border)',
          borderTop: '2px solid var(--accent)',
          borderRadius: '50%', display: 'inline-block',
          animation: 'spin .8s linear infinite',
        }} />
      )}
      {loading ? 'Salvando…' : label}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ConfiguracoesPage() {
  const [aba, setAba]       = useState<Aba>('perfil')
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data } = await supabase
        .from('perfis')
        .select('id, nome, email, role, tema, criado_em')
        .eq('id', session.user.id)
        .single()

      if (data) setPerfil({ ...data, email: session.user.email ?? data.email } as Perfil)
      setLoading(false)
    }
    init()
  }, [])

  const ABAS: { id: Aba; label: string; icon: string }[] = [
    { id: 'perfil',    label: 'Perfil',    icon: '👤' },
    { id: 'interface', label: 'Interface', icon: '🎨' },
    { id: 'sobre',     label: 'Sobre',     icon: 'ℹ️'  },
  ]

  if (loading || !perfil) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Configurações
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Gerencie seu perfil, preferências e informações do sistema
        </p>
      </div>

      {/* Abas */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12, padding: 4,
        width: 'fit-content',
      }}>
        {ABAS.map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            aria-pressed={aba === a.id}
            style={{
              padding: '8px 18px', borderRadius: 9, border: 'none',
              background: aba === a.id ? 'var(--accent)' : 'transparent',
              color: aba === a.id ? '#fff' : 'var(--text-muted)',
              fontSize: 13, fontWeight: aba === a.id ? 600 : 500,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: aba === a.id ? 'var(--shadow-accent)' : 'none',
            }}
          >
            <span aria-hidden="true">{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {aba === 'perfil'    && <AbaPerfil perfil={perfil} onUpdate={nome => setPerfil(p => p ? { ...p, nome } : p)} />}
      {aba === 'interface' && <AbaInterface perfil={perfil} />}
      {aba === 'sobre'     && <AbaSobre />}
    </div>
  )
}