'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Kpis {
  total_respostas: number
  total_completas: number
  total_recusadas: number
  total_adiadas: number
  taxa_conclusao: number
}

interface EvolucaoDia { data: string; count: number }
interface PorMunicipio { ibge: string; nome: string; count: number }

interface ResultadoBase {
  pergunta_id: string
  texto: string
  tipo: string
  total_respostas: number
}
interface ResultadoNPS extends ResultadoBase {
  nps: number | null
  media: number | null
  promotores: number
  neutros: number
  detratores: number
  distribuicao: { valor: number; count: number }[]
}
interface ResultadoEscala extends ResultadoBase {
  media: number | null
  distribuicao: { valor: number; count: number }[]
}
interface ResultadoOpcoes extends ResultadoBase {
  opcoes: { valor: string; rotulo: string; count: number }[]
}
interface ResultadoTexto extends ResultadoBase {
  respostas_texto: string[]
}

type ResultadoPergunta = ResultadoNPS | ResultadoEscala | ResultadoOpcoes | ResultadoTexto

interface Relatorio {
  pesquisa: { id: string; titulo: string; status: string; data_inicio: string; data_fim: string }
  kpis: Kpis
  evolucao_diaria: EvolucaoDia[]
  por_municipio: PorMunicipio[]
  resultados_por_pergunta: ResultadoPergunta[]
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function RelatorioPesquisaPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [relatorio, setRelatorio] = useState<Relatorio | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const carregar = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const res = await fetch(`/api/admin/pesquisas/${id}/relatorio`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!res.ok) { setErro('Relatório não disponível.'); setLoading(false); return }
      setRelatorio(await res.json())
      setLoading(false)
    }
    carregar()
  }, [id, router])

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
      Carregando relatório...
    </div>
  )

  if (erro || !relatorio) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--danger)' }}>{erro || 'Erro inesperado.'}</div>
  )

  const { pesquisa, kpis, evolucao_diaria, por_municipio, resultados_por_pergunta } = relatorio

  return (
    <div style={{ maxWidth: 960, padding: '0 0 48px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <button
          onClick={() => router.push('/dashboard/pesquisas')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: '0 0 12px', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← Voltar às pesquisas
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              {pesquisa.titulo}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {pesquisa.data_inicio ? new Date(pesquisa.data_inicio).toLocaleDateString('pt-BR') : '—'}
              {' → '}
              {pesquisa.data_fim ? new Date(pesquisa.data_fim).toLocaleDateString('pt-BR') : '—'}
            </p>
          </div>
          <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: pesquisa.status === 'ATIVA' ? 'var(--success-subtle)' : pesquisa.status === 'ENCERRADA' ? 'var(--info-subtle)' : 'var(--bg-surface-2)',
            color: pesquisa.status === 'ATIVA' ? 'var(--success)' : pesquisa.status === 'ENCERRADA' ? 'var(--info)' : 'var(--text-muted)',
          }}>
            {pesquisa.status}
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Exibições', value: kpis.total_respostas, cor: 'var(--info)' },
          { label: 'Completas', value: kpis.total_completas, cor: 'var(--success)' },
          { label: 'Recusadas', value: kpis.total_recusadas, cor: 'var(--danger)' },
          { label: 'Adiadas', value: kpis.total_adiadas, cor: 'var(--warning)' },
          { label: 'Taxa conclusão', value: `${kpis.taxa_conclusao}%`, cor: kpis.taxa_conclusao >= 60 ? 'var(--success)' : kpis.taxa_conclusao >= 30 ? 'var(--warning)' : 'var(--danger)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 14px' }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</p>
            <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: k.cor, fontFamily: 'Syne, sans-serif' }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Resultados por pergunta */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, fontFamily: 'Syne, sans-serif' }}>
        Resultados por Pergunta
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
        {resultados_por_pergunta.map((r, i) => (
          <div key={r.pergunta_id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>PERGUNTA {i + 1}</p>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{r.texto}</p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: 'var(--bg-surface-2)', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 12 }}>
                {r.total_respostas} resposta{r.total_respostas !== 1 ? 's' : ''}
              </span>
            </div>

            {r.tipo === 'NPS' && (() => {
              const n = r as ResultadoNPS
              const corNps = n.nps === null ? 'var(--text-muted)' : n.nps >= 50 ? 'var(--success)' : n.nps >= 0 ? 'var(--warning)' : 'var(--danger)'
              const max = Math.max(...n.distribuicao.map(d => d.count), 1)
              return (
                <div>
                  <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>NPS Score</p>
                      <p style={{ margin: 0, fontSize: 36, fontWeight: 800, color: corNps, fontFamily: 'Syne, sans-serif' }}>
                        {n.nps !== null ? n.nps : '—'}
                      </p>
                    </div>
                    {[
                      { label: 'Promotores (9–10)', value: n.promotores, cor: '#10b981' },
                      { label: 'Neutros (7–8)', value: n.neutros, cor: '#f59e0b' },
                      { label: 'Detratores (0–6)', value: n.detratores, cor: '#ef4444' },
                      { label: 'Média', value: n.media !== null ? n.media.toFixed(1) : '—', cor: 'var(--text-secondary)' },
                    ].map(m => (
                      <div key={m.label}>
                        <p style={{ margin: '0 0 2px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{m.label}</p>
                        <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: m.cor, fontFamily: 'Syne, sans-serif' }}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 56 }}>
                    {n.distribuicao.map(d => {
                      const cor = d.valor <= 6 ? '#ef4444' : d.valor <= 8 ? '#f59e0b' : '#10b981'
                      const h = max > 0 ? Math.max(4, (d.count / max) * 48) : 4
                      return (
                        <div key={d.valor} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{d.count > 0 ? d.count : ''}</span>
                          <div style={{ width: '100%', height: h, borderRadius: 3, background: cor, opacity: d.count === 0 ? 0.15 : 0.85 }} />
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{d.valor}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {r.tipo === 'ESCALA' && (() => {
              const e = r as ResultadoEscala
              const max = Math.max(...e.distribuicao.map(d => d.count), 1)
              return (
                <div>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                    Média: <strong style={{ color: 'var(--info)', fontSize: 18 }}>{e.media ?? '—'}</strong>
                  </p>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 60 }}>
                    {e.distribuicao.map(d => {
                      const h = Math.max(4, (d.count / max) * 52)
                      return (
                        <div key={d.valor} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{d.count > 0 ? d.count : ''}</span>
                          <div style={{ width: '100%', height: h, borderRadius: 4, background: 'var(--info)', opacity: d.count === 0 ? 0.15 : 0.75 }} />
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.valor}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {(r.tipo === 'UNICA_ESCOLHA' || r.tipo === 'MULTIPLA_ESCOLHA') && (() => {
              const o = r as ResultadoOpcoes
              const maxCount = Math.max(...o.opcoes.map(op => op.count), 1)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {o.opcoes.map(op => {
                    const pct = r.total_respostas > 0 ? Math.round((op.count / r.total_respostas) * 100) : 0
                    const largura = maxCount > 0 ? (op.count / maxCount) * 100 : 0
                    return (
                      <div key={op.valor}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{op.rotulo}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{op.count} ({pct}%)</span>
                        </div>
                        <div style={{ height: 8, background: 'var(--bg-surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: 8, background: 'var(--accent)', borderRadius: 4, width: `${largura}%`, transition: 'width .4s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {r.tipo === 'TEXTO_LIVRE' && (() => {
              const t = r as ResultadoTexto
              return t.respostas_texto.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Nenhuma resposta de texto recebida.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                  {t.respostas_texto.map((txt, j) => (
                    <div key={j} style={{ padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      "{txt}"
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        ))}
      </div>

      {/* Evolução diária */}
      {evolucao_diaria.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Evolução diária de respostas</h3>
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 80, overflowX: 'auto' }}>
            {(() => {
              const max = Math.max(...evolucao_diaria.map(d => d.count), 1)
              return evolucao_diaria.map(d => {
                const h = Math.max(4, (d.count / max) * 72)
                return (
                  <div key={d.data} style={{ minWidth: 28, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{d.count}</span>
                    <div style={{ width: '80%', height: h, borderRadius: 4, background: 'var(--accent)', opacity: 0.8 }} title={`${d.data}: ${d.count}`} />
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', transform: 'rotate(-45deg)', transformOrigin: 'top left', whiteSpace: 'nowrap' }}>
                      {d.data.substring(5)}
                    </span>
                  </div>
                )
              })
            })()}
          </div>
        </div>
      )}

      {/* Por município */}
      {por_municipio.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Respostas por Município (top {Math.min(por_municipio.length, 10)})
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-2)' }}>
                  {['Município', 'IBGE', 'Respostas', 'Participação'].map(h => (
                    <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {por_municipio.slice(0, 10).map((m, i) => {
                  const pct = kpis.total_completas > 0 ? Math.round((m.count / kpis.total_completas) * 100) : 0
                  return (
                    <tr key={m.ibge} style={{ borderTop: '1px solid var(--border-subtle)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-surface)' }}>
                      <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{m.nome}</td>
                      <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-muted)' }}>{m.ibge}</td>
                      <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>{m.count}</td>
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 80, height: 6, background: 'var(--bg-surface-2)', borderRadius: 3 }}>
                            <div style={{ width: `${pct}%`, height: 6, background: 'var(--accent)', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {kpis.total_completas === 0 && (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-dim)' }}>
          <p style={{ margin: 0 }}>Nenhuma resposta completa registrada ainda.</p>
        </div>
      )}
    </div>
  )
}
