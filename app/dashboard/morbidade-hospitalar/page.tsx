'use client'

// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/morbidade-hospitalar/page.tsx
// Módulo SIH/SUS — Morbidade Hospitalar — SP
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface MesSerie { mes: string; internacoes: number }
interface SerieMensal {
  por_mes: MesSerie[]
  acumulado_2022: number; acumulado_2023: number
  acumulado_2024: number; acumulado_2025: number
  var_2223_pct: number | null; var_2324_pct: number | null; var_2425_pct: number | null
  media_mensal_2025: number; pico_mes: string; vale_mes: string
}

interface PorCID {
  cid: string; nome: string
  internacoes_local: number; pct_total: number
  obitos_local: number; tx_mortalidade_local: number
  dias_total: number; permanencia_media: number; flag_longa_permanencia: boolean
  valor_total: number; custo_medio: number
  internacoes_residentes: number; obitos_residentes: number
  tx_mortalidade_residentes: number
  pacientes_externos: number; pct_externos: number
}

interface FaixaItem { faixa: string; qtd: number; pct: number }
interface FaixaEtaria { local_internacao: FaixaItem[]; residencia: FaixaItem[] }

interface Carater {
  eletivo:  { qtd: number; pct: number }
  urgencia: { qtd: number; pct: number }
  acidente: { qtd: number; pct: number }
  total: number
}

interface FluxoCID {
  cid: string; nome: string
  internacoes_local: number; internacoes_residentes: number
  pacientes_externos: number; pct_externos: number
}
interface Fluxo {
  total_internacoes_local: number; total_internacoes_residentes: number
  pacientes_externos_abs: number; pct_externos: number
  eh_polo_receptor: boolean; por_cid: FluxoCID[]
}

interface PerfilMunicipio {
  ibge: string; nome: string
  total_internacoes: number; total_obitos: number; total_valor: number; total_dias: number
  tx_mortalidade_geral: number; custo_medio_geral: number; permanencia_media_geral: number
  pct_externos: number; eh_polo_receptor: boolean
  perfil_tags: string[]; cid_principal: string; cid_maior_mortalidade: string
  codigo_cir: string | null; nome_cir: string | null
  ranking_internacoes_sp: number; quartil_mortalidade: number
}

interface DadosMunicipio {
  ibge: string
  serie: SerieMensal
  por_cid: PorCID[]
  faixa_etaria: FaixaEtaria
  carater: Carater
  fluxo: Fluxo
  perfil: PerfilMunicipio
}

interface Benchmarks {
  tx_mortalidade:    { media: number; mediana: number; p25: number; p75: number; p90: number }
  custo_medio:       { media: number; mediana: number; p25: number; p75: number }
  permanencia_media: { media: number; mediana: number; p75: number }
  pct_externos:      { media: number; mediana: number; p75: number }
  total_municipios_analisados: number
}

interface CirEntry {
  codigo_cir: string; nome_cir: string
  internacoes_por_ano: Record<string, number>
}

type Perspectiva = 'local' | 'residencia'

// ── Mapa CID ──────────────────────────────────────────────────────────────────

const CAP_NOMES: Record<string, string> = {
  'Cap 01': 'Infecciosas e Parasitárias',
  'Cap 02': 'Neoplasias (Câncer)',
  'Cap 03': 'Sangue e Imunidade',
  'Cap 04': 'Endócrinas e Nutricionais',
  'Cap 05': 'Transtornos Mentais',
  'Cap 06': 'Sistema Nervoso',
  'Cap 07': 'Olho e Anexos',
  'Cap 08': 'Ouvido',
  'Cap 09': 'Ap. Circulatório',
  'Cap 10': 'Ap. Respiratório',
  'Cap 11': 'Ap. Digestivo',
  'Cap 12': 'Doenças da Pele',
  'Cap 13': 'Músculo-esqueléticas',
  'Cap 14': 'Ap. Genitourinário',
  'Cap 15': 'Gravidez e Parto',
  'Cap 16': 'Afecções Perinatais',
  'Cap 17': 'Malformações',
  'Cap 18': 'Sintomas Inespecíficos',
  'Cap 19': 'Lesões e Causas Externas',
  'Cap 21': 'Contatos c/ Serviços',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt   = (n: number) => n.toLocaleString('pt-BR')
const fmtR  = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtPct = (n: number) => `${n.toFixed(1)}%`

function VarBadge({ v }: { v: number | null }) {
  if (v === null) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
  const pos = v >= 0
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
      background: pos ? 'var(--accent-subtle)' : 'rgba(239,68,68,0.12)',
      color: pos ? 'var(--accent)' : 'var(--danger)',
    }}>
      {pos ? '▲' : '▼'} {Math.abs(v).toFixed(1)}%
    </span>
  )
}

