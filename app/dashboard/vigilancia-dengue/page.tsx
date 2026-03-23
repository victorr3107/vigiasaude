'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TabNavigation, { TabItem } from '@/app/components/TabNavigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  Cell, ReferenceLine,
} from 'recharts'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface AnoItem    { ano: string; casos: number; parcial: boolean }
interface QtdPct     { qtd: number; pct: number }
interface SemanaItem { semana: number; casos_historicos: number; pct_do_total: number; datas_2026: { inicio: string; fim: string } }
interface MesItem    { mes: string; mes_nome: string; mes_num: number; casos_historicos: number; pct_do_total: number }

interface Historico {
  ibge: string; uf: string; nome: string
  por_ano: AnoItem[]
  ano_pico: string; casos_ano_pico: number
  media_historica: number
  var_2023_2024_pct: number | null
  var_2024_2025_pct: number | null
  total_historico: number
}

interface Sazonalidade {
  ibge: string
  por_semana: SemanaItem[]
  por_mes: MesItem[]
  semana_pico_historica: number
  datas_semana_pico_2026: { inicio: string; fim: string }
  mes_pico: string
  meses_criticos: string[]
  pct_jan_jun: number
}

interface Perfil {
  ibge: string; nome: string; total_notificado: number
  classificacao: { dengue_simples: QtdPct; sinais_alarme: QtdPct; grave: QtdPct; inconclusivo: QtdPct }
  evolucao: { cura: QtdPct; obito_dengue: QtdPct; obito_outra_causa: QtdPct; taxa_letalidade: number }
  hospitalizacao: { sim: QtdPct; nao: QtdPct; taxa_hospitalizacao: number }
  faixa_etaria: { crianca: QtdPct; adolescente: QtdPct; adulto_jovem: QtdPct; adulto: QtdPct; idoso: QtdPct; faixa_dominante: string; faixa_dominante_label: string }
  sexo: { masculino: QtdPct; feminino: QtdPct }
}

interface BenchmarkMes  { mes: string; mes_nome: string; mes_num: number; pct_historico: number; casos_historicos: number }
interface BenchmarkSem  { semana: number; pct_historico: number; casos_historicos: number }
interface Benchmarks {
  // nacional (dengue_benchmarks_nacional.json)
  total_casos_brasil_por_ano: Record<string, number>
  ano_pico_brasil: string
  municipios_com_dado: number
  sazonalidade_sp: { por_semana: BenchmarkSem[]; por_mes: BenchmarkMes[] }
  taxa_hospitalizacao_brasil_media: number
  taxa_letalidade_brasil_media: number
  pct_sinais_alarme_brasil_media: number
  // legado SP (dengue_benchmarks_sp.json — fallback)
  total_casos_sp_por_ano?: Record<string, number>
  ano_pico_sp?: string
  taxa_hospitalizacao_sp_media?: number
  taxa_letalidade_sp_media?: number
  pct_sinais_alarme_sp_media?: number
}

interface MensalAnual {
  Jan: number; Fev: number; Mar: number; Abr: number; Mai: number; Jun: number
  Jul: number; Ago: number; Set: number; Out: number; Nov: number; Dez: number
  total: number
}

interface AnoPerfilAnual {
  mensal: MensalAnual
  evolucao: { cura: QtdPct; obito_dengue: QtdPct; taxa_letalidade: number }
  hospitalizacao: { sim: QtdPct; nao: QtdPct; taxa_hospitalizacao: number }
  faixa_etaria: { crianca: QtdPct; adolescente: QtdPct; adulto_jovem: QtdPct; adulto: QtdPct; idoso: QtdPct; faixa_dominante: string }
  sexo: { masculino: QtdPct; feminino: QtdPct }
  classificacao: { dengue_simples: QtdPct; sinais_alarme: QtdPct; grave: QtdPct }
}

interface PerfilAnual {
  por_ano: Record<string, AnoPerfilAnual>
  variacao_hospitalizacao_2425_pp: number | null
  variacao_letalidade_2425_pp: number | null
  variacao_idosos_2425_pp: number | null
  ano_maior_hospitalizacao: string | null
  ano_maior_letalidade: string | null
}

interface SemanaAtual {
  semana: number; ano: number; inicio: string; fim: string
  badge_tipo: 'inicio' | 'ativa' | 'baixa' | 'pre'
}

interface SemanaAnoItem { semana: number; [ano: string]: number }

interface SemanaAnoNacional {
  _meta: { anos_disponiveis: string[]; total_semanas: number; nota: string }
  por_semana: SemanaAnoItem[]
  pico_por_ano: Record<string, { semana: number; casos: number }>
}

interface SemanaAnoMunicipio {
  por_semana: SemanaAnoItem[]
  pico_por_ano: Record<string, { semana: number; casos: number }>
  anos_disponiveis: string[]
}

interface DadosDengue {
  ibge: string
  historico: Historico
  sazonalidade: Sazonalidade | null
  perfil: Perfil | null
  benchmarks: Benchmarks
  semana_atual: SemanaAtual | null
  semana_por_ano_nacional: SemanaAnoNacional | null
  semana_por_ano_municipio: SemanaAnoMunicipio | null
  perfil_anual: PerfilAnual | null
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const TABS: TabItem[] = [
  { id: 'geral',      label: 'Visão Geral' },
  { id: 'tendencia',  label: 'Tendência Histórica' },
  { id: 'sazon',      label: 'Sazonalidade' },
  { id: 'perfil',     label: 'Perfil dos Casos' },
]

// ─── Utilitários ─────────────────────────────────────────────────────────────

const fmt   = (n: number) => n.toLocaleString('pt-BR')
const fmtP  = (n: number, c = 1) => n.toFixed(c) + '%'

function varLabel(v: number | null): string {
  if (v === null) return '—'
  const sinal = v >= 0 ? '+' : ''
  return `${sinal}${v.toFixed(1)}%`
}

function dataRange(inicio: string, fim: string): string {
  const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
  const [dI, mI] = inicio.split('/')
  const [dF, mF] = fim.split('/')
  const mNomeFim = MESES[parseInt(mF) - 1]
  if (mI === mF) return `${parseInt(dI)} a ${parseInt(dF)} de ${mNomeFim}`
  const mNomeIni = MESES[parseInt(mI) - 1]
  return `${parseInt(dI)} de ${mNomeIni} a ${parseInt(dF)} de ${mNomeFim}`
}

function badgeInfo(tipo: SemanaAtual['badge_tipo']) {
  switch (tipo) {
    case 'inicio': return { bg: 'var(--warning-subtle)', color: 'var(--warning)', texto: 'Início de temporada' }
    case 'ativa':  return { bg: 'var(--danger-subtle)',  color: 'var(--danger)',  texto: 'Temporada ativa — pico histórico' }
    case 'baixa':  return { bg: 'var(--success-subtle)', color: 'var(--success)', texto: 'Baixa transmissão' }
    case 'pre':    return { bg: 'var(--warning-subtle)', color: 'var(--warning)', texto: 'Pré-temporada — aja agora' }
  }
}

function barColor(casos: number, media: number): string {
  if (media === 0) return 'var(--chart-blue)'
  const ratio = casos / media
  if (ratio > 2)   return 'var(--danger)'
  if (ratio > 1.2) return 'var(--warning)'
  if (ratio < 0.8) return 'var(--chart-green)'
  return 'var(--chart-blue)'
}

// ─── Tooltip reutilizável ─────────────────────────────────────────────────────

const TooltipBox = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-modal)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--text-primary)' }}>
      {label && <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color ?? 'var(--text-secondary)' }}>
          {p.name}: <strong>{fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ valores, cor }: { valores: number[]; cor: string }) {
  if (valores.length < 2) return null
  const max = Math.max(...valores)
  const min = Math.min(...valores)
  const range = max - min || 1
  const W = 64, H = 22
  const pts = valores
    .map((v, i) => `${(i / (valores.length - 1)) * W},${H - ((v - min) / range) * (H - 2) - 1}`)
    .join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', marginTop: 6, overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={cor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
    </svg>
  )
}

