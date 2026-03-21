'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface PesquisaConfig {
  titulo: string
  descricao: string
  data_inicio: string
  data_fim: string
  publico_alvo: 'TODOS' | 'PERFIL_ESPECIFICO' | 'MUNICIPIOS_ESPECIFICOS'
  permite_adiar: boolean
  dias_cooldown_adiar: number
  exibir_apos_dias: number
}

export interface OpcaoItem { valor: string; rotulo: string; icone: string }

export interface Pergunta {
  id: string
  ordem: number
  texto: string
  tipo: 'NPS' | 'ESCALA' | 'MULTIPLA_ESCOLHA' | 'UNICA_ESCOLHA' | 'TEXTO_LIVRE'
  obrigatoria: boolean
  permite_pular: boolean
  opcoes: OpcaoItem[] | null
  config: { min?: number; max?: number; label_min?: string; label_max?: string } | null
}

interface PerguntaForm {
  texto: string
  tipo: Pergunta['tipo']
  obrigatoria: boolean
  permite_pular: boolean
  opcoes: OpcaoItem[]
  config: { min: number; max: number; label_min: string; label_max: string }
}

export interface BuilderProps {
  pesquisaId?: string
  dadosIniciais?: { config: PesquisaConfig; perguntas: Pergunta[]; status: string }
}

// ── Constantes ────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<Pergunta['tipo'], string> = {
  NPS: 'NPS (0–10)',
  ESCALA: 'Escala',
  MULTIPLA_ESCOLHA: 'Múltipla Escolha',
  UNICA_ESCOLHA: 'Única Escolha',
  TEXTO_LIVRE: 'Texto Livre',
}

const TIPO_CORES: Record<Pergunta['tipo'], string> = {
  NPS: '#8B5CF6',
  ESCALA: '#3B82F6',
  MULTIPLA_ESCOLHA: '#10B981',
  UNICA_ESCOLHA: '#F59E0B',
  TEXTO_LIVRE: '#94A3B8',
}

function defaultConfig(): PesquisaConfig {
  const amanha = new Date(Date.now() + 86_400_000)
  const emTrintaDias = new Date(Date.now() + 30 * 86_400_000)
  return {
    titulo: '',
    descricao: '',
    data_inicio: toDatetimeLocal(amanha.toISOString()),
    data_fim: toDatetimeLocal(emTrintaDias.toISOString()),
    publico_alvo: 'TODOS',
    permite_adiar: true,
    dias_cooldown_adiar: 14,
    exibir_apos_dias: 7,
  }
}

function defaultPerguntaForm(): PerguntaForm {
  return {
    texto: '',
    tipo: 'NPS',
    obrigatoria: true,
    permite_pular: false,
    opcoes: [
      { valor: 'op1', rotulo: '', icone: '' },
      { valor: 'op2', rotulo: '', icone: '' },
    ],
    config: { min: 1, max: 5, label_min: '', label_max: '' },
  }
}

