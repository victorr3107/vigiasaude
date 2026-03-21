'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BuilderPesquisa, { type BuilderProps } from '../../_components/BuilderPesquisa'

export default function EditarPesquisaPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [dados, setDados] = useState<BuilderProps['dadosIniciais'] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const carregar = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const res = await fetch(`/api/admin/pesquisas/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!res.ok) { setErro('Pesquisa não encontrada.'); return }

      const json = await res.json()

      setDados({
        config: {
          titulo: json.titulo ?? '',
          descricao: json.descricao ?? '',
          data_inicio: json.data_inicio ? json.data_inicio.substring(0, 16) : '',
          data_fim: json.data_fim ? json.data_fim.substring(0, 16) : '',
          publico_alvo: json.publico_alvo ?? 'TODOS',
          permite_adiar: json.permite_adiar ?? true,
          dias_cooldown_adiar: json.dias_cooldown_adiar ?? 14,
          exibir_apos_dias: json.exibir_apos_dias ?? 7,
        },
        perguntas: json.perguntas ?? [],
        status: json.status ?? 'RASCUNHO',
      })
    }
    carregar()
  }, [id, router])

  if (erro) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--danger)' }}>
        {erro}
      </div>
    )
  }

  if (!dados) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
        Carregando...
      </div>
    )
  }

  return <BuilderPesquisa pesquisaId={id} dadosIniciais={dados} />
}