// ─── Aba 1: Visão Geral ───────────────────────────────────────────────────────

function AbaVisaoGeral({ dados }: { dados: DadosDengue }) {
  const { historico, perfil, benchmarks, semana_atual } = dados

  // KPIs
  const casos2025    = historico.por_ano.find(a => a.ano === '2025')?.casos ?? 0
  const casos2024    = historico.por_ano.find(a => a.ano === '2024')?.casos ?? 0
  const casos2026p   = historico.por_ano.find(a => a.ano === '2026')?.casos ?? 0
  const varVsPico    = historico.var_2024_2025_pct
  const acimaPico    = casos2025 > casos2024

  const taxaHosp  = perfil?.hospitalizacao.taxa_hospitalizacao ?? 0
  const hospBR    = benchmarks.taxa_hospitalizacao_brasil_media ?? benchmarks.taxa_hospitalizacao_sp_media ?? 0
  const hospCor   = taxaHosp < hospBR * 0.9 ? 'var(--success)' : taxaHosp > hospBR * 1.1 ? 'var(--warning)' : 'var(--chart-blue)'

  const obitosDengue = perfil?.evolucao.obito_dengue.qtd ?? 0
  const taxaLetal    = perfil?.evolucao.taxa_letalidade ?? 0

  // Sparkline — tendência dos casos por ano (excluindo parcial 2026)
  const sparkVals = historico.por_ano.filter(a => !a.parcial).map(a => a.casos)

  // 4B — Pior ano: detectar se é o mais recente ano completo
  const anosCompletos = historico.por_ano.filter(a => !a.parcial)
  const anoMaisRecente = anosCompletos[anosCompletos.length - 1]?.ano ?? ''
  const picoEhRecente  = historico.ano_pico === anoMaisRecente

  // Mini histórico
  const miniData = historico.por_ano.map(a => ({
    ano: a.ano === '2026' ? '26p' : a.ano.slice(2),
    casos: a.casos,
    parcial: a.parcial,
    color: a.parcial ? 'var(--chart-slate)' : barColor(a.casos, historico.media_historica),
  }))

  // 4A — Alerta sazonal (movido para topo)
  const alertaBg   = semana_atual ? badgeInfo(semana_atual.badge_tipo).bg   : 'var(--info-subtle)'
  const alertaCor  = semana_atual ? badgeInfo(semana_atual.badge_tipo).color : 'var(--info)'
  let alertaTitulo = ''
  let alertaTexto  = ''

  if (semana_atual) {
    const se = semana_atual
    const datas = dataRange(se.inicio, se.fim)
    if (se.badge_tipo === 'ativa') {
      alertaTitulo = `⚠ Temporada ativa — SE ${se.semana}/${se.ano}`
      alertaTexto  = `O pico histórico ocorre entre as semanas 8 e 15. Hoje estamos na SE ${se.semana}/${se.ano} (${datas}). Reforce ações de controle e atenção clínica.`
    } else if (se.badge_tipo === 'inicio') {
      alertaTitulo = `Início de temporada — SE ${se.semana}/${se.ano}`
      alertaTexto  = `A temporada de dengue está começando (${datas}). Historicamente o pico ocorre nas semanas 8–15.`
    } else if (se.badge_tipo === 'pre') {
      alertaTitulo = `Pré-temporada — SE ${se.semana}/${se.ano}`
      alertaTexto  = `Intensifique ações de controle vetorial agora. O pico histórico começa na semana 8 (${datas}).`
    } else {
      alertaTitulo = `Período de baixa transmissão — SE ${se.semana}/${se.ano}`
      alertaTexto  = `Aproveite para ações de controle vetorial antes da próxima temporada (a partir da semana 8).`
    }
  }

  // 4D — Contexto atual: comparativo de anos no mesmo período parcial
  const seAtual = semana_atual?.semana ?? null
  const anoAtual = semana_atual?.ano ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.3s ease' }}>

      {/* 4A — Alerta sazonal no topo (borda lateral colorida) */}
      {semana_atual && (
        <div style={{
          background: alertaBg,
          borderLeft: `4px solid ${alertaCor}`,
          border: `1px solid ${alertaCor}30`,
          borderLeftColor: alertaCor,
          borderRadius: 8,
          padding: '14px 18px',
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: alertaCor, marginBottom: 5 }}>
            {alertaTitulo}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            {alertaTexto}
          </div>
        </div>
      )}

      {/* KPIs — 4 cards com sparklines (4C) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>

        {/* Card 1 — Casos 2025 */}
        <div className="kpi-card">
          <div className="kpi-label">Casos em 2025</div>
          <div className="kpi-value">{fmt(casos2025)}</div>
          <div className="kpi-sub" style={{ color: acimaPico ? 'var(--danger)' : 'var(--success)' }}>
            {varLabel(varVsPico)} vs 2024
          </div>
          <div className="kpi-badge" style={{ background: acimaPico ? 'var(--danger-subtle)' : 'var(--success-subtle)', color: acimaPico ? 'var(--danger)' : 'var(--success)' }}>
            {acimaPico ? 'Acima de 2024' : 'Abaixo do pico de 2024'}
          </div>
          <Sparkline valores={sparkVals} cor={acimaPico ? 'var(--danger)' : 'var(--success)'} />
        </div>

        {/* Card 2 — Pior Ano (4B) */}
        <div className="kpi-card">
          <div className="kpi-label">Pior Ano Histórico</div>
          <div className="kpi-value">{historico.ano_pico}</div>
          <div className="kpi-sub">{fmt(historico.casos_ano_pico)} casos</div>
          {historico.media_historica > 0 && (
            <div className="kpi-badge" style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
              {(historico.casos_ano_pico / historico.media_historica).toFixed(1)}× a média histórica
            </div>
          )}
          {/* 4B — nota quando o pior ano é o mais recente */}
          {picoEhRecente && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, color: 'var(--warning)',
                background: 'var(--warning-subtle)', padding: '1px 7px', borderRadius: 20,
              }}>
                Ano em andamento
              </span>
            </div>
          )}
          <Sparkline valores={sparkVals} cor="var(--danger)" />
        </div>

        {/* Card 3 — Hospitalização */}
        <div className="kpi-card">
          <div className="kpi-label">Taxa de Hospitalização</div>
          <div className="kpi-value" style={{ color: hospCor }}>{fmtP(taxaHosp, 1)}</div>
          <div className="kpi-sub">dos casos precisaram de internação</div>
          <div className="kpi-badge" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}>
            Média BR: {fmtP(hospBR, 1)}
          </div>
          <Sparkline valores={sparkVals} cor={hospCor} />
        </div>

        {/* Card 4 — Óbitos */}
        <div className="kpi-card">
          <div className="kpi-label">Óbitos por Dengue</div>
          {obitosDengue === 0
            ? <>
                <div className="kpi-value">0</div>
                <div className="kpi-badge" style={{ background: 'var(--success-subtle)', color: 'var(--success)' }}>Nenhum óbito registrado</div>
              </>
            : <>
                <div className="kpi-value" style={{ color: 'var(--danger)' }}>{fmt(obitosDengue)}</div>
                <div className="kpi-sub">{taxaLetal.toFixed(3)}% taxa de letalidade</div>
              </>
          }
          <Sparkline valores={sparkVals} cor={obitosDengue === 0 ? 'var(--success)' : 'var(--danger)'} />
        </div>
      </div>

      {/* Mini histórico */}
      <div className="card-section">
        <div className="section-title">Histórico de Casos (2019–2026)</div>
        <div style={{ position: 'relative' }}>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={miniData} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 2" />
              <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <RTooltip content={<TooltipBox />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <ReferenceLine y={historico.media_historica} stroke="var(--chart-slate)" strokeDasharray="4 2"
                label={{ value: 'média', position: 'insideTopRight', fontSize: 10, fill: 'var(--text-dim)' }} />
              <Bar dataKey="casos" name="Casos" radius={[3, 3, 0, 0]}>
                {miniData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} fillOpacity={entry.parcial ? 0.5 : 1}
                    strokeDasharray={entry.parcial ? '4 2' : undefined} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'right', marginTop: 4 }}>
            26p = 2026 parcial · linha tracejada = média histórica
          </div>
        </div>
      </div>

      {/* 4D — Card Contexto Atual */}
      {seAtual && anoAtual && (
        <div className="card-section">
          <div className="section-title">Contexto Atual</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {/* SE atual */}
            <div style={{ padding: '10px 12px', background: 'var(--bg-surface-2)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Semana Epidemiológica</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>SE {seAtual}/{anoAtual}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {dataRange(semana_atual!.inicio, semana_atual!.fim)}
              </div>
              <div style={{ fontSize: 11, color: alertaCor, marginTop: 4, fontWeight: 600 }}>
                {badgeInfo(semana_atual!.badge_tipo).texto}
              </div>
            </div>
            {/* 2026 parcial */}
            {casos2026p > 0 && (
              <div style={{ padding: '10px 12px', background: 'var(--bg-surface-2)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Casos em {anoAtual} (parcial)</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(casos2026p)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  até SE {seAtual}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  Dados do SINAN — atualização não é em tempo real
                </div>
              </div>
            )}
            {/* Comparativo mesmo período anos anteriores */}
            {casos2025 > 0 && casos2026p > 0 && (
              <div style={{ padding: '10px 12px', background: 'var(--bg-surface-2)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Referência — ano anterior</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  2025: {fmt(casos2025)} casos (ano completo)
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 4 }}>
                  2024: {fmt(casos2024)} casos (ano completo)
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                  Comparativo semana a semana disponível em Sazonalidade
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Comparativo Semanal Nacional ─────────────────────────────────────────────

const COR_ANO: Record<string, { stroke: string; width: number; opacity: number; dash?: string }> = {
  '2019': { stroke: '#64748b', width: 1,   opacity: 0.40 },
  '2020': { stroke: '#64748b', width: 1,   opacity: 0.40 },
  '2021': { stroke: '#64748b', width: 1,   opacity: 0.40 },
  '2022': { stroke: '#94a3b8', width: 1,   opacity: 0.50 },
  '2023': { stroke: '#60a5fa', width: 1.5, opacity: 0.70 },
  '2024': { stroke: '#f59e0b', width: 2.5, opacity: 1.00 },
  '2025': { stroke: '#ef4444', width: 2.5, opacity: 1.00 },
  '2026': { stroke: '#94a3b8', width: 1.5, opacity: 0.60, dash: '4 3' },
}

const ANOS_DESTAQUE = ['2024', '2025']
const ANOS_PADRAO   = ['2023', '2024', '2025', '2026']

function DengueComparativoSemanal({
  dados, semana_atual, nomeLocal, isNacional,
}: {
  dados: SemanaAnoMunicipio
  semana_atual: SemanaAtual | null
  nomeLocal: string
  isNacional?: boolean
}) {
  const { por_semana, pico_por_ano, anos_disponiveis: anosDisp } = dados

  const [anosVisiveis, setAnosVisiveis] = useState<string[]>(
    ANOS_PADRAO.filter(a => anosDisp.includes(a))
  )
  const [expandido, setExpandido] = useState(false)

  const toggleAno = (ano: string) =>
    setAnosVisiveis(v => v.includes(ano) ? v.filter(a => a !== ano) : [...v, ano].sort())

  const toggleTodos = () => {
    if (expandido) {
      setAnosVisiveis(ANOS_PADRAO.filter(a => anosDisp.includes(a)))
      setExpandido(false)
    } else {
      setAnosVisiveis([...anosDisp])
      setExpandido(true)
    }
  }

  // Tooltip customizado
  const TooltipComp = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color?: string; stroke?: string }[]; label?: string }) => {
    if (!active || !payload?.length) return null
    const semNum = parseInt(String(label ?? ''))
    const calAno = semana_atual?.ano ?? 2026
    const semDados = por_semana.find(s => s.semana === semNum)
    const datas = semDados
      ? (() => {
          // Usa datas do calendário 2026 como referência
          const sem2026 = dados.por_semana.find(s => s.semana === semNum)
          return sem2026 ? `SE ${semNum}` : `SE ${semNum}`
        })()
      : `SE ${semNum}`
    return (
      <div style={{ background: 'var(--bg-modal)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, minWidth: 180 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{datas}/{calAno}</div>
        {payload
          .filter(p => anosVisiveis.includes(p.name))
          .sort((a, b) => b.value - a.value)
          .map(p => (
            <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: p.stroke ?? 'var(--text-secondary)', marginBottom: 2 }}>
              <span style={{ fontWeight: ANOS_DESTAQUE.includes(p.name) ? 700 : 400 }}>{p.name}:</span>
              <strong>{fmt(p.value)}</strong>
            </div>
          ))
        }
      </div>
    )
  }

  // Narrativa dinâmica
  const pico25 = pico_por_ano['2025']
  const pico24 = pico_por_ano['2024']
  let narrativa = ''
  if (pico25 && pico24 && (pico25.casos > 0 || pico24.casos > 0)) {
    const local = isNacional ? 'nacional' : `em ${nomeLocal}`
    narrativa = `Em 2025, o pico ${local} ocorreu na SE ${pico25.semana} com ${fmt(pico25.casos)} casos. `
    narrativa += `Em 2024, o pico foi na SE ${pico24.semana} com ${fmt(pico24.casos)} casos. `
    if (pico25.casos > pico24.casos) narrativa += `2025 superou 2024 no pico semanal.`
    else narrativa += `2025 teve pico inferior a 2024.`
  }

  const seAtual = semana_atual?.semana

  return (
    <div className="card-section" style={{ marginTop: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>
            Comparativo por Semana Epidemiológica — {isNacional ? 'Brasil (dados nacionais)' : nomeLocal}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Casos notificados por semana epidemiológica{isNacional ? ' — referência nacional (SINAN)' : ` no município (SINAN)`}. Selecione os anos:
          </div>
        </div>
        <button
          onClick={toggleTodos}
          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {expandido ? 'Menos anos' : 'Ver todos os anos'}
        </button>
      </div>

      {/* Pills de ano */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {anosDisp.map(ano => {
          const cfg = COR_ANO[ano] ?? { stroke: '#94a3b8', width: 1, opacity: 0.5 }
          const ativo = anosVisiveis.includes(ano)
          return (
            <button
              key={ano}
              onClick={() => toggleAno(ano)}
              style={{
                fontSize: 11, fontWeight: ANOS_DESTAQUE.includes(ano) ? 700 : 400,
                padding: '3px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
                border: `1.5px solid ${ativo ? cfg.stroke : 'var(--border-input)'}`,
                background: ativo ? `${cfg.stroke}18` : 'transparent',
                color: ativo ? cfg.stroke : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {ano}
            </button>
          )
        })}
      </div>

      {/* Gráfico de linhas */}
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={por_semana} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 2" />
          <XAxis dataKey="semana" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
            tickFormatter={v => v % 5 === 0 ? `SE ${v}` : ''} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false}
            tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
          <RTooltip content={<TooltipComp />} cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }} />
          {/* Linha vertical — semana atual */}
          {seAtual && (
            <ReferenceLine x={seAtual} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 2"
              label={{ value: `SE ${seAtual}`, position: 'top', fontSize: 9, fill: 'var(--accent)' }} />
          )}
          {anosDisp.map(ano => {
            const cfg = COR_ANO[ano] ?? { stroke: '#94a3b8', width: 1, opacity: 0.5 }
            if (!anosVisiveis.includes(ano)) return null
            return (
              <Line
                key={ano}
                dataKey={ano}
                name={ano}
                stroke={cfg.stroke}
                strokeWidth={cfg.width}
                strokeOpacity={cfg.opacity}
                strokeDasharray={cfg.dash}
                dot={false}
                activeDot={ANOS_DESTAQUE.includes(ano) ? { r: 4, fill: cfg.stroke } : false}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>

      {/* Marcadores de pico para anos em destaque */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
        {ANOS_DESTAQUE.filter(a => anosVisiveis.includes(a) && pico_por_ano[a]).map(ano => {
          const cfg = COR_ANO[ano]!
          const p   = pico_por_ano[ano]
          return (
            <div key={ano} style={{ fontSize: 11, color: cfg.stroke, fontWeight: 600 }}>
              ▲ {ano} pico: SE {p.semana} · {fmt(p.casos)} casos
            </div>
          )
        })}
      </div>

      {/* Narrativa */}
      {narrativa && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--bg-surface-2)', borderRadius: 7, borderLeft: '3px solid var(--chart-slate)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {narrativa}
        </div>
      )}

      {/* Nota */}
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
        {isNacional
          ? `Cada linha representa casos notificados por semana epidemiológica no Brasil. Fonte: SINAN. Os dados de ${nomeLocal} seguem o mesmo padrão sazonal mas em escala municipal.`
          : `Cada linha representa casos notificados por semana epidemiológica em ${nomeLocal}. Fonte: SINAN. Dados reais por notificação municipal.`}
      </div>
    </div>
  )
}

// ─── Aba 2: Tendência Histórica ───────────────────────────────────────────────

const MESES_ABREV_LIST = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'] as const
const CORES_ANUAL: Record<string, string> = { '2022': '#94a3b8', '2023': '#60a5fa', '2024': '#f59e0b', '2025': '#ef4444' }
const ANOS_ANUAL_EXIB = ['2022','2023','2024','2025']

function AbaTendencia({ dados }: { dados: DadosDengue }) {
  const { historico, benchmarks, semana_por_ano_nacional, semana_por_ano_municipio, semana_atual, perfil_anual } = dados

  // Prefere dados reais do município; fallback para nacional
  const dadosComparativos: SemanaAnoMunicipio | null =
    semana_por_ano_municipio ??
    (semana_por_ano_nacional
      ? { ...semana_por_ano_nacional, anos_disponiveis: semana_por_ano_nacional._meta.anos_disponiveis }
      : null)
  const isNacionalFallback = !semana_por_ano_municipio && !!semana_por_ano_nacional
  const media = historico.media_historica

  const barData = historico.por_ano.map(a => ({
    ano: a.ano,
    casos: a.casos,
    parcial: a.parcial,
    color: a.parcial ? 'var(--chart-slate)' : barColor(a.casos, media),
  }))

  // Variações ano a ano
  const variacoes: { de: string; para: string; pct: number | null }[] = []
  const anos = historico.por_ano.filter(a => !a.parcial)
  for (let i = 1; i < anos.length; i++) {
    const ant = anos[i - 1].casos
    const atu = anos[i].casos
    const pct = ant > 0 ? (atu - ant) / ant * 100 : null
    variacoes.push({ de: anos[i - 1].ano, para: anos[i].ano, pct })
  }

  // Comparativo BR normalizado base 100 (2019)
  const casosBrPorAno = benchmarks.total_casos_brasil_por_ano ?? benchmarks.total_casos_sp_por_ano ?? {}
  const base2019Mun = historico.por_ano.find(a => a.ano === '2019')?.casos ?? 0
  const base2019BR  = casosBrPorAno['2019'] ?? 1
  const compData = historico.por_ano
    .filter(a => !a.parcial && casosBrPorAno[a.ano] !== undefined)
    .map(a => ({
      ano:       a.ano,
      municipio: base2019Mun > 0 ? Math.round(a.casos / base2019Mun * 100) : 0,
      br:        Math.round(casosBrPorAno[a.ano] / base2019BR * 100),
    }))

  // Narrativa
  const casos2025 = historico.por_ano.find(a => a.ano === '2025')?.casos ?? 0
  const var2425   = historico.var_2024_2025_pct
  const movText   = var2425 !== null
    ? (var2425 >= 0 ? `aumento de ${var2425.toFixed(1)}%` : `queda de ${Math.abs(var2425).toFixed(1)}%`)
    : 'variação não disponível'
  const var2324   = historico.var_2023_2024_pct

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeIn 0.3s ease' }}>
      {/* Gráfico principal */}
      <div className="card-section">
        <div className="section-title">Casos por Ano (2019–2026)</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 2" />
            <XAxis dataKey="ano" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
            <RTooltip content={<TooltipBox />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <ReferenceLine y={media} stroke="var(--chart-slate)" strokeDasharray="4 2"
              label={{ value: 'média', position: 'insideTopRight', fontSize: 10, fill: 'var(--text-dim)' }} />
            <Bar dataKey="casos" name="Casos" radius={[4, 4, 0, 0]}>
              {barData.map((entry, i) => (
                <Cell key={i} fill={entry.color} fillOpacity={entry.parcial ? 0.45 : 0.9}
                  strokeDasharray={entry.parcial ? '4 2' : undefined} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'right', marginTop: 4 }}>
          2026 = parcial · tracejado = média histórica
        </div>
      </div>

      {/* Variações + comparativo SP em 2 colunas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Variações */}
        <div className="card-section">
          <div className="section-title">Variações Anuais</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {variacoes.map(v => {
              const destaque = v.de === '2023' && v.para === '2024'
              const cor = v.pct === null ? 'var(--text-muted)' : v.pct >= 0 ? 'var(--danger)' : 'var(--success)'
              return (
                <div key={v.para} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px', borderRadius: 6,
                  background: destaque ? 'var(--danger-subtle)' : 'var(--bg-surface-2)',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v.de} → {v.para}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: cor }}>
                    {v.pct !== null ? varLabel(v.pct) : '—'}
                    {destaque && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--danger)' }}>pico</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Comparativo BR */}
        <div className="card-section">
          <div className="section-title">Comparativo com BR (base 100 em 2019)</div>
          {base2019Mun > 0
            ? <ResponsiveContainer width="100%" height={160}>
                <LineChart data={compData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="4 2" />
                  <XAxis dataKey="ano" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
                  <RTooltip content={<TooltipBox />} />
                  <Line dataKey="municipio" name="Município" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
                  <Line dataKey="br"        name="Brasil"    stroke="var(--chart-slate)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            : <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '20px 0' }}>Sem dados em 2019 para normalização.</div>
          }
        </div>
      </div>

      {/* Narrativa */}
      <div style={{ background: 'var(--bg-surface-2)', borderRadius: 8, padding: '14px 16px', borderLeft: '3px solid var(--accent)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        {historico.nome} registrou <strong>{fmt(casos2025)}</strong> casos em 2025
        {var2425 !== null ? `, representando ${movText} em relação a 2024.` : '.'}
        {' '}O pior ano foi <strong>{historico.ano_pico}</strong> com <strong>{fmt(historico.casos_ano_pico)}</strong> casos
        {historico.media_historica > 0
          ? ` — ${(historico.casos_ano_pico / historico.media_historica).toFixed(1)}× a média histórica do município`
          : ''}.
        {var2324 !== null && ` A transição 2023→2024 representou ${varLabel(var2324)}.`}
      </div>

      {/* Sazonalidade mensal por ano (usa dengue_perfil_anual.json) */}
      {perfil_anual && (() => {
        const anosDisp = ANOS_ANUAL_EXIB.filter(a => perfil_anual.por_ano[a]?.mensal)
        if (anosDisp.length === 0) return null
        const mensalData = MESES_ABREV_LIST.map(mes => {
          const row: Record<string, string | number> = { mes }
          for (const ano of anosDisp) {
            row[ano] = perfil_anual.por_ano[ano]?.mensal?.[mes as keyof MensalAnual] ?? 0
          }
          return row
        })
        return (
          <div className="card-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>
                Sazonalidade Mensal por Ano — {historico.nome} ({anosDisp[0]}–{anosDisp[anosDisp.length - 1]})
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {anosDisp.map(ano => (
                  <span key={ano} style={{ fontSize: 11, color: CORES_ANUAL[ano], display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: CORES_ANUAL[ano], display: 'inline-block' }} />
                    {ano}
                  </span>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mensalData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%" barGap={2}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 2" />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                <RTooltip content={<TooltipBox />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                {anosDisp.map(ano => (
                  <Bar key={ano} dataKey={ano} name={ano} fill={CORES_ANUAL[ano]} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              Casos notificados por mês e ano. Fonte: SINAN (dengue_perfil_anual). Dados reais do município.
            </div>
          </div>
        )
      })()}

      {/* Comparativo semanal (municipal ou nacional) */}
      {dadosComparativos && (
        <DengueComparativoSemanal
          dados={dadosComparativos}
          semana_atual={semana_atual}
          nomeLocal={historico.nome}
          isNacional={isNacionalFallback}
        />
      )}
    </div>
  )
}

// ─── Aba 3: Sazonalidade ──────────────────────────────────────────────────────

// Meses do calendário (SE → mês) — para agrupar semanas em meses
const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function calcMesesPorAno(semanaAno: SemanaAnoMunicipio): { mes: string; [ano: string]: number | string }[] {
  // Agrupa casos por mês usando os índices das SEs: SE 1-4 ≈ Jan, SE 5-9 ≈ Fev etc.
  // Aproximação simples: cada mês tem ~4-4.5 semanas
  // SE 1-5→Jan, 6-9→Fev, 10-13→Mar, 14-18→Abr, 19-22→Mai, 23-26→Jun,
  //   27-31→Jul, 32-35→Ago, 36-39→Set, 40-44→Out, 45-48→Nov, 49-53→Dez
  const SE_MES = [0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,3,4,4,4,4,5,5,5,5,6,6,6,6,6,7,7,7,7,8,8,8,8,9,9,9,9,9,10,10,10,10,11,11,11,11,11]
  const anos = ['2022','2023','2024','2025']
  const result: { mes: string; [ano: string]: number | string }[] = MESES_ABREV.map(m => ({ mes: m }))

  for (const se of semanaAno.por_semana) {
    const mesIdx = SE_MES[se.semana - 1] ?? 11
    for (const ano of anos) {
      const val = se[ano] as number ?? 0
      const atual = (result[mesIdx][ano] as number) ?? 0
      result[mesIdx][ano] = atual + val
    }
  }
  return result
}

function AbaSazonalidade({ dados }: { dados: DadosDengue }) {
  const { sazonalidade, semana_atual, semana_por_ano_nacional, semana_por_ano_municipio } = dados

  if (!sazonalidade) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>Dados de sazonalidade não disponíveis.</div>
  }

  const semMax = Math.max(...sazonalidade.por_semana.map(s => s.casos_historicos), 1)

  const customTooltipSem = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
    if (!active || !payload?.length) return null
    const sem = sazonalidade.por_semana.find(s => s.semana === parseInt(String(label ?? '')))
    const datas = sem ? dataRange(sem.datas_2026.inicio, sem.datas_2026.fim) : ''
    return (
      <div style={{ background: 'var(--bg-modal)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>SE {label}/{semana_atual?.ano ?? 2026}</div>
        {datas && <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{datas}</div>}
        <div style={{ color: 'var(--accent)' }}>Casos históricos: <strong>{fmt(payload[0].value)}</strong></div>
        <div style={{ color: 'var(--text-muted)' }}>{sazonalidade.por_semana.find(s => s.semana === parseInt(String(label ?? '')))?.pct_do_total.toFixed(1)}% do total</div>
      </div>
    )
  }

  const semanaAtualNum = semana_atual?.semana ?? null

  // Destaque: semanas com casos > 1.5x média
  const mediaSem = semMax / sazonalidade.por_semana.length
  const areaData = sazonalidade.por_semana.map(s => ({
    semana: s.semana,
    casos: s.casos_historicos,
    pct: s.pct_do_total,
    destaque: s.casos_historicos > mediaSem * 1.5,
  }))

  // Mudança 5 — dados mensais por ano (municipal preferencial, fallback nacional)
  const semanaAnoMensal: SemanaAnoMunicipio | null =
    semana_por_ano_municipio ??
    (semana_por_ano_nacional
      ? { ...semana_por_ano_nacional, anos_disponiveis: semana_por_ano_nacional._meta.anos_disponiveis }
      : null)
  const dadosMensais = semanaAnoMensal ? calcMesesPorAno(semanaAnoMensal) : null
  const isMensalNacional = !semana_por_ano_municipio && !!semana_por_ano_nacional
  const CORES_BARRAS: Record<string, string> = {
    '2022': '#94a3b8',
    '2023': '#60a5fa',
    '2024': '#f59e0b',
    '2025': '#ef4444',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.3s ease' }}>
      {/* Mudança 5 — Barras agrupadas por mês e ano */}
      {dadosMensais && (
        <div className="card-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              Casos por Mês e Ano — {isMensalNacional ? 'Brasil' : dados.historico.nome} (2022–2025)
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {Object.entries(CORES_BARRAS).map(([ano, cor]) => (
                <span key={ano} style={{ fontSize: 11, color: cor, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: cor, display: 'inline-block' }} />
                  {ano}
                </span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dadosMensais} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%" barGap={2}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 2" />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
              <RTooltip content={<TooltipBox />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              {Object.entries(CORES_BARRAS).map(([ano, cor]) => (
                <Bar key={ano} dataKey={ano} name={ano} fill={cor} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
            {isMensalNacional
              ? 'Casos nacionais (Brasil) agrupados por mês estimado a partir das semanas epidemiológicas. Fonte: SINAN.'
              : `Casos de ${dados.historico.nome} agrupados por mês estimado a partir das semanas epidemiológicas. Fonte: SINAN.`}
          </div>
        </div>
      )}

      {/* Nota */}
      <div style={{ background: 'var(--info-subtle)', border: '1px solid var(--info)40', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--info)' }}>Padrão histórico acumulado</strong> — os dados representam o somatório de todos os anos disponíveis.
        Os valores mostram <em>em qual semana/mês historicamente ocorrem mais casos</em>, não um ano específico.
      </div>

      {/* Gráfico semanal */}
      <div className="card-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Sazonalidade Semanal (acumulado histórico)</div>
          {semana_atual && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Linha vertical = SE {semana_atual.semana}/{semana_atual.ano}
            </div>
          )}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={areaData} margin={{ top: 22, right: 24, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="gradSazon" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="4 2" />
            <XAxis dataKey="semana" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
              tickFormatter={v => v % 5 === 0 ? String(v) : ''} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
            <RTooltip content={customTooltipSem as any} />
            {semanaAtualNum && (
              <ReferenceLine x={semanaAtualNum} stroke="var(--danger)" strokeWidth={1.5}
                label={{ value: `SE ${semanaAtualNum}`, position: 'top', fontSize: 10, fill: 'var(--danger)' }} />
            )}
            <ReferenceLine x={sazonalidade.semana_pico_historica} stroke="var(--warning)" strokeDasharray="3 2"
              label={{ value: 'pico hist.', position: 'insideTopLeft', fontSize: 9, fill: 'var(--warning)' }} />
            <Area type="monotone" dataKey="casos" name="Casos históricos" stroke="var(--accent)" strokeWidth={2} fill="url(#gradSazon)" />
          </AreaChart>
        </ResponsiveContainer>

        {/* Legenda contextual */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
          Semana de pico histórico: <strong style={{ color: 'var(--text-secondary)' }}>SE {sazonalidade.semana_pico_historica}</strong>
          {sazonalidade.datas_semana_pico_2026.inicio && (
            <> ({dataRange(sazonalidade.datas_semana_pico_2026.inicio, sazonalidade.datas_semana_pico_2026.fim)})</>
          )}
          {' · '}Meses críticos: <strong style={{ color: 'var(--warning)' }}>{sazonalidade.meses_criticos.join(', ')}</strong>
          {' · '}Jan–Jun: <strong style={{ color: 'var(--text-secondary)' }}>{sazonalidade.pct_jan_jun}% dos casos históricos</strong>
        </div>
      </div>

      {/* Gráfico mensal — barras horizontais com CSS */}
      <div className="card-section">
        <div className="section-title">Sazonalidade Mensal (acumulado histórico)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {sazonalidade.por_mes.map(m => {
            const isCritico = sazonalidade.meses_criticos.includes(m.mes)
            const barW = `${Math.min(m.pct_do_total * 3.2, 100)}%`
            const corBarra = m.pct_do_total > 15 ? 'var(--danger)' : m.pct_do_total > 8 ? 'var(--warning)' : 'var(--chart-blue)'
            return (
              <div key={m.mes} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 52px', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: isCritico ? 'var(--warning)' : 'var(--text-muted)', fontWeight: isCritico ? 600 : 400 }}>
                  {m.mes}{isCritico ? ' ⚑' : ''}
                </span>
                <div style={{ height: 14, background: 'var(--bg-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: barW, background: corBarra, borderRadius: 3, transition: 'width 0.8s ease' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>{m.pct_do_total.toFixed(1)}%</span>
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10 }}>
          ⚑ Meses com &gt;10% dos casos históricos
        </div>
      </div>
    </div>
  )
}

// ─── Toggle helper ────────────────────────────────────────────────────────────

type ModoComparar = 'historico' | 'comparar'

function ModoToggle({ modo, onChange }: { modo: ModoComparar; onChange: (m: ModoComparar) => void }) {
  return (
    <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
      {(['historico', 'comparar'] as const).map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          style={{
            fontSize: 10, padding: '2px 9px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${modo === m ? 'var(--accent)' : 'var(--border-input)'}`,
            background: modo === m ? 'var(--accent-subtle)' : 'transparent',
            color: modo === m ? 'var(--accent)' : 'var(--text-muted)',
            transition: 'all 0.12s',
          }}
        >
          {m === 'historico' ? 'Acumulado histórico' : 'Comparar por ano'}
        </button>
      ))}
    </div>
  )
}

// ─── Aba 4: Perfil dos Casos ──────────────────────────────────────────────────

function AbaPerfil({ dados }: { dados: DadosDengue }) {
  const { perfil, benchmarks, historico, perfil_anual } = dados

  const [modoClass,  setModoClass]  = useState<ModoComparar>('historico')
  const [modoLetal,  setModoLetal]  = useState<ModoComparar>('historico')
  const [modoHosp,   setModoHosp]   = useState<ModoComparar>('historico')
  const [modoFaixa,  setModoFaixa]  = useState<ModoComparar>('historico')
  const [modoSexo,   setModoSexo]   = useState<ModoComparar>('historico')

  if (!perfil) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>Dados de perfil não disponíveis.</div>
  }

  const { classificacao, evolucao, hospitalizacao, faixa_etaria, sexo } = perfil
  const hospBR = benchmarks.taxa_hospitalizacao_brasil_media ?? benchmarks.taxa_hospitalizacao_sp_media ?? 0
  const letalBR = benchmarks.taxa_letalidade_brasil_media ?? benchmarks.taxa_letalidade_sp_media ?? 0

  const hospCor =
    hospitalizacao.taxa_hospitalizacao < hospBR * 0.9 ? 'var(--success)' :
    hospitalizacao.taxa_hospitalizacao > hospBR * 1.1 ? 'var(--warning)' : 'var(--chart-blue)'

  const faixaOrdem: { key: keyof Omit<typeof faixa_etaria, 'faixa_dominante' | 'faixa_dominante_label'>; label: string }[] = [
    { key: 'crianca',      label: 'Crianças (0–9)' },
    { key: 'adolescente',  label: 'Adolescentes (10–19)' },
    { key: 'adulto_jovem', label: 'Adultos jovens (20–39)' },
    { key: 'adulto',       label: 'Adultos (40–59)' },
    { key: 'idoso',        label: 'Idosos (60+)' },
  ]

  const sexoMaior = sexo.masculino.pct >= 50 ? 'masculina' : 'feminina'

  // Anos disponíveis no perfil_anual (excluindo 2026 parcial)
  const anosAnual = perfil_anual
    ? ANOS_ANUAL_EXIB.filter(a => perfil_anual.por_ano[a])
    : []
  const temAnual = anosAnual.length > 0

  // Helpers para montar series de linha/barra por ano
  const hospAnualData = anosAnual.map(ano => ({
    ano,
    taxa: perfil_anual!.por_ano[ano]!.hospitalizacao?.taxa_hospitalizacao ?? 0,
  }))
  const letalAnualData = anosAnual.map(ano => ({
    ano,
    taxa: perfil_anual!.por_ano[ano]!.evolucao?.taxa_letalidade ?? 0,
  }))
  const classAnualData = anosAnual.map(ano => {
    const c = perfil_anual!.por_ano[ano]!.classificacao
    return { ano, alarme: c?.sinais_alarme?.pct ?? 0, grave: c?.grave?.pct ?? 0 }
  })
  const faixaAnualData = faixaOrdem.map(({ key, label }) => {
    const row: Record<string, string | number> = { faixa: label }
    for (const ano of anosAnual) {
      row[ano] = (perfil_anual!.por_ano[ano]!.faixa_etaria as Record<string, QtdPct>)[key]?.pct ?? 0
    }
    return row
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, animation: 'fadeIn 0.3s ease' }}>

      {/* Coluna 1 — Gravidade */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Classificação dos casos */}
        <div className="card-section">
          <div className="section-title" style={{ marginBottom: 6 }}>Classificação dos Casos</div>
          {temAnual && <ModoToggle modo={modoClass} onChange={setModoClass} />}

          {modoClass === 'historico' ? (
            <>
              {[
                { label: 'Dengue simples',   valor: classificacao.dengue_simples, cor: 'var(--success)' },
                { label: 'Sinais de alarme', valor: classificacao.sinais_alarme,  cor: 'var(--warning)' },
                { label: 'Dengue grave',     valor: classificacao.grave,          cor: 'var(--danger)' },
                { label: 'Inconclusivo',     valor: classificacao.inconclusivo,   cor: 'var(--chart-slate)' },
              ].map(({ label, valor, cor }) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    <span>{label}</span>
                    <span style={{ fontWeight: 600 }}>{fmtP(valor.pct)} <span style={{ color: 'var(--text-dim)' }}>({fmt(valor.qtd)})</span></span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(valor.pct, 100)}%`, background: cor, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                Dengue com sinais de alarme indica casos que exigiram acompanhamento intensivo.
              </div>
            </>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={classAnualData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="4 2" />
                  <XAxis dataKey="ano" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${v.toFixed(0)}%`} />
                  <RTooltip content={<TooltipBox />} />
                  <Line dataKey="alarme" name="Sinais de alarme %" stroke="var(--warning)" strokeWidth={2} dot={{ r: 3 }} />
                  <Line dataKey="grave"  name="Dengue grave %"    stroke="var(--danger)"  strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
              {(() => {
                const d25 = classAnualData.find(d => d.ano === '2025')
                const d24 = classAnualData.find(d => d.ano === '2024')
                if (!d25 || !d24) return null
                const varAlarme = (d25.alarme - d24.alarme).toFixed(1)
                const sinal = parseFloat(varAlarme) >= 0 ? '+' : ''
                return (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg-surface-2)', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Em 2025, sinais de alarme: <strong>{d25.alarme.toFixed(1)}%</strong> · dengue grave: <strong>{d25.grave.toFixed(1)}%</strong>.
                    {' '}Variação alarme 2024→2025: <strong style={{ color: parseFloat(varAlarme) > 0 ? 'var(--danger)' : 'var(--success)' }}>{sinal}{varAlarme}pp</strong>.
                  </div>
                )
              })()}
            </>
          )}
        </div>

        {/* Taxa de Letalidade */}
        <div className="card-section">
          <div className="section-title" style={{ marginBottom: 6 }}>Taxa de Letalidade</div>
          {temAnual && <ModoToggle modo={modoLetal} onChange={setModoLetal} />}

          {modoLetal === 'historico' ? (
            evolucao.obito_dengue.qtd === 0
              ? <div className="kpi-badge" style={{ background: 'var(--success-subtle)', color: 'var(--success)', display: 'inline-block', fontSize: 12, padding: '6px 10px' }}>
                  Nenhum óbito registrado
                </div>
              : <>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--danger)', marginBottom: 4 }}>
                    {evolucao.taxa_letalidade.toFixed(3)}%
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {fmt(evolucao.obito_dengue.qtd)} óbitos por dengue
                    {evolucao.obito_outra_causa.qtd > 0 && ` · ${fmt(evolucao.obito_outra_causa.qtd)} por outra causa`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    Média BR: {letalBR.toFixed(3)}%
                  </div>
                </>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={letalAnualData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="4 2" />
                  <XAxis dataKey="ano" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${v.toFixed(2)}%`} />
                  <RTooltip content={<TooltipBox />} />
                  <Line dataKey="taxa" name="Letalidade %" stroke="var(--danger)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
              {perfil_anual?.ano_maior_letalidade && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                  Maior letalidade: <strong style={{ color: 'var(--text-secondary)' }}>{perfil_anual.ano_maior_letalidade}</strong>
                  {perfil_anual.variacao_letalidade_2425_pp !== null && (
                    <> · Variação 2024→2025: <strong style={{ color: (perfil_anual.variacao_letalidade_2425_pp ?? 0) > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {(perfil_anual.variacao_letalidade_2425_pp ?? 0) >= 0 ? '+' : ''}{perfil_anual.variacao_letalidade_2425_pp?.toFixed(3)}pp
                    </strong></>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Coluna 2 — Hospitalização */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card-section">
          <div className="section-title" style={{ marginBottom: 6 }}>Hospitalização</div>
          {temAnual && <ModoToggle modo={modoHosp} onChange={setModoHosp} />}

          {modoHosp === 'historico' ? (
            <>
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: hospCor }}>{fmtP(hospitalizacao.taxa_hospitalizacao, 1)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>dos casos precisaram de internação</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{fmt(hospitalizacao.sim.qtd)} hospitalizações registradas</div>
              </div>
              <div style={{ height: 18, borderRadius: 9, overflow: 'hidden', background: 'var(--bg-surface-2)', display: 'flex', marginTop: 8 }}>
                <div style={{ height: '100%', width: `${hospitalizacao.sim.pct}%`, background: hospCor, transition: 'width 0.8s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                <span>Hospitalizados {fmtP(hospitalizacao.sim.pct)}</span>
                <span>Não hospitalizados {fmtP(hospitalizacao.nao.pct)}</span>
              </div>
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-surface-2)', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Para cada 100 casos notificados,{' '}
                <strong style={{ color: hospCor }}>{hospitalizacao.taxa_hospitalizacao.toFixed(1)}</strong> precisaram de internação.
                {' '}Média BR: <strong>{fmtP(hospBR, 1)}</strong>
              </div>
            </>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={hospAnualData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="4 2" />
                  <XAxis dataKey="ano" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${v.toFixed(0)}%`} />
                  <RTooltip content={<TooltipBox />} />
                  <ReferenceLine y={hospBR} stroke="var(--chart-slate)" strokeDasharray="3 2"
                    label={{ value: 'média BR', position: 'insideTopRight', fontSize: 9, fill: 'var(--text-dim)' }} />
                  <Line dataKey="taxa" name="Taxa hosp. %" stroke="var(--chart-blue)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--chart-blue)' }} />
                </LineChart>
              </ResponsiveContainer>
              {(() => {
                const d25 = hospAnualData.find(d => d.ano === '2025')
                const d24 = hospAnualData.find(d => d.ano === '2024')
                if (!d25) return null
                const varPP = d24 ? (d25.taxa - d24.taxa) : null
                return (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg-surface-2)', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Taxa 2025: <strong>{d25.taxa.toFixed(1)}%</strong> · Média BR: <strong>{hospBR.toFixed(1)}%</strong>
                    {varPP !== null && (
                      <> · 2024→2025: <strong style={{ color: varPP > 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {varPP >= 0 ? '+' : ''}{varPP.toFixed(1)}pp
                      </strong></>
                    )}
                    {perfil_anual?.ano_maior_hospitalizacao && (
                      <> · Pico: <strong>{perfil_anual.ano_maior_hospitalizacao}</strong></>
                    )}
                  </div>
                )
              })()}
            </>
          )}
        </div>
      </div>

      {/* Coluna 3 — Perfil dos Pacientes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Faixa Etária */}
        <div className="card-section">
          <div className="section-title" style={{ marginBottom: 6 }}>Faixa Etária</div>
          {temAnual && <ModoToggle modo={modoFaixa} onChange={setModoFaixa} />}

          {modoFaixa === 'historico' ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
                {faixaOrdem.map(({ key, label }) => {
                  const item = faixa_etaria[key] as QtdPct
                  const isDominante = key === faixa_etaria.faixa_dominante
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: isDominante ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isDominante ? 600 : 400 }}>
                          {label}{isDominante ? ' ★' : ''}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: isDominante ? 600 : 400 }}>{fmtP(item.pct)}</span>
                      </div>
                      <div style={{ height: 7, background: 'var(--bg-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(item.pct, 100)}%`, background: isDominante ? 'var(--accent)' : 'var(--chart-blue)', borderRadius: 3 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                ★ Faixa dominante: {faixa_etaria.faixa_dominante_label} ({fmtP((faixa_etaria[faixa_etaria.faixa_dominante as keyof typeof faixa_etaria] as QtdPct).pct)})
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {anosAnual.map(ano => (
                  <span key={ano} style={{ fontSize: 10, color: CORES_ANUAL[ano], display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: CORES_ANUAL[ano], display: 'inline-block' }} />
                    {ano}
                  </span>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={faixaAnualData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="15%" barGap={1}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 2" />
                  <XAxis dataKey="faixa" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                    tickFormatter={v => v.split(' ')[0]} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${v.toFixed(0)}%`} />
                  <RTooltip content={<TooltipBox />} />
                  {anosAnual.map(ano => (
                    <Bar key={ano} dataKey={ano} name={ano} fill={CORES_ANUAL[ano]} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              {(() => {
                const dom25 = perfil_anual?.por_ano['2025']?.faixa_etaria?.faixa_dominante
                const dom24 = perfil_anual?.por_ano['2024']?.faixa_etaria?.faixa_dominante
                if (!dom25) return null
                return (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    Faixa dominante 2025: <strong style={{ color: 'var(--text-secondary)' }}>{dom25}</strong>
                    {dom24 && dom24 !== dom25 && <> · 2024: <strong>{dom24}</strong></>}
                    {perfil_anual?.variacao_idosos_2425_pp !== null && perfil_anual?.variacao_idosos_2425_pp !== undefined && (
                      <> · Idosos 2024→2025: <strong style={{ color: (perfil_anual.variacao_idosos_2425_pp) > 0 ? 'var(--warning)' : 'var(--success)' }}>
                        {perfil_anual.variacao_idosos_2425_pp >= 0 ? '+' : ''}{perfil_anual.variacao_idosos_2425_pp.toFixed(1)}pp
                      </strong></>
                    )}
                  </div>
                )
              })()}
            </>
          )}
        </div>

        {/* Distribuição por Sexo */}
        <div className="card-section">
          <div className="section-title" style={{ marginBottom: 6 }}>Distribuição por Sexo</div>
          {temAnual && <ModoToggle modo={modoSexo} onChange={setModoSexo} />}

          {modoSexo === 'historico' ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {[
                { label: 'Masculino', item: sexo.masculino, cor: 'var(--chart-blue)' },
                { label: 'Feminino',  item: sexo.feminino,  cor: 'var(--chart-purple)' },
              ].map(({ label, item, cor }) => (
                <div key={label} style={{ flex: 1, textAlign: 'center', padding: '10px 8px', background: 'var(--bg-surface-2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: cor }}>{fmtP(item.pct)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{fmt(item.qtd)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 4, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    {['Ano','Masc. %','Fem. %','Total'].map(h => (
                      <th key={h} style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {anosAnual.map(ano => {
                    const s = perfil_anual!.por_ano[ano]!.sexo
                    if (!s) return null
                    const total = (s.masculino?.qtd ?? 0) + (s.feminino?.qtd ?? 0)
                    return (
                      <tr key={ano} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '4px 6px', color: CORES_ANUAL[ano], fontWeight: 700 }}>{ano}</td>
                        <td style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--chart-blue)' }}>{(s.masculino?.pct ?? 0).toFixed(1)}%</td>
                        <td style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--chart-purple)' }}>{(s.feminino?.pct ?? 0).toFixed(1)}%</td>
                        <td style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--text-secondary)' }}>{fmt(total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Orientação de campanha */}
        <div style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Os grupos prioritários para prevenção em <strong style={{ color: 'var(--text-primary)' }}>{historico.nome}</strong> são{' '}
          <strong>{faixa_etaria.faixa_dominante_label}</strong>{' '}
          ({fmtP((faixa_etaria[faixa_etaria.faixa_dominante as keyof typeof faixa_etaria] as QtdPct).pct)} dos casos),
          com leve predominância <strong>{sexoMaior}</strong>{' '}
          ({fmtP(sexoMaior === 'feminina' ? sexo.feminino.pct : sexo.masculino.pct)}).
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal (Inner) ─────────────────────────────────────────────

function VigilanciaDeingueInner() {
  const searchParams = useSearchParams()

  const [activeTab, setActiveTab] = useState<string>(() => {
    const t = searchParams.get('tab')
    return TABS.find(x => x.id === t) ? t! : 'geral'
  })

  const [dados,   setDados]   = useState<DadosDengue | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState<string | null>(null)
  const [perfil,  setPerfil]  = useState<{ ibge: string; nome: string } | null>(null)


  const fetchDados = useCallback(async (ibge: string) => {
    setLoading(true)
    setErro(null)
    try {
      const res = await fetch(`/api/sinan/dengue/municipio?ibge=${ibge}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Erro ao carregar dados.')
      }
      const json = await res.json()
      setDados(json as DadosDengue)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { setErro('Sessão não encontrada.'); setLoading(false); return }
        const res  = await fetch(`/api/admin/usuarios/${session.user.id}`)
        const data = await res.json()
        const mun  = data?.municipios as { id: string; nome: string; codigo_ibge: string } | null
        if (mun?.codigo_ibge) {
          const ibge6 = String(mun.codigo_ibge).slice(0, 6)
          setPerfil({ ibge: ibge6, nome: mun.nome })
          await fetchDados(ibge6)
        } else {
          setErro('Nenhum município ativo. Configure seu perfil.')
          setLoading(false)
        }
      } catch {
        setErro('Erro ao carregar perfil do usuário.')
        setLoading(false)
      }
    }
    init()
  }, [fetchDados])

  // ── Loading ──
  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        Carregando dados de vigilância…
      </div>
    )
  }

  // ── Erro ──
  if (erro || !dados) {
    return (
      <div style={{ minHeight: '40vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <div style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 14 }}>{erro ?? 'Dados não disponíveis.'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Verifique se o município ativo está configurado e se o processamento foi executado.</div>
      </div>
    )
  }

  const semAtual  = dados.semana_atual
  const badgeSem  = semAtual ? badgeInfo(semAtual.badge_tipo) : null
  const nomeLocal = perfil?.nome ?? dados.historico.nome

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        .kpi-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .kpi-label { font-size: 11px; color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
        .kpi-value { font-size: 26px; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
        .kpi-sub   { font-size: 12px; color: var(--text-secondary); }
        .kpi-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; margin-top: 4px; display: inline-block; }
        .card-section {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
        }
        .section-title { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
      `}</style>

      <div className="page-container" style={{ paddingBottom: 32 }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>
                Vigilância — Dengue
              </h1>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                {nomeLocal} · SP · SINAN
              </div>
            </div>

            {/* Badge semana atual */}
            {semAtual && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  SE {semAtual.semana}/{semAtual.ano} · {dataRange(semAtual.inicio, semAtual.fim)}
                </div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: badgeSem!.bg, color: badgeSem!.color,
                  border: `1px solid ${badgeSem!.color}40`,
                  borderRadius: 20, padding: '3px 12px',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.03em',
                }}>
                  {badgeSem!.texto}
                </div>
              </div>
            )}
          </div>

          {/* Linha separadora */}
          <div style={{ height: 1, background: 'var(--border)', margin: '12px 0 0' }} />
        </div>

        {/* ── Tabs ── */}
        <div style={{ marginBottom: 24 }}>
          <TabNavigation tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
        </div>

        {/* ── Conteúdo das abas ── */}
        {activeTab === 'geral'     && <AbaVisaoGeral   dados={dados} />}
        {activeTab === 'tendencia' && <AbaTendencia    dados={dados} />}
        {activeTab === 'sazon'     && <AbaSazonalidade dados={dados} />}
        {activeTab === 'perfil'    && <AbaPerfil       dados={dados} />}
      </div>
    </>
  )
}

// ─── Export com Suspense ──────────────────────────────────────────────────────

export default function VigilanciaDeinguePage() {
  return (
    <Suspense fallback={
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        Carregando…
      </div>
    }>
      <VigilanciaDeingueInner />
    </Suspense>
  )
}
