'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { MessageSquare, CheckCircle, Clock, AlertTriangle, XCircle } from 'lucide-react'

interface Sugestao {
  id: string
  titulo: string
  categoria: string
  status: string
  resposta_admin?: string
  data_criacao: string
  data_atualizacao: string
}

const statusConfig = {
  NOVA:        { label: 'Recebida',               color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',      icon: Clock },
  EM_ANALISE:  { label: 'Em análise',             color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',   icon: Clock },
  PLANEJADA:   { label: 'Planejada',              color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300', icon: MessageSquare },
  IMPLEMENTADA:{ label: 'Implementada ✓',         color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', icon: CheckCircle },
  DESCARTADA:  { label: 'Não será implementada',  color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',       icon: XCircle },
}

const categoriaLabels: Record<string, string> = {
  NOVO_GRAFICO: '📊 Novo gráfico',
  NOVA_ROTINA:  '⚙️ Nova rotina',
  MELHORIA:     '✨ Melhoria',
  BUG:          '🐛 Bug',
  OUTRO:        '💬 Outro',
}

export default function MinhasSugestoesPage() {
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { carregarSugestoes() }, [])

  const carregarSugestoes = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Não autenticado')

      const response = await fetch('/api/sugestoes/minhas', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      if (!response.ok) throw new Error('Erro ao carregar sugestões')

      setSugestoes(await response.json())
    } catch {
      setError('Erro ao carregar suas sugestões. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Carregando sugestões...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center py-16">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Minhas Sugestões</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          Acompanhe o status das suas sugestões enviadas para a equipe.
        </p>
      </div>

      {sugestoes.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-base font-medium mb-1">Nenhuma sugestão enviada ainda</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Use o botão <strong>Sugerir</strong> no canto inferior esquerdo para enviar sua primeira ideia.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sugestoes.map((sugestao) => {
            const info = statusConfig[sugestao.status as keyof typeof statusConfig]
            const Icon = info?.icon ?? Clock

            return (
              <div
                key={sugestao.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate mb-1">
                      {sugestao.titulo}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span>{categoriaLabels[sugestao.categoria] ?? sugestao.categoria}</span>
                      <span>·</span>
                      <span>{format(new Date(sugestao.data_criacao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                    </div>
                  </div>
                  <span className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${info?.color ?? ''}`}>
                    <Icon size={13} />
                    {info?.label ?? sugestao.status}
                  </span>
                </div>

                {sugestao.resposta_admin && (
                  <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
                    <div className="flex items-start gap-3">
                      <MessageSquare size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Resposta da equipe</p>
                        <p className="text-sm text-blue-900 dark:text-blue-100 whitespace-pre-wrap">{sugestao.resposta_admin}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
