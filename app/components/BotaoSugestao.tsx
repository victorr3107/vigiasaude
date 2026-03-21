'use client'

import { useState } from 'react'
import { Lightbulb, X, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface SugestaoForm {
  titulo: string
  categoria: string
  descricao: string
}

const categorias = [
  { value: 'NOVO_GRAFICO', label: 'Novo gráfico ou visualização', icon: '📊' },
  { value: 'NOVA_ROTINA',  label: 'Nova rotina ou funcionalidade', icon: '⚙️' },
  { value: 'MELHORIA',     label: 'Melhoria no que já existe',    icon: '✨' },
  { value: 'BUG',          label: 'Algo não está funcionando',    icon: '🐛' },
  { value: 'OUTRO',        label: 'Outro',                        icon: '💬' },
]

export default function BotaoSugestao() {
  const [aberto, setAberto] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState<SugestaoForm>({ titulo: '', categoria: '', descricao: '' })

  const fechar = () => {
    if (loading) return
    setAberto(false)
    setErro('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.titulo.trim() || !form.categoria || !form.descricao.trim()) return

    setLoading(true)
    setErro('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Não autenticado')

      const response = await fetch('/api/sugestoes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(form),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao enviar sugestão')
      }

      setSucesso(true)
      setForm({ titulo: '', categoria: '', descricao: '' })

      setTimeout(() => {
        setSucesso(false)
        setAberto(false)
      }, 2500)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao enviar sugestão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* FAB — canto inferior direito */}
      <button
        onClick={() => { setAberto(true); setSucesso(false); setErro('') }}
        title="Enviar sugestão"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 16,
          paddingRight: 20,
          paddingTop: 12,
          paddingBottom: 12,
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          boxShadow: '0 4px 16px var(--accent-glow)',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          transition: 'background 0.2s, transform 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}
        onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.96)')}
        onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <Lightbulb size={18} />
        <span>Sugerir</span>
      </button>

      {/* Modal */}
      {aberto && (
        <>
          {/* Backdrop */}
          <div
            onClick={fechar}
            aria-hidden="true"
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(4px)',
              zIndex: 200,
            }}
          />

          {/* Painel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sugestao-modal-title"
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'calc(100% - 32px)',
              maxWidth: 520,
              zIndex: 201,
              background: 'var(--bg-modal)',
              border: '1px solid var(--border-strong)',
              borderRadius: 20,
              boxShadow: 'var(--shadow-modal)',
              overflow: 'hidden',
              maxHeight: '90dvh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '22px 28px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <div>
                <h2
                  id="sugestao-modal-title"
                  style={{ fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}
                >
                  Enviar Sugestão
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                  Sua ideia será analisada pela equipe
                </p>
              </div>
              <button
                onClick={fechar}
                aria-label="Fechar modal"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-input)',
                  borderRadius: 8,
                  width: 32, height: 32,
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1 }}>
              {sucesso ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{
                    width: 64, height: 64,
                    background: 'var(--accent-subtle)',
                    border: '1px solid var(--accent-border)',
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}>
                    <Send size={28} color="var(--accent)" />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
                    Sugestão enviada!
                  </h3>
                  <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                    Sua sugestão foi registrada. Acompanhe o status em <strong>Minhas Sugestões</strong>.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                  {/* Título */}
                  <div>
                    <label className="form-label" htmlFor="sug-titulo">
                      Título da sugestão *
                    </label>
                    <input
                      id="sug-titulo"
                      className="form-input"
                      type="text"
                      value={form.titulo}
                      onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                      maxLength={120}
                      placeholder="Descreva brevemente sua sugestão"
                      required
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginTop: 4 }}>
                      {form.titulo.length}/120
                    </div>
                  </div>

                  {/* Categoria */}
                  <div>
                    <label className="form-label">Categoria *</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                      {categorias.map(cat => (
                        <label
                          key={cat.value}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 12px',
                            border: `1px solid ${form.categoria === cat.value ? 'var(--accent-border)' : 'var(--border-input)'}`,
                            borderRadius: 10,
                            cursor: 'pointer',
                            background: form.categoria === cat.value ? 'var(--accent-subtle)' : 'var(--bg-input)',
                            transition: 'all 0.15s',
                          }}
                        >
                          <input
                            type="radio"
                            name="categoria"
                            value={cat.value}
                            checked={form.categoria === cat.value}
                            onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                            style={{ display: 'none' }}
                          />
                          <span style={{ fontSize: 16 }}>{cat.icon}</span>
                          <span style={{
                            fontSize: 13,
                            color: form.categoria === cat.value ? 'var(--accent)' : 'var(--text-primary)',
                            fontWeight: form.categoria === cat.value ? 600 : 400,
                          }}>
                            {cat.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Descrição */}
                  <div>
                    <label className="form-label" htmlFor="sug-descricao">
                      Descrição detalhada *
                    </label>
                    <textarea
                      id="sug-descricao"
                      className="form-input"
                      value={form.descricao}
                      onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                      maxLength={1000}
                      rows={5}
                      placeholder="Explique sua sugestão em detalhes..."
                      required
                      style={{ resize: 'none' }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginTop: 4 }}>
                      {form.descricao.length}/1000
                    </div>
                  </div>

                  {/* Erro */}
                  {erro && (
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      fontSize: 13,
                      color: '#f87171',
                    }}>
                      {erro}
                    </div>
                  )}

                  {/* Botão enviar */}
                  <button
                    type="submit"
                    disabled={loading || !form.titulo.trim() || !form.categoria || !form.descricao.trim()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '12px 20px',
                      background: loading || !form.titulo.trim() || !form.categoria || !form.descricao.trim()
                        ? 'var(--border-strong)' : 'var(--accent)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: loading || !form.titulo.trim() || !form.categoria || !form.descricao.trim()
                        ? 'not-allowed' : 'pointer',
                      transition: 'background 0.2s',
                    }}
                  >
                    {loading ? (
                      <>
                        <div style={{
                          width: 16, height: 16,
                          border: '2px solid rgba(255,255,255,0.3)',
                          borderTopColor: '#fff',
                          borderRadius: '50%',
                          animation: 'spin 0.7s linear infinite',
                        }} />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        Enviar sugestão
                      </>
                    )}
                  </button>

                </form>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