function Skeleton({ h = 20, w = '100%', r = 6 }: { h?: number; w?: string | number; r?: number }) {
  return <div style={{ height: h, width: w, borderRadius: r, background: 'var(--bg-surface-2)', animation: 'pulse 1.4s ease-in-out infinite' }} />
}

function CardShell({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
      borderRadius: 16, padding: '20px 24px', display: 'flex',
      flexDirection: 'column', gap: 12, ...style,
    }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>{title}</p>
      {children}
    </div>
  )
}

function MortColor(tx: number, bench: Benchmarks) {
  const { mediana, p75 } = bench.tx_mortalidade
  if (tx <= mediana) return 'var(--accent)'
  if (tx <= p75)     return '#F59E0B'
  return 'var(--danger)'
}

// ── C1: SihKPIs ──────────────────────────────────────────────────────────────

function SihKPIs({ dados, benchmarks }: { dados: DadosMunicipio; benchmarks: Benchmarks }) {
  const { perfil, serie, fluxo } = dados
  const bench = benchmarks.tx_mortalidade
  const tx = perfil.tx_mortalidade_geral

  let mortLabel = 'Dentro da média SP'
  let mortColor = 'var(--accent)'
  if (tx > bench.p75) { mortLabel = 'Bem acima da média SP'; mortColor = 'var(--danger)' }
  else if (tx > bench.mediana) { mortLabel = 'Acima da média SP'; mortColor = '#F59E0B' }

  const isPolo = fluxo.pct_externos > 15

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      {/* Card 1 — Volume */}
      <CardShell title="Total de Internações">
        <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1, margin: 0 }}>
          {fmt(perfil.total_internacoes)}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <VarBadge v={serie.var_2425_pct} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>vs 2024</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          {fmt(serie.acumulado_2025)} internações em 2025 · média {fmt(serie.media_mensal_2025)}/mês
        </p>
      </CardShell>

      {/* Card 2 — Perfil */}
      <CardShell title="Perfil Assistencial">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {perfil.perfil_tags.length > 0
            ? perfil.perfil_tags.map(tag => (
                <span key={tag} style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: 'var(--accent-subtle)', color: 'var(--accent)',
                  border: '1px solid var(--accent-border)',
                }}>{tag}</span>
              ))
            : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem classificação de polo</span>
          }
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          Principal causa: <strong style={{ color: 'var(--text-primary)' }}>{CAP_NOMES[perfil.cid_principal] ?? perfil.cid_principal}</strong>
        </p>
        {isPolo && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            {fmtPct(fluxo.pct_externos)} das internações são de outros municípios
          </p>
        )}
      </CardShell>

      {/* Card 3 — Mortalidade */}
      <CardShell title="Taxa de Mortalidade Hospitalar">
        <p style={{ fontSize: 32, fontWeight: 800, color: mortColor, lineHeight: 1, margin: 0 }}>
          {fmtPct(tx)}
        </p>
        <span style={{
          alignSelf: 'flex-start', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: mortColor === 'var(--accent)' ? 'var(--accent-subtle)' : mortColor === '#F59E0B' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
          color: mortColor,
        }}>{mortLabel}</span>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Mediana SP: {fmtPct(bench.mediana)} · P75: {fmtPct(bench.p75)}
        </p>
        {isPolo && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, fontStyle: 'italic', lineHeight: 1.4 }}>
            Municípios polo tendem a ter mortalidade maior por receberem casos mais graves de toda a região.
          </p>
        )}
      </CardShell>

      {/* Card 4 — Custo */}
      <CardShell title="Custo Médio por Internação">
        <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1, margin: 0 }}>
          {fmtR(perfil.custo_medio_geral)}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Média SP: {fmtR(benchmarks.custo_medio.media)}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <VarBadge v={parseFloat(((perfil.custo_medio_geral - benchmarks.custo_medio.media) / benchmarks.custo_medio.media * 100).toFixed(1))} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>vs média SP</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Permanência média: {perfil.permanencia_media_geral.toFixed(1)} dias
        </p>
      </CardShell>
    </div>
  )
}

// ── C4: SihEvolucaoTemporal ───────────────────────────────────────────────────

const ANOS = ['2022', '2023', '2024', '2025'] as const
type Ano = typeof ANOS[number]

