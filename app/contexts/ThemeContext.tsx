'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

type Tema = 'dark' | 'light'

interface ThemeContextType {
  tema: Tema
  toggleTema: () => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextType>({
  tema: 'dark',
  toggleTema: () => {},
  isDark: true,
})

export function ThemeProvider({
  children,
  perfilId,
  temaInicial,
}: {
  children: ReactNode
  perfilId: string
  temaInicial: Tema
}) {
  const [tema, setTema] = useState<Tema>(temaInicial)

  // Aplica o data-theme no <html> sempre que o tema mudar
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema)
    localStorage.setItem('vs_tema', tema)
  }, [tema])

  const toggleTema = useCallback(async () => {
    const novoTema: Tema = tema === 'dark' ? 'light' : 'dark'
    setTema(novoTema) // Otimista — atualiza UI imediatamente

    try {
      await fetch(`/api/admin/usuarios/${perfilId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tema: novoTema }),
      })
    } catch {
      console.error('Erro ao salvar tema')
    }
  }, [tema, perfilId])

  return (
    <ThemeContext.Provider value={{ tema, toggleTema, isDark: tema === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)