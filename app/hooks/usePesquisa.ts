'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Pesquisa {
  id: string
  titulo: string
  descricao?: string
  permite_adiar: boolean
  perguntas: any[]
}

export function usePesquisa() {
  const [pesquisaAtiva, setPesquisaAtiva] = useState<Pesquisa | null>(null)
  const [mostrarPesquisa, setMostrarPesquisa] = useState(false)

  const verificarPesquisaAtiva = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/pesquisas/ativa', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.deve_exibir && data.pesquisa) {
          setPesquisaAtiva(data.pesquisa)
          setMostrarPesquisa(true)

          // Iniciar a pesquisa
          await fetch(`/api/pesquisas/${data.pesquisa.id}/iniciar`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          })
        }
      }
    } catch (error) {
      console.error('Erro ao verificar pesquisa ativa:', error)
    }
  }

  const fecharPesquisa = () => {
    setMostrarPesquisa(false)
    setPesquisaAtiva(null)
  }

  useEffect(() => {
    // Verificar pesquisa ativa ao carregar
    verificarPesquisaAtiva()

    // Verificar periodicamente (a cada 5 minutos)
    const interval = setInterval(verificarPesquisaAtiva, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  return {
    pesquisaAtiva,
    mostrarPesquisa,
    fecharPesquisa
  }
}