function SihEvolucaoTemporal({
  dados, cirEvolucao, isMobile,
}: {
  dados: DadosMunicipio; cirEvolucao: CirEntry[]; isMobile: boolean
}) {
  const { serie, perfil } = dados
  const [periodo, setPeriodo] = useState<Ano | 'todos'>('todos')

  const todosMeses = serie.por_mes
  const mesesFiltrados = periodo === 'todos'
    ? todosMeses
    : todosMeses.filter(m => m.mes.startsWith(periodo))

  const media = mesesFiltrados.length
    ? Math.round(mesesFiltrados.reduce((s, m) => s + m.internacoes, 0) / mesesFiltrados.length)
    : 0

  const picoIdx = mesesFiltrados.reduce((best, m, i) =>
    m.internacoes > mesesFiltrados[best].internacoes ? i : best, 0)
  const valeIdx = mesesFiltrados.reduce((best, m, i) =>
    m.internacoes < mesesFiltrados[best].internacoes ? i : best, 0)

  const chartData = mesesFiltrados.map((m, i) => ({
    ...m,
    isPico: i === picoIdx,
    isVale: i === valeIdx,
    media,
  }))

  // CIR da região do município ativo
  const cirEntry = perfil.codigo_cir
    ? cirEvolucao.find(c => c.codigo_cir === perfil.codigo_cir)
    : null

  const cirData = cirEntry
    ? ANOS.map(ano => ({ ano, internacoes: cirEntry.internacoes_por_ano[ano] ?? 0 }))
    : []

  const varCards: { label: string; v: number | null }[] = [
    { label: '2022→2023', v: serie.var_2223_pct },
    { label: '2023→2024', v: serie.var_2324_pct },
    { label: '2024→2025', v: serie.var_2425_pct },
  ]

  const formatMes = (m: string) => {
    const [, mes] = m.split('/')
    return mes ?? m
  }

  const CustomDot = (props: {
    cx?: number; cy?: number; index?: number;
    payload?: { isPico: boolean; isVale: boolean }
  }) => {
    const { cx, cy, payload } = props
    if (!payload || (!payload.isPico && !payload.isVale)) return null
    const isPico = payload.isPico
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill={isPico ? 'var(--accent)' : 'var(--danger)'} />
        <text x={cx} y={(cy ?? 0) - 10} textAnchor="middle" fontSize={10}
          fill={isPico ? 'var(--accent)' : 'var(--danger)'}>
          {isPico ? '★' : '▼'}
        </text>
      </g>
    )
  }

  return (
    <CardShell title="Evolução das Internações">
      {/* Controles de período */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['todos', '2022', '2023', '2024', '2025'] as const).map(p => (
          <button key={p} onClick={() => setPeriodo(p as Ano | 'todos')}
            style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
              border: '1px solid',
              borderColor: periodo === p ? 'var(--accent)' : 'var(--border-subtle)',
              background: periodo === p ? 'var(--accent-subtle)' : 'transparent',
              color: periodo === p ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: periodo === p ? 700 : 400,
            }}>
            {p === 'todos' ? 'Todo o histórico' : p}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: 24, alignItems: 'start' }}>
        {/* Gráfico principal */}
        <div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSih" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="mes" tickFormatter={formatMes} tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                interval={periodo === 'todos' ? 5 : 1} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={52}
                tickFormatter={v => fmt(v)} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
                formatter={(v: unknown) => [fmt(v as number), 'Internações']}
              />
              <ReferenceLine y={media} stroke="var(--text-muted)" strokeDasharray="4 4"
                label={{ value: 'Média', position: 'insideTopRight', fontSize: 10, fill: 'var(--text-muted)' }} />
              <Area type="monotone" dataKey="internacoes" stroke="var(--accent)" strokeWidth={2}
                fill="url(#gradSih)" dot={<CustomDot />} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Cards de variação anual + CIR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 150 }}>
          {varCards.map(({ label, v }) => (
            <div key={label} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 10, padding: '8px 14px',
            }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px' }}>{label}</p>
              <VarBadge v={v} />
            </div>
          ))}

          {cirEntry && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', fontWeight: 600 }}>
                CIR {cirEntry.nome_cir}
              </p>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={cirData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <Bar dataKey="internacoes" fill="var(--accent)" opacity={0.6} radius={[3, 3, 0, 0]} />
                  <XAxis dataKey="ano" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 11 }}
                    formatter={(v: unknown) => [fmt(v as number), 'Internações CIR']}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Narrativa */}
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
        Em 2025, <strong>{perfil.nome}</strong> registrou <strong>{fmt(serie.acumulado_2025)}</strong> internações
        {serie.var_2425_pct !== null && (
          <> — <strong style={{ color: serie.var_2425_pct >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
            {serie.var_2425_pct >= 0 ? '+' : ''}{serie.var_2425_pct.toFixed(1)}%
          </strong> em relação a 2024</>
        )}.
        {' '}Média mensal: <strong>{fmt(serie.media_mensal_2025)}</strong> internações.
        {' '}Pico: <strong>{serie.pico_mes}</strong>.
      </p>
    </CardShell>
  )
}

