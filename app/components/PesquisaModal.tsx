'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Pesquisa {
  id: string
  titulo: string
  descricao?: string
  permite_adiar: boolean
  perguntas: Pergunta[]
}

interface Pergunta {
  id: string
  texto: string
  tipo: 'NPS' | 'ESCALA' | 'MULTIPLA_ESCOLHA' | 'UNICA_ESCOLHA' | 'TEXTO_LIVRE'
  obrigatoria: boolean
  permite_pular: boolean
  opcoes?: { valor: string; rotulo: string; icone?: string }[]
  config?: { min: number; max: number; label_min?: string; label_max?: string }
}

interface Resposta {
  pergunta_id: string
  valor_numerico?: number
  valor_texto?: string
  valor_opcoes?: string[]
  pulada: boolean
}

type EstadoModal = 'respondendo' | 'confirmando_recusa' | 'sucesso'

// ── Componente ────────────────────────────────────────────────────────────────

export default function PesquisaModal({
  pesquisa,
  onClose,
}: {
  pesquisa: Pesquisa
  onClose: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({})
  const [estado, setEstado] = useState<EstadoModal>('respondendo')
  const [loading, setLoading] = useState(false)
  const [erroMsg, setErroMsg] = useState('')

  const total = pesquisa.perguntas.length
  const pergunta = pesquisa.perguntas[idx]
  const resp: Partial<Resposta> = respostas[pergunta?.id] ?? {}
  const progresso = total > 0 ? ((idx + 1) / total) * 100 : 0

  const temResposta = () => {
    if (resp.pulada) return true
    if (resp.valor_numerico !== undefined) return true
    if (resp.valor_texto?.trim()) return true
    if (resp.valor_opcoes && resp.valor_opcoes.length > 0) return true
    return false
  }

  const podeAvancar = !pergunta?.obrigatoria || pergunta?.permite_pular || temResposta()

  const atualizar = (updates: Partial<Resposta>) => {
    setRespostas(prev => ({
      ...prev,
      [pergunta.id]: { pergunta_id: pergunta.id, pulada: false, ...resp, ...updates },
    }))
  }

  const avancar = () => { if (idx < total - 1) setIdx(i => i + 1) }
  const voltar  = () => { if (idx > 0) setIdx(i => i - 1) }
  const pular   = () => { atualizar({ pulada: true }); avancar() }

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  const enviar = async () => {
    setLoading(true)
    setErroMsg('')
    try {
      const token = await getToken()
      if (!token) { setErroMsg('Sessão expirada. Recarregue a página.'); return }

      const res = await fetch(`/api/pesquisas/${pesquisa.id}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ respostas: Object.values(respostas) }),
      })

      if (!res.ok) { setErroMsg('Erro ao enviar. Tente novamente.'); return }

      setEstado('sucesso')
      setTimeout(() => onClose(), 2000)
    } catch {
      setErroMsg('Erro ao enviar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const adiar = async () => {
    try {
      const token = await getToken()
      if (token) await fetch(`/api/pesquisas/${pesquisa.id}/adiar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch { /* silencioso */ }
    onClose()
  }

  const confirmarRecusa = async () => {
    try {
      const token = await getToken()
      if (token) await fetch(`/api/pesquisas/${pesquisa.id}/recusar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch { /* silencioso */ }
    onClose()
  }

  // ── Render por tipo ──────────────────────────────────────────────────────

  const renderResposta = () => {
    switch (pergunta.tipo) {
      case 'NPS':
        return (
          <div>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
              {Array.from({ length: 11 }, (_, i) => {
                const cor = i <= 6 ? '#ef4444' : i <= 8 ? '#f59e0b' : '#10b981'
                const sel = resp.valor_numerico === i
                return (
                  <button
                    key={i}
                    onClick={() => { atualizar({ valor_numerico: i, pulada: false }); setTimeout(avancar, 180) }}
                    style={{
                      width: 30, height: 30, borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: `2px solid ${sel ? cor : 'var(--border-input)'}`,
                      background: sel ? `${cor}22` : 'var(--bg-surface)',
                      color: sel ? cor : 'var(--text-secondary)',
                      transition: 'all .15s',
                    }}
                  >
                    {i}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 11, color: 'var(--text-muted)' }}>
              <span>{pergunta.config?.label_min || 'Muito improvável'}</span>
              <span>{pergunta.config?.label_max || 'Muito provável'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 5 }}>
              <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>0–6 Detratores</span>
              <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>7–8 Neutros</span>
              <span style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>9–10 Promotores</span>
            </div>
          </div>
        )

      case 'ESCALA': {
        const min = pergunta.config?.min ?? 1
        const max = pergunta.config?.max ?? 5
        return (
          <div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              {Array.from({ length: max - min + 1 }, (_, i) => {
                const v = min + i
                const sel = resp.valor_numerico === v
                return (
                  <button
                    key={v}
                    onClick={() => atualizar({ valor_numerico: v, pulada: false })}
                    style={{
                      width: 42, height: 42, borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer',
                      border: `2px solid ${sel ? 'var(--info)' : 'var(--border-input)'}`,
                      background: sel ? 'var(--info-subtle)' : 'var(--bg-surface)',
                      color: sel ? 'var(--info)' : 'var(--text-secondary)',
                      transition: 'all .15s',
                    }}
                  >{v}</button>
                )
              })}
            </div>
            {(pergunta.config?.label_min || pergunta.config?.label_max) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                <span>{pergunta.config?.label_min}</span>
                <span>{pergunta.config?.label_max}</span>
              </div>
            )}
          </div>
        )
      }

      case 'UNICA_ESCOLHA':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {pergunta.opcoes?.map(op => {
              const sel = resp.valor_opcoes?.includes(op.valor)
              return (
                <button
                  key={op.valor}
                  onClick={() => { atualizar({ valor_opcoes: [op.valor], pulada: false }); setTimeout(avancar, 180) }}
                  style={{
                    padding: '10px 14px', textAlign: 'left', borderRadius: 9, cursor: 'pointer', fontSize: 13,
                    border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border-input)'}`,
                    background: sel ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                    color: 'var(--text-primary)', transition: 'all .15s',
                  }}
                >
                  {op.icone && <span style={{ marginRight: 8 }}>{op.icone}</span>}
                  {op.rotulo}
                </button>
              )
            })}
          </div>
        )

      case 'MULTIPLA_ESCOLHA':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {pergunta.opcoes?.map(op => {
              const sel = resp.valor_opcoes?.includes(op.valor)
              return (
                <label
                  key={op.valor}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    borderRadius: 9, cursor: 'pointer', fontSize: 13,
                    border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border-input)'}`,
                    background: sel ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                    color: 'var(--text-primary)', transition: 'all .15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!sel}
                    onChange={e => {
                      const atual = resp.valor_opcoes ?? []
                      atualizar({
                        valor_opcoes: e.target.checked
                          ? [...atual, op.valor]
                          : atual.filter(v => v !== op.valor),
                        pulada: false,
                      })
                    }}
                    style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}
                  />
                  {op.icone && <span>{op.icone}</span>}
                  {op.rotulo}
                </label>
              )
            })}
          </div>
        )

      case 'TEXTO_LIVRE':
        return (
          <textarea
            value={resp.valor_texto ?? ''}
            onChange={e => atualizar({ valor_texto: e.target.value, pulada: false })}
            placeholder="Digite sua resposta..."
            maxLength={500}
            rows={4}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 9, fontSize: 13, resize: 'none',
              border: '1.5px solid var(--border-input)', background: 'var(--bg-input)',
              color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
            } as React.CSSProperties}
          />
        )

      default:
        return null
    }
  }

  // ── Container base ────────────────────────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    position: 'fixed', bottom: 20, right: 20, zIndex: 999,
    width: 380, borderRadius: 16,
    background: 'var(--bg-modal)', border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-modal)', overflow: 'hidden',
  }

  // ── Estado: sucesso ───────────────────────────────────────────────────────

  if (estado === 'sucesso') {
    return (
      <div style={containerStyle}>
        <style>{`
          @keyframes _checkIn { 0%{transform:scale(0);opacity:0} 60%{transform:scale(1.2);opacity:1} 100%{transform:scale(1);opacity:1} }
          @keyframes _fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        `}</style>
        <div style={{ padding: '36px 24px', textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 32,
            background: 'var(--success-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            animation: '_checkIn .45s cubic-bezier(.34,1.56,.64,1) both',
          }}>
            <svg width="30" height="30" fill="none" stroke="var(--success)" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', animation: '_fadeUp .4s ease-out .25s both' }}>
            Obrigado!
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', animation: '_fadeUp .4s ease-out .35s both' }}>
            Seu feedback é muito importante para nós.
          </p>
        </div>
      </div>
    )
  }

  // ── Estado: respondendo / confirmando_recusa ──────────────────────────────

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 10px' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', flex: 1, paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pesquisa.titulo}
        </p>
        <button
          onClick={pesquisa.permite_adiar ? adiar : onClose}
          title={pesquisa.permite_adiar ? 'Responder depois' : 'Fechar'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6, display: 'flex', flexShrink: 0 }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Barra de progresso */}
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 4, background: 'var(--bg-surface-2)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: 4, background: 'var(--accent)', width: `${progresso}%`, borderRadius: 4, transition: 'width .3s ease' }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {idx + 1} / {total}
        </span>
      </div>

      {/* Pergunta */}
      <div style={{ padding: '0 16px 16px' }}>
        <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.4 }}>
          {pergunta.texto}
          {!pergunta.obrigatoria && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 6 }}>(opcional)</span>
          )}
        </p>
        <div style={{ marginTop: 14 }}>
          {renderResposta()}
        </div>
      </div>

      {/* Toast de erro */}
      {erroMsg && (
        <div style={{ margin: '0 16px 12px', padding: '8px 12px', borderRadius: 8, background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: 'var(--danger)' }}>
          {erroMsg}
        </div>
      )}

      {/* Navegação */}
      {estado === 'respondendo' && (
        <div style={{ padding: '11px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button
            onClick={voltar}
            disabled={idx === 0}
            style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: 'var(--text-muted)', fontSize: 13, opacity: idx === 0 ? 0.35 : 1, padding: '6px 2px' }}
          >
            ← Voltar
          </button>

          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            {pergunta.permite_pular && idx < total - 1 && (
              <button
                onClick={pular}
                style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
              >
                Pular
              </button>
            )}

            {pesquisa.permite_adiar && (
              <button
                onClick={adiar}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Adiar
              </button>
            )}

            {idx === total - 1 ? (
              <button
                onClick={enviar}
                disabled={loading || (pergunta.obrigatoria && !pergunta.permite_pular && !temResposta())}
                style={{
                  padding: '7px 18px', borderRadius: 8, border: 'none',
                  background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  opacity: (loading || (pergunta.obrigatoria && !pergunta.permite_pular && !temResposta())) ? 0.5 : 1,
                }}
              >
                {loading ? 'Enviando…' : 'Enviar ✓'}
              </button>
            ) : (
              <button
                onClick={avancar}
                disabled={!podeAvancar}
                style={{
                  padding: '7px 16px', borderRadius: 8, border: 'none',
                  background: 'var(--info)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  opacity: podeAvancar ? 1 : 0.4,
                }}
              >
                Próximo →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Recusar / Confirmação */}
      <div style={{
        padding: estado === 'confirmando_recusa' ? '12px 16px' : '6px 16px 14px',
        borderTop: estado === 'confirmando_recusa' ? '1px solid var(--border)' : 'none',
        background: estado === 'confirmando_recusa' ? 'var(--danger-subtle)' : 'transparent',
      }}>
        {estado === 'confirmando_recusa' ? (
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
              ⚠️ Você não receberá esta pesquisa novamente. Confirmar?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEstado('respondendo')}
                style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarRecusa}
                style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Confirmar recusa
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => setEstado('confirmando_recusa')}
              style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Não quero participar desta pesquisa
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
