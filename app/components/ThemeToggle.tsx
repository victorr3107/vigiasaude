'use client'

import { useTheme } from '@/app/contexts/ThemeContext'

export default function ThemeToggle() {
  const { tema, toggleTema } = useTheme()

  return (
    <button
      className="action-btn"
      onClick={toggleTema}
      title={tema === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      aria-label={tema === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
    >
      {tema === 'dark' ? (
        // Lua — clique vira sol
        <svg width="20" height="20" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      ) : (
        // Sol — clique vira lua
        <svg width="20" height="20" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      )}
    </button>
  )
}