// ── C2: SihCausasInternacao ───────────────────────────────────────────────────

type ColunaOrdem = 'internacoes' | 'mortalidade' | 'permanencia' | 'custo' | 'externos'

function SihCausasInternacao({
  dados, perspectiva, isMobile,
}: {
  dados: DadosMunicipio; perspectiva: Perspectiva; isMobile: boolean
}) {
  const { por_cid, perfil } = dados
  const [ordem, setOrdem] = useState<ColunaOrdem>('internacoes')
  const [showAll, setShowAll] = useState(false)

  const isLocal = perspectiva === 'local'
  const isPolo  = perfil.pct_externos > 15

  const sorted = [...por_cid].sort((a, b) => {
    if (ordem === 'internacoes') return (isLocal ? b.internacoes_local : b.internacoes_residentes) - (isLocal ? a.internacoes_local : a.internacoes_residentes)
    if (ordem === 'mortalidade') return (isLocal ? b.tx_mortalidade_local : b.tx_mortalidade_residentes) - (isLocal ? a.tx_mortalidade_local : a.tx_mortalidade_residentes)
    if (ordem === 'permanencia') return b.permanencia_media - a.permanencia_media
    if (ordem === 'custo')       return b.custo_medio - a.custo_medio
    if (ordem === 'externos')    return b.pct_externos - a.pct_externos
    return 0
  })

  const displayed = (isMobile && !showAll) ? sorted.slice(0, 8) : sorted

  const top3 = [...por_cid].sort((a, b) =>
    (isLocal ? b.internacoes_local : b.internacoes_residentes) -
    (isLocal ? a.internacoes_local : a.internacoes_residentes)
  ).slice(0, 3)

  const top3pct = top3.reduce((s, c) => s + (isLocal ? c.pct_total : 0), 0)

  const SortBtn = ({ col, label }: { col: ColunaOrdem; label: string }) => (
    <button onClick={() => setOrdem(col)} style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
      color: ordem === col ? 'var(--accent)' : 'var(--text-muted)',
      fontSize: 11, fontWeight: ordem === col ? 700 : 500,
      display: 'flex', alignItems: 'center', gap: 3,
    }}>
      {label} {ordem === col ? '▼' : ''}
    </button>
  )

  return (
    <CardShell title={isLocal ? 'Causas de Internação — Local de Internação' : 'Causas de Internação — Residência dos Pacientes'}>
      {/* Tabela */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>Causa (CID-10)</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}><SortBtn col="internacoes" label="Intern." /></th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}><SortBtn col="mortalidade" label="Mortalidade" /></th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}><SortBtn col="permanencia" label="Perm. média" /></th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}><SortBtn col="custo" label="Custo médio" /></th>
              {isPolo && <th style={{ textAlign: 'right', padding: '6px 8px' }}><SortBtn col="externos" label="Ext. %" /></th>}
            </tr>
          </thead>
          <tbody>
            {displayed.map((c, i) => {
              const intern = isLocal ? c.internacoes_local : c.internacoes_residentes
              const tx     = isLocal ? c.tx_mortalidade_local : c.tx_mortalidade_residentes
              const isTop3 = i < 3 && ordem === 'internacoes'
              const isMental = c.cid === 'Cap 05'

              return (
                <tr key={c.cid} style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  background: isTop3 ? 'rgba(16,185,129,0.04)' : 'transparent',
                }}>
                  <td style={{ padding: '8px 8px', color: 'var(--text-primary)', fontWeight: isTop3 ? 600 : 400 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 38 }}>{c.cid}</span>
                      <span>{c.nome}</span>
                      {isMental && (
                        <span title="Internações psiquiátricas de longa permanência — a permanência média elevada é característica deste perfil, não anomalia"
                          style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', cursor: 'help', fontWeight: 700 }}>
                          longa perm.
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-primary)' }}>
                    {fmt(intern)}
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>({c.pct_total.toFixed(1)}%)</span>
                  </td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', color: tx > 10 ? 'var(--danger)' : tx > 5 ? '#F59E0B' : 'var(--text-secondary)' }}>
                    {fmtPct(tx)}
                  </td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {isMental
                      ? <span style={{ color: '#F59E0B' }}>{c.permanencia_media.toFixed(0)}d *</span>
                      : `${c.permanencia_media.toFixed(1)}d`}
                  </td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {fmtR(c.custo_medio)}
                  </td>
                  {isPolo && (
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: c.pct_externos > 30 ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {c.pct_externos > 0 ? fmtPct(c.pct_externos) : '—'}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {isMobile && sorted.length > 8 && (
        <button onClick={() => setShowAll(s => !s)} style={{
          alignSelf: 'center', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
          borderRadius: 20, padding: '6px 20px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer',
        }}>
          {showAll ? 'Ver menos' : `Ver todos (${sorted.length})`}
        </button>
      )}

      {/* Notas */}
      {por_cid.some(c => c.cid === 'Cap 05') && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>
          * Cap 05 — Internações psiquiátricas de longa permanência institucionalizada. A permanência média elevada é característica deste perfil, não uma anomalia.
        </p>
      )}

      {/* Narrativa */}
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
        As principais causas de internação em <strong>{perfil.nome}</strong> são{' '}
        <strong>{top3.map(c => c.nome).join(', ')}</strong>,
        que juntas representam <strong>{top3pct.toFixed(1)}%</strong> do total.
        {isPolo && (
          <> {fmtPct(perfil.pct_externos)} das internações são de pacientes de outros municípios,
          com destaque para <strong>{CAP_NOMES[por_cid.reduce((best, c) => c.pct_externos > best.pct_externos ? c : best, por_cid[0]).cid] ?? ''}</strong>.</>
        )}
      </p>
    </CardShell>
  )
}

// ── C3: SihMortalidade ────────────────────────────────────────────────────────

function SihMortalidade({
  dados, benchmarks, perspectiva,
}: {
  dados: DadosMunicipio; benchmarks: Benchmarks; perspectiva: Perspectiva
}) {
  const { por_cid, perfil } = dados
  const [expandido, setExpandido] = useState<string | null>(null)

  const isLocal = perspectiva === 'local'
  const bench   = benchmarks.tx_mortalidade

  // Filtra: ≥ 50 internações, exclui Cap 05
  const caps = por_cid
    .filter(c => c.cid !== 'Cap 05' && (isLocal ? c.internacoes_local : c.internacoes_residentes) >= 50)
    .map(c => ({
      ...c,
      tx: isLocal ? c.tx_mortalidade_local : c.tx_mortalidade_residentes,
      intern: isLocal ? c.internacoes_local : c.internacoes_residentes,
    }))
    .sort((a, b) => b.tx - a.tx)

  const cap05 = por_cid.find(c => c.cid === 'Cap 05')

  const maisMortal = caps[0]
  const maisFrecuente = por_cid.reduce((best, c) =>
    (isLocal ? c.internacoes_local : c.internacoes_residentes) >
    (isLocal ? best.internacoes_local : best.internacoes_residentes) ? c : best, por_cid[0])

  return (
    <CardShell title="Mortalidade Hospitalar por Causa">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {caps.map(c => {
          const cor = MortColor(c.tx, benchmarks)
          const isExp = expandido === c.cid

          return (
            <div key={c.cid}>
              <button onClick={() => setExpandido(isExp ? null : c.cid)}
                style={{
                  width: '100%', background: isExp ? 'var(--accent-subtle)' : 'transparent',
                  border: 'none', borderRadius: 8, padding: '6px 8px',
                  cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 44, flexShrink: 0 }}>{c.cid}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{c.nome}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: cor, minWidth: 42, textAlign: 'right' }}>
                      {fmtPct(c.tx)}
                    </span>
                  </div>
                  {/* Barra */}
                  <div style={{ position: 'relative', height: 6, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'visible' }}>
                    <div style={{
                      height: '100%', width: `${Math.min(c.tx / (bench.p90 || 15) * 100, 100)}%`,
                      background: cor, borderRadius: 3, transition: 'width 0.3s',
                    }} />
                    {/* Linha de mediana */}
                    <div style={{
                      position: 'absolute', top: -2, bottom: -2,
                      left: `${Math.min(bench.mediana / (bench.p90 || 15) * 100, 100)}%`,
                      width: 2, background: 'var(--text-muted)', borderRadius: 2,
                    }} />
                  </div>
                </div>
              </button>

              {/* Detalhes expandidos */}
              {isExp && (
                <div style={{
                  margin: '4px 0 8px 52px', padding: '10px 14px',
                  background: 'var(--bg-surface)', borderRadius: 8,
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontSize: 12,
                }}>
                  {[
                    ['Internações', fmt(c.intern)],
                    ['Óbitos', fmt(isLocal ? c.obitos_local : c.obitos_residentes)],
                    ['Permanência', `${c.permanencia_media.toFixed(1)}d`],
                    ['Custo médio', fmtR(c.custo_medio)],
                    ['Local vs Res.', `${fmtPct(c.tx_mortalidade_local)} / ${fmtPct(c.tx_mortalidade_residentes)}`],
                    ['Externos', c.pct_externos > 0 ? fmtPct(c.pct_externos) : '—'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '0 0 2px' }}>{k}</p>
                      <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>{v}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Linha de referência — legenda */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: 'var(--text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 2, height: 12, background: 'var(--text-muted)', display: 'inline-block' }} />
          Mediana SP ({fmtPct(bench.mediana)})
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 4, background: 'var(--accent)', borderRadius: 2, display: 'inline-block' }} />
          ≤ Mediana
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 4, background: '#F59E0B', borderRadius: 2, display: 'inline-block' }} />
          Mediana–P75
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 4, background: 'var(--danger)', borderRadius: 2, display: 'inline-block' }} />
          {'>'}P75
        </span>
      </div>

      {/* Cap 05 separado */}
      {cap05 && (
        <div style={{
          padding: '10px 14px', background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10,
        }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', margin: '0 0 4px' }}>
            Cap 05 — Transtornos Mentais
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
            Mortalidade: {fmtPct(cap05.tx_mortalidade_local)} · Permanência: {cap05.permanencia_media.toFixed(0)} dias
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>
            Internações psiquiátricas de longa permanência institucionalizada —
            a permanência média elevada é característica deste perfil, não anomalia.
          </p>
        </div>
      )}

      {/* Narrativa */}
      {maisMortal && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
          <strong>{maisMortal.nome}</strong> tem a maior taxa de mortalidade ({fmtPct(maisMortal.tx)}),
          {' '}{maisMortal.tx > bench.mediana ? 'acima' : 'abaixo'} da mediana estadual ({fmtPct(bench.mediana)}).
          Em <strong>{maisFrecuente.nome}</strong>, principal causa em volume, a taxa é de{' '}
          <strong>{fmtPct(isLocal ? maisFrecuente.tx_mortalidade_local : maisFrecuente.tx_mortalidade_residentes)}</strong>.
        </p>
      )}
    </CardShell>
  )
}

// ── C5: SihPerfilPacientes ────────────────────────────────────────────────────

function SihPerfilPacientes({ dados, perspectiva, isMobile }: {
  dados: DadosMunicipio; perspectiva: Perspectiva; isMobile: boolean
}) {
  const { faixa_etaria, carater, perfil } = dados

  const faixas = perspectiva === 'local'
    ? faixa_etaria.local_internacao
    : faixa_etaria.residencia

  // Prepara dados para gráfico de barras — ambas perspectivas sobrepostas
  const chartData = faixa_etaria.local_internacao.map((f, i) => ({
    faixa: f.faixa.replace(' anos', '').replace('Menor 1 ', '<1 '),
    local: f.qtd,
    residencia: faixa_etaria.residencia[i]?.qtd ?? 0,
  }))

  const idosos = faixas
    .filter(f => ['60 a 69 anos', '70 a 79 anos', '80 anos e mais'].includes(f.faixa))
    .reduce((s, f) => s + f.qtd, 0)
  const totalFaixa = faixas.reduce((s, f) => s + f.qtd, 0)
  const pctIdosos  = totalFaixa ? (idosos / totalFaixa * 100).toFixed(1) : '0'

  const { eletivo, urgencia, acidente } = carater
  const totalCar = carater.total

  let caratNarr = ''
  if (urgencia.pct > 80)  caratNarr = 'Predominantemente urgências — perfil típico de hospital regional de referência para trauma e agudos.'
  else if (eletivo.pct > 40) caratNarr = 'Alta proporção de internações eletivas — indica capacidade de procedimentos programados.'

  return (
    <CardShell title="Perfil dos Pacientes">
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 24 }}>
        {/* Coluna esquerda — Faixa etária */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Faixa Etária
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickFormatter={v => fmt(v)} />
              <YAxis type="category" dataKey="faixa" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} width={60} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
                formatter={(v: unknown, name: unknown) => [fmt(v as number), name === 'local' ? 'Local internação' : 'Residência']}
              />
              <Legend wrapperStyle={{ fontSize: 11 }}
                formatter={(v: string) => v === 'local' ? 'Local internação' : 'Residência'} />
              <Bar dataKey="local"     fill="var(--accent)"  opacity={0.8} radius={[0, 3, 3, 0]} />
              <Bar dataKey="residencia" fill="#818CF8" opacity={0.6} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0', textAlign: 'center' }}>
            {pctIdosos}% dos internados têm 60 anos ou mais
          </p>
        </div>

        {/* Coluna direita — Caráter */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Caráter de Atendimento
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Urgência',  data: urgencia, color: '#F59E0B' },
              { label: 'Eletivo',   data: eletivo,  color: 'var(--accent)' },
              { label: 'Acidente',  data: acidente, color: 'var(--danger)' },
            ].map(({ label, data, color }) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color }}>
                    {data.pct.toFixed(1)}%
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>({fmt(data.qtd)})</span>
                  </span>
                </div>
                <div style={{ height: 10, background: 'var(--bg-surface)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${data.pct}%`, background: color, borderRadius: 5, transition: 'width 0.4s' }} />
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '16px 0 0' }}>
            Total: {fmt(totalCar)} internações
          </p>
          {caratNarr && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>
              {caratNarr}
            </p>
          )}
        </div>
      </div>
    </CardShell>
  )
}

