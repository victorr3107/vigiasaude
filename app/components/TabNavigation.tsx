'use client'

/**
 * TabNavigation — componente reutilizável de abas para o VigiaSaúde
 *
 * Props:
 *   tabs      – array de { id, label, badge?, disabled? }
 *   activeTab – id da aba ativa
 *   onChange  – callback chamado ao trocar de aba (apenas abas habilitadas)
 *
 * Comportamento:
 *   • Aba ativa: cor primária (--accent) + underline indicator
 *   • Aba desabilitada: opacidade reduzida, cursor default, sem ação ao clicar
 *   • Mobile (< 768px): scroll horizontal sem quebra de linha
 *   • Transition: 150ms
 *   • Sincroniza com ?tab= na URL via useSearchParams / router.replace
 */

import { useCallback, useEffect, useRef } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export interface TabItem {
  id: string
  label: string
  badge?: string
  disabled?: boolean
}

interface TabNavigationProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (tabId: string) => void
}

export default function TabNavigation({ tabs, activeTab, onChange }: TabNavigationProps) {
  const router     = useRouter()
  const pathname   = usePathname()
  const searchParams = useSearchParams()
  const scrollRef  = useRef<HTMLDivElement>(null)

  // Sincroniza URL → aba ativa na montagem e ao navegar com o botão Back/Forward
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab')
    if (!tabFromUrl) return
    const match = tabs.find(t => t.id === tabFromUrl && !t.disabled)
    if (match && match.id !== activeTab) {
      onChange(match.id)
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = useCallback((tab: TabItem) => {
    if (tab.disabled) return
    if (tab.id === activeTab) return

    // Atualiza URL (sem reload de página)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab.id)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })

    onChange(tab.id)
  }, [activeTab, onChange, pathname, router, searchParams])

  return (
    <>
      <style>{`
        .tab-nav-wrapper {
          position: relative;
          overflow: hidden;
        }
        .tab-nav-wrapper::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: var(--border);
          pointer-events: none;
        }
        .tab-nav-scroll {
          display: flex;
          align-items: flex-end;
          gap: 0;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
          -webkit-overflow-scrolling: touch;
        }
        .tab-nav-scroll::-webkit-scrollbar { display: none; }
        .tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-muted);
          font-family: 'DM Sans', 'Segoe UI', sans-serif;
          font-size: 13.5px;
          font-weight: 500;
          white-space: nowrap;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
          position: relative;
          flex-shrink: 0;
          margin-bottom: -1px;
          line-height: 1.4;
        }
        .tab-btn:hover:not(.tab-btn--disabled):not(.tab-btn--active) {
          color: var(--text-secondary);
        }
        .tab-btn--active {
          color: var(--accent);
          border-bottom-color: var(--accent);
          font-weight: 600;
          cursor: default;
        }
        .tab-btn--disabled {
          opacity: 0.38;
          cursor: default;
          pointer-events: none;
        }
        .tab-badge {
          display: inline-flex;
          align-items: center;
          padding: 1px 7px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.04em;
          background: var(--bg-surface-2);
          color: var(--text-muted);
          border: 1px solid var(--border);
          line-height: 1.6;
        }
        .tab-btn--active .tab-badge {
          background: var(--accent-subtle);
          color: var(--accent);
          border-color: var(--accent-border);
        }
      `}</style>

      <div className="tab-nav-wrapper">
        <div className="tab-nav-scroll" ref={scrollRef} role="tablist">
          {tabs.map(tab => {
            const isActive   = tab.id === activeTab
            const isDisabled = !!tab.disabled

            let cls = 'tab-btn'
            if (isActive)   cls += ' tab-btn--active'
            if (isDisabled) cls += ' tab-btn--disabled'

            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-disabled={isDisabled}
                className={cls}
                onClick={() => handleClick(tab)}
                tabIndex={isDisabled ? -1 : 0}
              >
                {tab.label}
                {tab.badge && (
                  <span className="tab-badge">{tab.badge}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
