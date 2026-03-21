'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ThemeProvider } from '@/app/contexts/ThemeContext'
import ThemeToggle from '@/app/components/ThemeToggle'
import BotaoSugestao from '@/app/components/BotaoSugestao'
import PesquisaModal from '@/app/components/PesquisaModal'
import { usePesquisa } from '@/app/hooks/usePesquisa'

interface Perfil {
  id: string
  nome: string
  role: string
  tema: 'dark' | 'light'
  municipio_ativo_id: string | null
  municipios: { id: string; nome: string } | null
}

interface MunicipioOption {
  id: string | null
  nome: string
}

const IconGrid = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
const IconChart = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
const IconActivity = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
const IconUsers = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
const IconMap = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
const IconSettings = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
const IconLogout = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
const IconShield = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
const IconShieldCheck = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
const IconHospital = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></svg>
const IconChevronDown = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
const IconChevronLeft = ({ collapsed }: { collapsed: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }}>
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const IconCheck = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
const IconMenu = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
const IconMosquito = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {/* Corpo oval centralizado */}
    <ellipse cx="12" cy="13" rx="4" ry="2.5"/>
    {/* Cabeça */}
    <circle cx="12" cy="9.5" r="1.5"/>
    {/* Probóscide */}
    <line x1="12" y1="11" x2="12" y2="15.5"/>
    {/* Asa esquerda */}
    <path d="M8 12 C5 8 3 7 4 10"/>
    {/* Asa direita */}
    <path d="M16 12 C19 8 21 7 20 10"/>
    {/* Pernas dianteiras (esq/dir) */}
    <line x1="8.5" y1="13" x2="5" y2="16"/>
    <line x1="15.5" y1="13" x2="19" y2="16"/>
    {/* Pernas do meio */}
    <line x1="8" y1="14" x2="4.5" y2="18"/>
    <line x1="16" y1="14" x2="19.5" y2="18"/>
    {/* Pernas traseiras */}
    <line x1="9" y1="15" x2="6.5" y2="19.5"/>
    <line x1="15" y1="15" x2="17.5" y2="19.5"/>
  </svg>
)
const IconX = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconGlobe = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
const IconLightbulb = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.1 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
const IconClipboardList = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/><polyline points="9 9 10.5 10.5 13 8"/></svg>
const IconStethoscope = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 2v4a3.5 3.5 0 0 0 3.5 3.5"/><path d="M19.5 2v4A3.5 3.5 0 0 0 16 9.5"/><path d="M8 9.5a4 4 0 0 0 8 0"/><path d="M12 13.5V18"/><path d="M12 18a4 4 0 0 0 4 4"/><circle cx="18" cy="21" r="1.5" fill="currentColor" stroke="none"/></svg>

// ── Separador visual na sidebar ───────────────────────────────────────────────
const NavSeparator = ({ label, collapsed }: { label: string; collapsed: boolean }) => (
  <div style={{
    padding: collapsed ? '10px 0 4px' : '10px 16px 4px',
    fontSize: 10, fontWeight: 700,
    color: 'var(--text-dim)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    overflow: 'hidden', whiteSpace: 'nowrap',
    opacity: collapsed ? 0 : 1,
    transition: 'opacity 0.2s',
    height: collapsed ? 8 : 'auto',
  }}>
    {!collapsed && label}
  </div>
)

// ── Nav ───────────────────────────────────────────────────────────────────────
const NAV_ADMIN = [
  { href: '/dashboard',             label: 'Visão Geral',   icon: <IconGrid /> },
  { href: '/dashboard/usuarios',    label: 'Usuários',      icon: <IconUsers /> },
  { href: '/dashboard/municipios',  label: 'Municípios',    icon: <IconMap /> },
  { href: '/dashboard/sugestoes',   label: 'Sugestões',     icon: <IconLightbulb /> },
  { href: '/dashboard/pesquisas',   label: 'Pesquisas',     icon: <IconClipboardList /> },
  { href: '/dashboard/configuracoes', label: 'Configurações', icon: <IconSettings /> },
]