// ── C6: SihFluxoAssistencial ──────────────────────────────────────────────────

function SihFluxoAssistencial({ dados }: { dados: DadosMunicipio }) {
  const { fluxo, por_cid } = dados
  const pct = fluxo.pct_externos

  // Polo receptor (> 15%)
  if (pct > 15) {
    const top = fluxo.por_cid.filter(c => c.internacoes_local > 0).slice(0, 10)
    const chartData = top.map(c => ({
      name: CAP_NOMES[c.cid] ?? c.cid,
      residentes:  c.internacoes_residentes,
      externos:    Math.max(0, c.pacientes_externos),
    }))
    const n10 = Math.round(pct / 10)

    return (
      <CardShell title="Fluxo Assistencial">
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', borderRadius: 10,
          background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)',
        }}>
          <span style={{ fontSize: 20 }}>🏥</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>
              Polo Regional — {fmtPct(pct)} das internações são de outros municípios
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              Para cada 10 pacientes internados, {n10} vieram de outros municípios.
            </p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={v => fmt(v)} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} width={120} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
              formatter={(v: unknown, name: unknown) => [fmt(v as number), name === 'residentes' ? 'Residentes' : 'Externos']}
            />
            <Legend wrapperStyle={{ fontSize: 11 }}
              formatter={(v: string) => v === 'residentes' ? 'Residentes' : 'De outros municípios'} />
            <Bar dataKey="residentes" stackId="a" fill="var(--accent)"   opacity={0.7} />
            <Bar dataKey="externos"   stackId="a" fill="#818CF8" opacity={0.8} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardShell>
    )
  }

  // Fluxo misto (5–15%)
  if (pct >= 5) {
    const topExt = fluxo.por_cid.filter(c => c.pct_externos > 0).slice(0, 5)
    const pctRes  = fluxo.total_internacoes_local > 0
      ? (100 - pct).toFixed(1)
      : '—'

    return (
      <CardShell title="Fluxo Assistencial">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', margin: 0 }}>{fmtPct(pct)}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Externos</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 28, fontWeight: 800, color: '#818CF8', margin: 0 }}>{pctRes}%</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Residentes tratados localmente</p>
          </div>
        </div>
        {topExt.length > 0 && (
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 8px', textTransform: 'uppercase' }}>CIDs com maior fluxo externo</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {topExt.map(c => (
                <div key={c.cid} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{CAP_NOMES[c.cid] ?? c.cid}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{fmtPct(c.pct_externos)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardShell>
    )
  }

  // Município dependente (< 5%)
  const totalRes  = fluxo.total_internacoes_residentes
  const totalLoc  = fluxo.total_internacoes_local
  const pctFora   = totalRes > 0
    ? ((totalRes - totalLoc) / totalRes * 100).toFixed(1)
    : '0.0'

  return (
    <CardShell title="Fluxo Assistencial">
      <div style={{ padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
          {pctFora}% dos residentes foram internados em outros municípios
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
          O município não possui todos os serviços hospitalares — é esperado que parte dos residentes
          seja referenciada para municípios com maior capacidade instalada.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 2px' }}>Internados localmente</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{fmt(totalLoc)}</p>
        </div>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 2px' }}>Total de residentes internados</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{fmt(totalRes)}</p>
        </div>
      </div>
    </CardShell>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function MorbidadeHospitalarPage() {
  const [perfil, setPerfil] = useState<{ ibge: string; nome: string } | null>(null)
  const [dados,  setDados]  = useState<DadosMunicipio | null>(null)
  const [bench,  setBench]  = useState<{ benchmarks: Benchmarks; cir_evolucao: CirEntry[] } | null>(null)
  const [erro,   setErro]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [perspectiva, setPerspectiva] = useState<Perspectiva>('local')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const fetchDados = useCallback(async (ibge: string) => {
    setLoading(true); setErro(null)
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/sih/municipio?ibge=${ibge}`),
        fetch('/api/sih/benchmarks'),
      ])
      if (!r1.ok) {
        const e = await r1.json()
        setErro(e.error ?? 'Erro ao carregar dados hospitalares.')
        return
      }
      const [d1, d2] = await Promise.all([r1.json(), r2.json()])
      setDados(d1)
      setBench(d2)
    } catch {
      setErro('Erro de rede ao carregar dados hospitalares.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch(`/api/admin/usuarios/${session.user.id}`)
      if (!res.ok) {
        setErro('Erro ao carregar perfil do usuário.')
        setLoading(false)
        return
      }
      const data = await res.json()
      const mun = data?.municipios as { id: string; nome: string; codigo_ibge: string } | null

      if (mun?.codigo_ibge) {
        const ibge6 = String(mun.codigo_ibge).slice(0, 6)
        setPerfil({ ibge: ibge6, nome: mun.nome })
        fetchDados(ibge6)
      } else {
        setErro('Nenhum município ativo selecionado.')
        setLoading(false)
      }
    }
    init()
  }, [fetchDados])

  // ── Estados de carregamento / erro ─────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
        {[0,1,2,3].map(i => <div key={i} style={{ height: 140, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', animation: 'pulse 1.4s ease-in-out infinite' }} />)}
      </div>
      <Skeleton h={260} r={16} />
      <Skeleton h={340} r={16} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Skeleton h={280} r={16} />
        <Skeleton h={280} r={16} />
      </div>
    </div>
  )

  if (erro) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <p style={{ fontSize: 15, color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>
    </div>
  )

  if (!dados || !bench) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header da página */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, animation: 'fadeIn 0.3s ease' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.4px' }}>
            Morbidade Hospitalar — SIH/SUS
          </h1>
          {perfil && (
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {perfil.nome} · Período: 2022–2025 · Fonte: SIH/SUS / DATASUS
            </p>
          )}
        </div>

        {/* Seletor de perspectiva global */}
        <div style={{
          display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 10, overflow: 'hidden',
        }}>
          {(['local', 'residencia'] as const).map(p => (
            <button key={p} onClick={() => setPerspectiva(p)}
              style={{
                padding: '7px 14px', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: perspectiva === p ? 700 : 400,
                background: perspectiva === p ? 'var(--accent-subtle)' : 'transparent',
                color: perspectiva === p ? 'var(--accent)' : 'var(--text-muted)',
                borderRight: p === 'local' ? '1px solid var(--border-subtle)' : 'none',
                transition: 'all 0.15s',
              }}>
              {p === 'local' ? 'Local de Internação' : 'Residência dos Pacientes'}
            </button>
          ))}
        </div>
      </div>

      {/* Linha 1 — KPIs */}
      <div style={{ animation: 'fadeIn 0.35s ease' }}>
        <SihKPIs dados={dados} benchmarks={bench.benchmarks} />
      </div>

      {/* Linha 2 — Evolução (55%) + Perfil Pacientes (45%) */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '55fr 45fr', gap: 16, animation: 'fadeIn 0.4s ease' }}>
        <SihEvolucaoTemporal dados={dados} cirEvolucao={bench.cir_evolucao} isMobile={isMobile} />
        <SihPerfilPacientes  dados={dados} perspectiva={perspectiva} isMobile={isMobile} />
      </div>

      {/* Linha 3 — Causas de Internação (largura total) */}
      <div style={{ animation: 'fadeIn 0.45s ease' }}>
        <SihCausasInternacao dados={dados} perspectiva={perspectiva} isMobile={isMobile} />
      </div>

      {/* Linha 4 — Mortalidade (55%) + Fluxo Assistencial (45%) */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '55fr 45fr', gap: 16, animation: 'fadeIn 0.5s ease' }}>
        <SihMortalidade      dados={dados} benchmarks={bench.benchmarks} perspectiva={perspectiva} />
        <SihFluxoAssistencial dados={dados} />
      </div>
    </div>
  )
}
