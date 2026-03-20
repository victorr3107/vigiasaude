'use client'

/**
 * Validação SISAB — redireciona para a tela APS unificada na aba de validação.
 * Rota mantida por compatibilidade com links existentes.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ValidacaoSisabRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard/producao-aps?tab=validacao')
  }, [router])
  return (
    <div style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
      Redirecionando para Validação SISAB…
    </div>
  )
}