const NAV_DADOS = [
  { href: '/dashboard/producao-aps',            label: 'Produção APS',        icon: <IconChart /> },
  { href: '/dashboard/producao-ambulatorial',   label: 'Prod. Ambulatorial',  icon: <IconStethoscope /> },
  { href: '/dashboard/morbidade-hospitalar',    label: 'Morbidade Hosp.',     icon: <IconHospital /> },
  { href: '/dashboard/vigilancia-dengue',       label: 'Dengue',              icon: <IconMosquito /> },
  { href: '/dashboard/minhas-sugestoes',         label: 'Minhas Sugestões',    icon: <IconLightbulb /> },
]

function MunicipioSwitcher({ perfil, municipios, onSwitch }: { perfil: Perfil; municipios: MunicipioOption[]; onSwitch: (id: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const label = perfil.municipio_ativo_id === null ? 'Todos os municípios' : (perfil.municipios?.nome ?? '—')

  const handleSelect = async (id: string | null) => {
    if (id === perfil.municipio_ativo_id) { setOpen(false); return }
    setSwitching(true); setOpen(false)
    try {
      await fetch(`/api/admin/usuarios/${perfil.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ municipio_ativo_id: id }) })
      onSwitch(id)
    } finally { setSwitching(false) }
  }

  // Apenas 1 opção → exibe como texto estático, sem dropdown
  if (municipios.length <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 10, padding: '7px 12px', color: 'var(--text-primary)', fontSize: 13, fontWeight: 500 }}>
        {perfil.municipio_ativo_id === null
          ? <span style={{ color: 'var(--accent)' }}><IconGlobe /></span>
          : <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', boxShadow: '0 0 6px var(--accent)', flexShrink: 0 }} />}
        <span>{label}</span>
      </div>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 10, padding: '7px 12px', cursor: 'pointer', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, transition: 'all 0.2s', minWidth: 180 }}
        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-border)'}
        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-input)'}
      >
        {perfil.municipio_ativo_id === null
          ? <span style={{ color: 'var(--accent)' }}><IconGlobe /></span>
          : <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', boxShadow: '0 0 6px var(--accent)' }} />}
        <span style={{ flex: 1, textAlign: 'left' }}>{switching ? 'Trocando...' : label}</span>
        <span style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}><IconChevronDown /></span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 12, minWidth: 220, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.25)', zIndex: 300, animation: 'fadeDown 0.15s ease' }}>
          <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {municipios.map(m => {
              const isActive = m.id === perfil.municipio_ativo_id || (m.id === null && perfil.municipio_ativo_id === null)
              return (
                <button key={m.id ?? 'todos'} onClick={() => handleSelect(m.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: isActive ? 'var(--accent-subtle)' : 'transparent', color: isActive ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: isActive ? 600 : 400, textAlign: 'left', transition: 'all 0.15s', width: '100%' }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  {m.id === null ? <span style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}><IconGlobe /></span> : <span style={{ width: 7, height: 7, borderRadius: '50%', background: isActive ? 'var(--accent)' : 'var(--border-strong)', display: 'inline-block', flexShrink: 0 }} />}
                  <span style={{ flex: 1 }}>{m.nome}</span>
                  {isActive && <span style={{ color: 'var(--accent)' }}><IconCheck /></span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function DashboardInner({ children, perfil, municipioOptions, onSwitch, onLogout, isSwitching, switchingTo }: {
  children: React.ReactNode; perfil: Perfil; municipioOptions: MunicipioOption[]
  onSwitch: (id: string | null) => void; onLogout: () => void
  isSwitching: boolean; switchingTo: string
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [contadorSugestoes, setContadorSugestoes] = useState(0)
  const { pesquisaAtiva, mostrarPesquisa, fecharPesquisa } = usePesquisa()

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setSidebarOpen(false)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Buscar contador de sugestões para admin
  useEffect(() => {
    if (perfil?.role === 'super_admin') {
      const buscarContador = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) return

          const response = await fetch('/api/admin/sugestoes/contador', {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          })

          if (response.ok) {
            const data = await response.json()
            setContadorSugestoes(data.novas || 0)
          }
        } catch (error) {
          console.error('Erro ao buscar contador:', error)
        }
      }

      buscarContador()
      // Buscar a cada 30 segundos
      const interval = setInterval(buscarContador, 30000)
      return () => clearInterval(interval)
    }
  }, [perfil])

  const sidebarW = isMobile ? 240 : (collapsed ? 64 : 240)
  const toggleSidebar = () => isMobile ? setSidebarOpen(o => !o) : setCollapsed(c => !c)
  const closeMobile = () => { if (isMobile) setSidebarOpen(false) }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)', fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
      <style>{`
        @keyframes fadeDown { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeOverlay { from { opacity: 0; } to { opacity: 1; } }
        .page-enter { animation: fadeIn 0.3s ease forwards; }
        .nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 10px; cursor: pointer; transition: all 0.2s; color: var(--text-muted); text-decoration: none; white-space: nowrap; overflow: hidden; border-left: 2px solid transparent; }
        .nav-item:hover { background: var(--accent-subtle); color: var(--text-secondary); }
        .nav-item.active { background: var(--accent-subtle); color: var(--accent); border-left-color: var(--accent); }
        .nav-item .label { font-size: 14px; font-weight: 500; }
        .logout-btn { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: 10px; cursor: pointer; background: none; border: none; color: var(--text-muted); font-family: inherit; font-size: 14px; font-weight: 500; width: 100%; transition: all 0.2s; white-space: nowrap; overflow: hidden; }
        .logout-btn:hover { background: var(--danger-subtle); color: var(--danger); }
      `}</style>

      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)', zIndex: 99 }} />
      )}

      {/* Sidebar */}
      <aside style={{ width: sidebarW, minHeight: '100vh', background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100, backdropFilter: 'blur(12px)', transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1), transform 0.3s cubic-bezier(0.4,0,0.2,1)', transform: isMobile ? `translateX(${sidebarOpen ? 0 : -(sidebarW + 10)}px)` : 'none' }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, minHeight: 64 }}>
          <div style={{ flexShrink: 0 }}><IconShield /></div>
          {!collapsed && <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>Vigia<span style={{ color: 'var(--accent)' }}>Saúde</span></span>}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {/* Plataforma */}
          <NavSeparator label="Plataforma" collapsed={collapsed} />
          {NAV_ADMIN.map(item => {
            const isActive = pathname === item.href
            return (
              <Link key={item.href} href={item.href} className={`nav-item${isActive ? ' active' : ''}`} onClick={closeMobile}>
                <span style={{ flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && <span className="label">{item.label}</span>}
              </Link>
            )
          })}

          {/* Dados de saúde */}
          <NavSeparator label="Saúde" collapsed={collapsed} />
          {NAV_DADOS.map(item => {
            const isActive = pathname === item.href
            return (
              <Link key={item.href} href={item.href} className={`nav-item${isActive ? ' active' : ''}`} onClick={closeMobile}>
                <span style={{ flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && <span className="label">{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border-subtle)' }}>
          <button className="logout-btn" onClick={onLogout}>
            <span style={{ flexShrink: 0 }}><IconLogout /></span>
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', marginLeft: isMobile ? 0 : sidebarW, transition: 'margin-left 0.3s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden' }}>
        <header style={{ height: 64, background: 'var(--bg-topbar)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', position: 'sticky', top: 0, zIndex: 50 }}>
          <button onClick={toggleSidebar}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)', transition: 'all 0.2s', flexShrink: 0 }}>
            {isMobile ? (sidebarOpen ? <IconX /> : <IconMenu />) : <IconChevronLeft collapsed={collapsed} />}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {municipioOptions.length > 0 && <MunicipioSwitcher perfil={perfil} municipios={municipioOptions} onSwitch={onSwitch} />}
            <div style={{ width: 1, height: 24, background: 'var(--border)' }} className="hide-mobile" />
            <ThemeToggle />
            <div style={{ width: 1, height: 24, background: 'var(--border)' }} className="hide-mobile" />
            <span className="hide-mobile" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)', border: '1px solid var(--accent-border)', borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{perfil.role}</span>
            {perfil.role === 'super_admin' && contadorSugestoes > 0 && (
              <Link href="/dashboard/sugestoes" className="hide-mobile" style={{ background: 'var(--danger)', color: '#fff', borderRadius: 20, padding: '3px 8px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none' }}>
                {contadorSugestoes} sugestão{contadorSugestoes > 1 ? 'ões' : ''} nova{contadorSugestoes > 1 ? 's' : ''}
              </Link>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {perfil.nome.charAt(0).toUpperCase()}
              </div>
              <span className="hide-mobile" style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>{perfil.nome}</span>
            </div>
          </div>
        </header>
        <main style={{ flex: 1, position: 'relative', overflowY: 'auto', overflowX: 'hidden', minWidth: 0, paddingBottom: 80 }} className="page-enter">
          {/* Overlay de transição de município */}
          {isSwitching && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 40,
              background: 'rgba(5, 8, 22, 0.72)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
              animation: 'fadeOverlay 0.2s ease',
            }}>
              <div style={{ width: 48, height: 48, border: '3px solid var(--accent-subtle)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Carregando dados</p>
                <p style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>{switchingTo}</p>
              </div>
            </div>
          )}
          {/* key força remontagem da página ao trocar município, re-executando os useEffect de busca */}
          <div key={perfil.municipio_ativo_id ?? 'todos'} style={{ padding: 'clamp(16px, 4vw, 28px)' }}>
            {children}
          </div>
        </main>
      </div>

      {/* Botão de sugestão fixo */}
      <BotaoSugestao />

      {/* Modal de pesquisa */}
      {mostrarPesquisa && pesquisaAtiva && (
        <PesquisaModal pesquisa={pesquisaAtiva} onClose={fecharPesquisa} />
      )}
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [municipioOptions, setMunicipioOptions] = useState<MunicipioOption[]>([])
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.push('/'); return }

        // Usa API admin para evitar restrições de RLS nas queries de perfil e municípios
        const res = await fetch(`/api/admin/usuarios/${session.user.id}`)
        if (!res.ok) {
          console.error('Erro ao buscar perfil', res.status)
          // Encerra a sessão para evitar loop de redirecionamento
          await supabase.auth.signOut()
          window.location.href = '/?sair=1'
          return
        }
        const perfilData = await res.json()

        setPerfil({
          id: perfilData.id,
          nome: perfilData.nome,
          role: perfilData.role,
          tema: perfilData.tema ?? 'dark',
          municipio_ativo_id: perfilData.municipio_ativo_id,
          municipios: perfilData.municipios ?? null,
        })

        const opts: MunicipioOption[] = []
        if (perfilData.role === 'super_admin') opts.push({ id: null, nome: 'Todos os municípios' })
        ;(perfilData.perfis_municipios ?? []).forEach((v: any) => {
          if (v.municipios) opts.push({ id: v.municipios.id, nome: v.municipios.nome })
        })
        setMunicipioOptions(opts)
        setLoading(false)
      } catch (err) {
        console.error('Erro inesperado ao inicializar dashboard', err)
        setInitError(true)
        setLoading(false)
      }
    }
    init()
  }, [router])

  const [isSwitching, setIsSwitching] = useState(false)
  const [switchingTo, setSwitchingTo] = useState('')

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = '/?sair=1' }
  const handleSwitch = (id: string | null) => {
    if (!perfil) return
    const nome = id === null ? 'Todos os municípios' : (municipioOptions.find(m => m.id === id)?.nome ?? '')
    setSwitchingTo(nome)
    setIsSwitching(true)
    setPerfil(prev => prev ? { ...prev, municipio_ativo_id: id, municipios: id === null ? null : municipioOptions.find(m => m.id === id) as any ?? null } : null)
    // Oculta o overlay após 900ms — tempo suficiente para a página remontar e iniciar o loading próprio
    setTimeout(() => setIsSwitching(false), 900)
  }

  if (initError) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <p style={{ color: 'var(--text-secondary)', fontSize: 15, textAlign: 'center' }}>
        Não foi possível carregar o painel. Verifique sua conexão e tente novamente.
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}
        >
          Tentar novamente
        </button>
        <button
          onClick={async () => { await supabase.auth.signOut(); window.location.href = '/?sair=1' }}
          style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}
        >
          Sair
        </button>
      </div>
    </div>
  )

  if (loading || !perfil) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '3px solid var(--accent-subtle)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <ThemeProvider perfilId={perfil.id} temaInicial={perfil.tema ?? 'dark'}>
      <DashboardInner perfil={perfil} municipioOptions={municipioOptions} onSwitch={handleSwitch} onLogout={handleLogout} isSwitching={isSwitching} switchingTo={switchingTo}>
        {children}
      </DashboardInner>
    </ThemeProvider>
  )
}