function toDatetimeLocal(iso: string) {
  if (!iso) return ''
  return iso.substring(0, 16)
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30) || `op_${Date.now()}`
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function BuilderPesquisa({ pesquisaId: idInicial, dadosIniciais }: BuilderProps) {
  const router = useRouter()

  const [pesquisaId, setPesquisaId] = useState<string | undefined>(idInicial)
  const [config, setConfig] = useState<PesquisaConfig>(
    dadosIniciais?.config ?? defaultConfig()
  )
  const [perguntas, setPerguntas] = useState<Pergunta[]>(dadosIniciais?.perguntas ?? [])
  const [status, setStatus] = useState(dadosIniciais?.status ?? 'RASCUNHO')

  // Modal pergunta
  const [modalPergunta, setModalPergunta] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<PerguntaForm>(defaultPerguntaForm())

  // Modal confirmar ativar
  const [modalAtivar, setModalAtivar] = useState(false)

  // Preview
  const [previewAberto, setPreviewAberto] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(0)

  // Drag and drop
  const dragIndex = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const [salvando, setSalvando] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null)

  const isRascunho = status === 'RASCUNHO'

  // ── Toast ────────────────────────────────────────────────────────────────

  const showToast = (msg: string, tipo: 'ok' | 'erro' = 'ok') => {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Auth helper ──────────────────────────────────────────────────────────

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  // ── Salvar rascunho ──────────────────────────────────────────────────────

  const salvarRascunho = async () => {
    if (!config.titulo.trim()) { showToast('Título é obrigatório.', 'erro'); return }
    setSalvando(true)
    try {
      const token = await getToken()
      if (!token) { showToast('Sessão expirada.', 'erro'); return }

      const payload = {
        titulo: config.titulo,
        descricao: config.descricao || null,
        data_inicio: config.data_inicio ? new Date(config.data_inicio).toISOString() : undefined,
        data_fim: config.data_fim ? new Date(config.data_fim).toISOString() : undefined,
        publico_alvo: config.publico_alvo,
        permite_adiar: config.permite_adiar,
        dias_cooldown_adiar: config.dias_cooldown_adiar,
        exibir_apos_dias: config.exibir_apos_dias,
      }

      if (!pesquisaId) {
        // Criar nova pesquisa
        const res = await fetch('/api/admin/pesquisas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json()
          showToast(err.error ?? 'Erro ao criar pesquisa.', 'erro')
          return
        }
        const nova = await res.json()
        setPesquisaId(nova.id)

        // Salvar perguntas locais na ordem
        for (let i = 0; i < perguntas.length; i++) {
          const p = perguntas[i]
          await fetch(`/api/admin/pesquisas/${nova.id}/perguntas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              texto: p.texto,
              tipo: p.tipo,
              obrigatoria: p.obrigatoria,
              permite_pular: p.permite_pular,
              opcoes: p.opcoes,
              config: p.config,
            }),
          })
        }

        showToast('Rascunho salvo!')
        router.replace(`/dashboard/pesquisas/${nova.id}/editar`)
      } else {
        // Atualizar pesquisa existente
        const res = await fetch(`/api/admin/pesquisas/${pesquisaId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json()
          showToast(err.error ?? 'Erro ao salvar.', 'erro')
          return
        }
        showToast('Rascunho salvo!')
      }
    } finally {
      setSalvando(false)
    }
  }

  // ── Ativar pesquisa ──────────────────────────────────────────────────────

  const ativar = async () => {
    setModalAtivar(false)
    setSalvando(true)
    try {
      const token = await getToken()
      if (!token) return

      // Garantir que o rascunho está salvo primeiro
      if (!pesquisaId) { showToast('Salve o rascunho antes de ativar.', 'erro'); return }

      const res = await fetch(`/api/admin/pesquisas/${pesquisaId}/ativar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const err = await res.json()
        showToast(err.error ?? 'Erro ao ativar.', 'erro')
        return
      }

      setStatus('ATIVA')
      showToast('Pesquisa ativada com sucesso!')
    } finally {
      setSalvando(false)
    }
  }

  // ── Pergunta modal: confirmar ─────────────────────────────────────────────

  const confirmarPergunta = async () => {
    if (!form.texto.trim()) { showToast('Texto da pergunta é obrigatório.', 'erro'); return }
    if ((form.tipo === 'MULTIPLA_ESCOLHA' || form.tipo === 'UNICA_ESCOLHA') &&
        form.opcoes.some(o => !o.rotulo.trim())) {
      showToast('Preencha o rótulo de todas as opções.', 'erro'); return
    }

    const opcoes = (form.tipo === 'MULTIPLA_ESCOLHA' || form.tipo === 'UNICA_ESCOLHA')
      ? form.opcoes.map(o => ({ ...o, valor: slugify(o.rotulo) }))
      : null

    const config_p = (form.tipo === 'NPS')
      ? { label_min: form.config.label_min, label_max: form.config.label_max }
      : (form.tipo === 'ESCALA')
        ? { min: form.config.min, max: form.config.max, label_min: form.config.label_min, label_max: form.config.label_max }
        : null

    const token = await getToken()
    if (!token) return

    if (editandoId) {
      // Editar pergunta existente na API
      if (pesquisaId) {
        const res = await fetch(`/api/admin/pesquisas/${pesquisaId}/perguntas/${editandoId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ texto: form.texto, tipo: form.tipo, obrigatoria: form.obrigatoria, permite_pular: form.permite_pular, opcoes, config: config_p }),
        })
        if (!res.ok) { showToast('Erro ao editar pergunta.', 'erro'); return }
        const atualizada = await res.json()
        setPerguntas(prev => prev.map(p => p.id === editandoId ? atualizada : p))
      } else {
        // Modo local (pesquisa ainda não salva)
        setPerguntas(prev => prev.map(p => p.id === editandoId
          ? { ...p, texto: form.texto, tipo: form.tipo, obrigatoria: form.obrigatoria, permite_pular: form.permite_pular, opcoes, config: config_p }
          : p))
      }
    } else {
      // Adicionar pergunta
      if (pesquisaId) {
        const res = await fetch(`/api/admin/pesquisas/${pesquisaId}/perguntas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ texto: form.texto, tipo: form.tipo, obrigatoria: form.obrigatoria, permite_pular: form.permite_pular, opcoes, config: config_p }),
        })
        if (!res.ok) { showToast('Erro ao adicionar pergunta.', 'erro'); return }
        const nova = await res.json()
        setPerguntas(prev => [...prev, nova])
      } else {
        // Modo local (pesquisa ainda não salva)
        const localId = `local_${Date.now()}`
        setPerguntas(prev => [...prev, {
          id: localId, ordem: prev.length,
          texto: form.texto, tipo: form.tipo,
          obrigatoria: form.obrigatoria, permite_pular: form.permite_pular,
          opcoes, config: config_p,
        }])
      }
    }

    setModalPergunta(false)
    setEditandoId(null)
    setForm(defaultPerguntaForm())
  }

  // ── Remover pergunta ─────────────────────────────────────────────────────

  const removerPergunta = async (id: string) => {
    if (!confirm('Remover esta pergunta?')) return
    if (pesquisaId && !id.startsWith('local_')) {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`/api/admin/pesquisas/${pesquisaId}/perguntas/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { showToast('Erro ao remover pergunta.', 'erro'); return }
    }
    setPerguntas(prev => prev.filter(p => p.id !== id).map((p, i) => ({ ...p, ordem: i })))
  }

  // ── Drag and drop ────────────────────────────────────────────────────────

  const onDragStart = (index: number) => { dragIndex.current = index }

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOver(index)
  }

  const onDrop = async (index: number) => {
    const from = dragIndex.current
    dragIndex.current = null
    setDragOver(null)
    if (from === null || from === index) return

    const nova = [...perguntas]
    const [removed] = nova.splice(from, 1)
    nova.splice(index, 0, removed)
    const reordenada = nova.map((p, i) => ({ ...p, ordem: i }))
    setPerguntas(reordenada)

    if (pesquisaId) {
      const token = await getToken()
      if (!token) return
      await fetch(`/api/admin/pesquisas/${pesquisaId}/reordenar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ordem: reordenada.map(p => p.id) }),
      })
    }
  }

  // ── Abrir modal editar pergunta ──────────────────────────────────────────

  const abrirEditar = (p: Pergunta) => {
    setEditandoId(p.id)
    setForm({
      texto: p.texto,
      tipo: p.tipo,
      obrigatoria: p.obrigatoria,
      permite_pular: p.permite_pular,
      opcoes: p.opcoes ?? [{ valor: 'op1', rotulo: '', icone: '' }, { valor: 'op2', rotulo: '', icone: '' }],
      config: {
        min: p.config?.min ?? 1,
        max: p.config?.max ?? 5,
        label_min: p.config?.label_min ?? '',
        label_max: p.config?.label_max ?? '',
      },
    })
    setModalPergunta(true)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const S = styles

  return (
    <div style={S.page}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/dashboard/pesquisas')} style={S.btnVoltar}>
            ← Voltar
          </button>
          <span style={S.breadcrumb}>
            Pesquisas <span style={{ color: 'var(--text-muted)' }}>/</span>{' '}
            {pesquisaId ? 'Editar' : 'Nova Pesquisa'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...S.badge, background: status === 'ATIVA' ? 'var(--success-subtle)' : 'var(--bg-surface-2)', color: status === 'ATIVA' ? 'var(--success)' : 'var(--text-muted)' }}>
            {status === 'RASCUNHO' ? 'Rascunho' : status === 'ATIVA' ? 'Ativa' : status === 'ENCERRADA' ? 'Encerrada' : status}
          </span>
        </div>
      </div>

      {/* ── Corpo: 2 colunas ────────────────────────────────────────────── */}
      <div style={S.body}>
        {/* Coluna esquerda — Configurações Gerais */}
        <div style={S.colLeft}>
          <h2 style={S.colTitle}>Configurações Gerais</h2>

          <div style={S.field}>
            <label style={S.label}>Título *</label>
            <input
              style={S.input}
              value={config.titulo}
              onChange={e => setConfig(c => ({ ...c, titulo: e.target.value }))}
              maxLength={120}
              placeholder="Ex: Pesquisa de Satisfação Q1 2026"
              disabled={!isRascunho}
            />
            <span style={S.counter}>{config.titulo.length}/120</span>
          </div>

          <div style={S.field}>
            <label style={S.label}>Descrição (opcional)</label>
            <textarea
              style={{ ...S.input, resize: 'none', height: 72 }}
              value={config.descricao}
              onChange={e => setConfig(c => ({ ...c, descricao: e.target.value }))}
              placeholder="Texto exibido para o usuário ao iniciar a pesquisa"
              disabled={!isRascunho}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={S.field}>
              <label style={S.label}>Data início</label>
              <input
                type="datetime-local"
                style={S.input}
                value={config.data_inicio}
                onChange={e => setConfig(c => ({ ...c, data_inicio: e.target.value }))}
                disabled={!isRascunho}
              />
            </div>
            <div style={S.field}>
              <label style={S.label}>Data fim</label>
              <input
                type="datetime-local"
                style={S.input}
                value={config.data_fim}
                onChange={e => setConfig(c => ({ ...c, data_fim: e.target.value }))}
                disabled={!isRascunho}
              />
            </div>
          </div>

          <div style={S.field}>
            <label style={S.label}>Público alvo</label>
            <select
              style={S.input}
              value={config.publico_alvo}
              onChange={e => setConfig(c => ({ ...c, publico_alvo: e.target.value as PesquisaConfig['publico_alvo'] }))}
              disabled={!isRascunho}
            >
              <option value="TODOS">Todos os usuários</option>
              <option value="PERFIL_ESPECIFICO">Perfil específico</option>
              <option value="MUNICIPIOS_ESPECIFICOS">Municípios específicos</option>
            </select>
          </div>

          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={S.label}>Permitir adiamento</span>
              <button
                onClick={() => isRascunho && setConfig(c => ({ ...c, permite_adiar: !c.permite_adiar }))}
                style={{
                  ...S.toggle,
                  background: config.permite_adiar ? 'var(--accent)' : 'var(--bg-surface-2)',
                }}
              >
                <span style={{
                  ...S.toggleKnob,
                  transform: config.permite_adiar ? 'translateX(20px)' : 'translateX(2px)',
                }} />
              </button>
            </div>
            {config.permite_adiar && (
              <div style={S.field}>
                <label style={S.label}>Cooldown após adiar (dias)</label>
                <input
                  type="number" min={1} max={90}
                  style={{ ...S.input, width: 80 }}
                  value={config.dias_cooldown_adiar}
                  onChange={e => setConfig(c => ({ ...c, dias_cooldown_adiar: parseInt(e.target.value) || 14 }))}
                  disabled={!isRascunho}
                />
              </div>
            )}
          </div>

          <div style={S.field}>
            <label style={S.label}>Exibir após quantos dias de uso</label>
            <input
              type="number" min={0} max={365}
              style={{ ...S.input, width: 80 }}
              value={config.exibir_apos_dias}
              onChange={e => setConfig(c => ({ ...c, exibir_apos_dias: parseInt(e.target.value) || 7 }))}
              disabled={!isRascunho}
            />
            <p style={S.hint}>Usuário precisa ter este mínimo de dias de uso do sistema antes de ver a pesquisa.</p>
          </div>
        </div>

        {/* Coluna direita — Construtor de Perguntas */}
        <div style={S.colRight}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={S.colTitle}>Perguntas{perguntas.length > 0 && <span style={S.countBadge}>{perguntas.length}</span>}</h2>
            {isRascunho && (
              <button onClick={() => { setEditandoId(null); setForm(defaultPerguntaForm()); setModalPergunta(true) }} style={S.btnAdd}>
                + Adicionar pergunta
              </button>
            )}
          </div>

          {perguntas.length === 0 ? (
            <div style={S.emptyPerguntas}>
              <svg width="40" height="40" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              <p style={{ margin: '12px 0 4px', color: 'var(--text-secondary)', fontWeight: 500 }}>Nenhuma pergunta adicionada</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Clique em "Adicionar pergunta" para começar</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {perguntas.map((p, i) => (
                <div
                  key={p.id}
                  draggable={isRascunho}
                  onDragStart={() => onDragStart(i)}
                  onDragOver={e => onDragOver(e, i)}
                  onDrop={() => onDrop(i)}
                  onDragEnd={() => { dragIndex.current = null; setDragOver(null) }}
                  style={{
                    ...S.perguntaCard,
                    borderColor: dragOver === i ? 'var(--accent)' : 'var(--border)',
                    opacity: dragIndex.current === i ? 0.4 : 1,
                  }}
                >
                  {isRascunho && (
                    <div style={S.grip} title="Arrastar para reordenar">
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <circle cx="9" cy="6" r="1.5" fill="currentColor"/><circle cx="15" cy="6" r="1.5" fill="currentColor"/>
                        <circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/>
                        <circle cx="9" cy="18" r="1.5" fill="currentColor"/><circle cx="15" cy="18" r="1.5" fill="currentColor"/>
                      </svg>
                    </div>
                  )}
                  <span style={S.numOrdem}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={S.perguntaTexto}>{p.texto || <em style={{ color: 'var(--text-dim)' }}>Sem texto</em>}</p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ ...S.tipoBadge, borderColor: TIPO_CORES[p.tipo], color: TIPO_CORES[p.tipo] }}>
                        {TIPO_LABELS[p.tipo]}
                      </span>
                      {p.obrigatoria && <span style={S.tagObrig}>Obrigatória</span>}
                      {p.permite_pular && <span style={S.tagPular}>Pode pular</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {isRascunho && (
                      <>
                        <button onClick={() => abrirEditar(p)} style={S.iconBtn} title="Editar">
                          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => removerPergunta(p.id)} style={{ ...S.iconBtn, color: 'var(--danger)' }} title="Remover">
                          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div style={S.footer}>
        <div style={{ display: 'flex', gap: 8 }}>
          {isRascunho && (
            <button onClick={salvarRascunho} disabled={salvando} style={S.btnSecondary}>
              {salvando ? 'Salvando…' : 'Salvar rascunho'}
            </button>
          )}
          {perguntas.length > 0 && (
            <button onClick={() => { setPreviewIdx(0); setPreviewAberto(true) }} style={S.btnGhost}>
              Pré-visualizar
            </button>
          )}
        </div>
        {isRascunho && (
          <button
            onClick={() => setModalAtivar(true)}
            disabled={salvando || !pesquisaId}
            style={S.btnAtivar}
            title={!pesquisaId ? 'Salve o rascunho primeiro' : ''}
          >
            Ativar pesquisa →
          </button>
        )}
        {!isRascunho && (
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Esta pesquisa está {status === 'ATIVA' ? 'ativa' : 'encerrada'} e não pode ser editada.
          </span>
        )}
      </div>

      {/* ── Modal: Configurar pergunta ──────────────────────────────────── */}
      {modalPergunta && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setModalPergunta(false)}>
          <div style={S.modalGrande}>
            <div style={S.modalHeader}>
              <h3 style={S.modalTitulo}>{editandoId ? 'Editar pergunta' : 'Nova pergunta'}</h3>
              <button onClick={() => setModalPergunta(false)} style={S.btnClose}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, overflowY: 'auto', maxHeight: 'calc(80vh - 120px)', padding: '0 24px 24px' }}>
              {/* Formulário */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                <div style={S.field}>
                  <label style={S.label}>Texto da pergunta *</label>
                  <textarea
                    style={{ ...S.input, resize: 'none', height: 80 }}
                    value={form.texto}
                    maxLength={300}
                    onChange={e => setForm(f => ({ ...f, texto: e.target.value }))}
                    placeholder="Ex: De 0 a 10, quanto você recomendaria o sistema?"
                    autoFocus
                  />
                  <span style={S.counter}>{form.texto.length}/300</span>
                </div>

                <div style={S.field}>
                  <label style={S.label}>Tipo de resposta</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {(Object.keys(TIPO_LABELS) as Pergunta['tipo'][]).map(t => (
                      <button
                        key={t}
                        onClick={() => setForm(f => ({ ...f, tipo: t }))}
                        style={{
                          padding: '8px 10px', borderRadius: 8, border: `2px solid ${form.tipo === t ? TIPO_CORES[t] : 'var(--border)'}`,
                          background: form.tipo === t ? `${TIPO_CORES[t]}18` : 'var(--bg-surface)',
                          color: form.tipo === t ? TIPO_CORES[t] : 'var(--text-secondary)',
                          cursor: 'pointer', fontSize: 12, fontWeight: 500, textAlign: 'left',
                        }}
                      >
                        {TIPO_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={form.obrigatoria} onChange={e => setForm(f => ({ ...f, obrigatoria: e.target.checked }))} />
                    Obrigatória
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={form.permite_pular} onChange={e => setForm(f => ({ ...f, permite_pular: e.target.checked }))} />
                    Pode pular
                  </label>
                </div>

                {/* Config por tipo */}
                {form.tipo === 'NPS' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ ...S.label, marginBottom: 4 }}>Rótulos (opcional)</p>
                    <div style={S.field}>
                      <label style={{ ...S.label, fontSize: 11 }}>Label do 0 (Mínimo)</label>
                      <input style={S.input} placeholder="Ex: Muito improvável" value={form.config.label_min} onChange={e => setForm(f => ({ ...f, config: { ...f.config, label_min: e.target.value } }))} />
                    </div>
                    <div style={S.field}>
                      <label style={{ ...S.label, fontSize: 11 }}>Label do 10 (Máximo)</label>
                      <input style={S.input} placeholder="Ex: Muito provável" value={form.config.label_max} onChange={e => setForm(f => ({ ...f, config: { ...f.config, label_max: e.target.value } }))} />
                    </div>
                  </div>
                )}

                {form.tipo === 'ESCALA' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ ...S.label, marginBottom: 4 }}>Configuração da escala</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={S.field}>
                        <label style={{ ...S.label, fontSize: 11 }}>Mínimo</label>
                        <input type="number" style={{ ...S.input }} value={form.config.min} onChange={e => setForm(f => ({ ...f, config: { ...f.config, min: parseInt(e.target.value) || 1 } }))} />
                      </div>
                      <div style={S.field}>
                        <label style={{ ...S.label, fontSize: 11 }}>Máximo</label>
                        <input type="number" style={{ ...S.input }} value={form.config.max} onChange={e => setForm(f => ({ ...f, config: { ...f.config, max: parseInt(e.target.value) || 5 } }))} />
                      </div>
                    </div>
                    <div style={S.field}>
                      <label style={{ ...S.label, fontSize: 11 }}>Label do mínimo</label>
                      <input style={S.input} placeholder="Ex: Muito ruim" value={form.config.label_min} onChange={e => setForm(f => ({ ...f, config: { ...f.config, label_min: e.target.value } }))} />
                    </div>
                    <div style={S.field}>
                      <label style={{ ...S.label, fontSize: 11 }}>Label do máximo</label>
                      <input style={S.input} placeholder="Ex: Muito bom" value={form.config.label_max} onChange={e => setForm(f => ({ ...f, config: { ...f.config, label_max: e.target.value } }))} />
                    </div>
                  </div>
                )}

                {(form.tipo === 'MULTIPLA_ESCOLHA' || form.tipo === 'UNICA_ESCOLHA') && (
                  <div>
                    <p style={{ ...S.label, marginBottom: 8 }}>Opções</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {form.opcoes.map((op, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            style={{ ...S.input, width: 36, textAlign: 'center', padding: '6px 4px' }}
                            placeholder="🔹"
                            value={op.icone}
                            onChange={e => setForm(f => {
                              const ops = [...f.opcoes]
                              ops[idx] = { ...ops[idx], icone: e.target.value }
                              return { ...f, opcoes: ops }
                            })}
                          />
                          <input
                            style={{ ...S.input, flex: 1 }}
                            placeholder={`Opção ${idx + 1}`}
                            value={op.rotulo}
                            onChange={e => setForm(f => {
                              const ops = [...f.opcoes]
                              ops[idx] = { ...ops[idx], rotulo: e.target.value }
                              return { ...f, opcoes: ops }
                            })}
                          />
                          {form.opcoes.length > 2 && (
                            <button
                              onClick={() => setForm(f => ({ ...f, opcoes: f.opcoes.filter((_, i) => i !== idx) }))}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4 }}
                            >✕</button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => setForm(f => ({ ...f, opcoes: [...f.opcoes, { valor: `op${f.opcoes.length + 1}`, rotulo: '', icone: '' }] }))}
                        style={{ ...S.btnGhost, alignSelf: 'flex-start', fontSize: 12, padding: '4px 10px' }}
                      >
                        + Adicionar opção
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Preview */}
              <div>
                <p style={{ ...S.label, marginBottom: 12 }}>Preview</p>
                <PreviewPergunta form={form} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setModalPergunta(false)} style={S.btnSecondary}>Cancelar</button>
              <button onClick={confirmarPergunta} style={S.btnPrimary}>
                {editandoId ? 'Salvar alterações' : 'Adicionar pergunta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar ativar ─────────────────────────────────────── */}
      {modalAtivar && (
        <div style={S.overlay}>
          <div style={{ ...S.modalGrande, maxWidth: 480 }}>
            <div style={S.modalHeader}>
              <h3 style={S.modalTitulo}>Ativar pesquisa</h3>
              <button onClick={() => setModalAtivar(false)} style={S.btnClose}>✕</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 16, background: 'var(--warning-subtle)', borderRadius: 10, border: '1px solid rgba(245,158,11,0.25)' }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>Atenção: ação irreversível</p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                    Após ativar, não será possível editar as perguntas. A pesquisa ficará disponível para os usuários elegíveis.
                  </p>
                </div>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                <strong style={{ color: 'var(--text-primary)' }}>{perguntas.length} pergunta{perguntas.length !== 1 ? 's' : ''}</strong> serão exibidas.
                Período: <strong style={{ color: 'var(--text-primary)' }}>{config.data_inicio ? config.data_inicio.substring(0, 10) : '—'}</strong> até <strong style={{ color: 'var(--text-primary)' }}>{config.data_fim ? config.data_fim.substring(0, 10) : '—'}</strong>.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setModalAtivar(false)} style={S.btnSecondary}>Cancelar</button>
              <button onClick={ativar} style={S.btnAtivar}>Confirmar e ativar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Pré-visualizar ───────────────────────────────────────── */}
      {previewAberto && perguntas.length > 0 && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setPreviewAberto(false)}>
          <div style={{ position: 'fixed', bottom: 20, right: 20, width: 400, background: 'var(--bg-modal)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-modal)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{config.titulo || 'Pesquisa'}</p>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                  Pergunta {previewIdx + 1} de {perguntas.length}
                </p>
              </div>
              <button onClick={() => setPreviewAberto(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>✕</button>
            </div>
            {/* Barra de progresso */}
            <div style={{ height: 3, background: 'var(--border)' }}>
              <div style={{ height: 3, background: 'var(--accent)', width: `${((previewIdx + 1) / perguntas.length) * 100}%`, transition: 'width .3s' }} />
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>
                {perguntas[previewIdx].texto}
              </p>
              <PreviewPergunta form={{
                texto: perguntas[previewIdx].texto,
                tipo: perguntas[previewIdx].tipo,
                obrigatoria: perguntas[previewIdx].obrigatoria,
                permite_pular: perguntas[previewIdx].permite_pular,
                opcoes: perguntas[previewIdx].opcoes ?? [],
                config: {
                  min: perguntas[previewIdx].config?.min ?? 1,
                  max: perguntas[previewIdx].config?.max ?? 5,
                  label_min: perguntas[previewIdx].config?.label_min ?? '',
                  label_max: perguntas[previewIdx].config?.label_max ?? '',
                },
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => setPreviewIdx(i => Math.max(0, i - 1))}
                disabled={previewIdx === 0}
                style={{ ...S.btnGhost, opacity: previewIdx === 0 ? 0.4 : 1 }}
              >← Voltar</button>
              {previewIdx < perguntas.length - 1
                ? <button onClick={() => setPreviewIdx(i => i + 1)} style={S.btnPrimary}>Próximo →</button>
                : <button onClick={() => setPreviewAberto(false)} style={S.btnPrimary}>Fechar preview</button>
              }
            </div>
            <div style={{ padding: '8px 16px 14px', textAlign: 'center' }}>
              <button style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-dim)', cursor: 'default' }}>
                Não quero participar desta pesquisa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.tipo === 'ok' ? 'var(--success)' : 'var(--danger)',
          color: '#fff', padding: '10px 20px', borderRadius: 10,
          fontSize: 14, fontWeight: 500, zIndex: 9999, boxShadow: 'var(--shadow-md)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Preview de pergunta ───────────────────────────────────────────────────────

function PreviewPergunta({ form }: { form: PerguntaForm }) {
  const [val, setVal] = useState<number | null>(null)
  const [opcoes, setOpcoes] = useState<string[]>([])
  const [texto, setTexto] = useState('')

  if (form.tipo === 'NPS') return (
    <div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        {Array.from({ length: 11 }, (_, i) => {
          const cor = i <= 6 ? '#ef4444' : i <= 8 ? '#f59e0b' : '#10b981'
          return (
            <button key={i} onClick={() => setVal(i)} style={{
              width: 36, height: 36, borderRadius: 8, border: `2px solid ${val === i ? cor : 'var(--border)'}`,
              background: val === i ? `${cor}22` : 'var(--bg-surface)', color: val === i ? cor : 'var(--text-secondary)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>{i}</button>
          )
        })}
      </div>
      {(form.config.label_min || form.config.label_max) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          <span>{form.config.label_min || 'Muito improvável'}</span>
          <span>{form.config.label_max || 'Muito provável'}</span>
        </div>
      )}
    </div>
  )

  if (form.tipo === 'ESCALA') {
    const min = form.config.min || 1
    const max = form.config.max || 5
    return (
      <div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          {Array.from({ length: max - min + 1 }, (_, i) => {
            const v = min + i
            return (
              <button key={v} onClick={() => setVal(v)} style={{
                width: 44, height: 44, borderRadius: 8,
                border: `2px solid ${val === v ? 'var(--info)' : 'var(--border)'}`,
                background: val === v ? 'var(--info-subtle)' : 'var(--bg-surface)',
                color: val === v ? 'var(--info)' : 'var(--text-secondary)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>{v}</button>
            )
          })}
        </div>
        {(form.config.label_min || form.config.label_max) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            <span>{form.config.label_min}</span><span>{form.config.label_max}</span>
          </div>
        )}
      </div>
    )
  }

  if (form.tipo === 'UNICA_ESCOLHA') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {form.opcoes.filter(o => o.rotulo).map(op => (
        <button key={op.valor} onClick={() => setOpcoes([op.valor])} style={{
          padding: '10px 14px', textAlign: 'left', borderRadius: 8, cursor: 'pointer',
          border: `1.5px solid ${opcoes.includes(op.valor) ? 'var(--accent)' : 'var(--border)'}`,
          background: opcoes.includes(op.valor) ? 'var(--accent-subtle)' : 'var(--bg-surface)',
          color: 'var(--text-primary)', fontSize: 13,
        }}>
          {op.icone && <span style={{ marginRight: 8 }}>{op.icone}</span>}{op.rotulo}
        </button>
      ))}
      {form.opcoes.every(o => !o.rotulo) && <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>Adicione opções ao formulário</p>}
    </div>
  )

  if (form.tipo === 'MULTIPLA_ESCOLHA') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {form.opcoes.filter(o => o.rotulo).map(op => {
        const sel = opcoes.includes(op.valor)
        return (
          <label key={op.valor} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
            border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
            background: sel ? 'var(--accent-subtle)' : 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 13,
          }}>
            <input type="checkbox" checked={sel} onChange={e => setOpcoes(prev => e.target.checked ? [...prev, op.valor] : prev.filter(v => v !== op.valor))} style={{ accentColor: 'var(--accent)' }} />
            {op.icone && <span>{op.icone}</span>}{op.rotulo}
          </label>
        )
      })}
      {form.opcoes.every(o => !o.rotulo) && <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>Adicione opções ao formulário</p>}
    </div>
  )

  if (form.tipo === 'TEXTO_LIVRE') return (
    <textarea
      value={texto}
      onChange={e => setTexto(e.target.value)}
      placeholder="Digite sua resposta..."
      rows={3}
      maxLength={500}
      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, resize: 'none', boxSizing: 'border-box', outline: 'none' }}
    />
  )

  return null
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', minHeight: '100vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' },
  btnVoltar: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: '4px 0' },
  breadcrumb: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  badge: { padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 },
  body: { display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 0, flex: 1, overflow: 'auto' },
  colLeft: { padding: 24, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' },
  colRight: { padding: 24, overflowY: 'auto' },
  colTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  input: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' } as React.CSSProperties,
  counter: { fontSize: 11, color: 'var(--text-dim)', alignSelf: 'flex-end' },
  hint: { fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' },
  card: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 },
  toggle: { width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s' } as React.CSSProperties,
  toggleKnob: { position: 'absolute', top: 2, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'transform .2s', display: 'block' } as React.CSSProperties,
  emptyPerguntas: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, border: '2px dashed var(--border)', borderRadius: 12, textAlign: 'center' },
  perguntaCard: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 10, cursor: 'grab', transition: 'border-color .15s' },
  grip: { color: 'var(--text-dim)', cursor: 'grab', flexShrink: 0 },
  numOrdem: { width: 22, height: 22, borderRadius: 6, background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 } as React.CSSProperties,
  perguntaTexto: { margin: 0, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties,
  tipoBadge: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, border: '1px solid', background: 'transparent' },
  tagObrig: { fontSize: 11, padding: '2px 7px', borderRadius: 6, background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' },
  tagPular: { fontSize: 11, padding: '2px 7px', borderRadius: 6, background: 'var(--info-subtle)', color: 'var(--info)', border: '1px solid rgba(59,130,246,0.2)' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 5, borderRadius: 6, display: 'flex', alignItems: 'center' },
  countBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 10, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700, marginLeft: 8 } as React.CSSProperties,
  btnAdd: { padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' },
  btnSecondary: { padding: '8px 18px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnGhost: { padding: '8px 16px', borderRadius: 8, border: 'none', background: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnPrimary: { padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--info)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnAtivar: { padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  modalGrande: { background: 'var(--bg-modal)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-modal)', width: '90vw', maxWidth: 860, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid var(--border)' },
  modalTitulo: { margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' },
  btnClose: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4 },
}
