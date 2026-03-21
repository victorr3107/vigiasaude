import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * GET /api/sinan/dengue/municipio?ibge=350640
 *
 * Retorna dados SINAN Dengue para o município solicitado:
 *   historico    — dengue_historico_anual.json[ibge]
 *   sazonalidade — dengue_sazonalidade.json[ibge]
 *   perfil       — dengue_perfil.json[ibge]
 *   benchmarks   — dengue_benchmarks_sp.json (completo)
 *   semana_atual — calculada do calendário_epidemiologico.json
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const ibge = searchParams.get('ibge')?.trim()

  if (!ibge || !/^\d{6,7}$/.test(ibge)) {
    return NextResponse.json(
      { error: 'Parâmetro ibge obrigatório (6 dígitos).' },
      { status: 400 }
    )
  }

  const ibge6  = ibge.slice(0, 6)
  const dir    = join(process.cwd(), 'dados_vigilancia', 'processados')
  const calPath = join(process.cwd(), 'dados_vigilancia', 'calendario_epidemiologico.json')

  const readJson = (name: string): Record<string, unknown> | null => {
    const p = join(dir, name)
    if (!existsSync(p)) return null
    try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null }
  }

  const historicoDB    = readJson('dengue_historico_anual.json')
  const sazonalidadeDB = readJson('dengue_sazonalidade.json')
  const perfilDB       = readJson('dengue_perfil.json')
  const benchmarksDB   = readJson('dengue_benchmarks_nacional.json') ?? readJson('dengue_benchmarks_sp.json')
  const semanaAnoRaw   = readJson('dengue_semana_por_ano.json')
  const semanaAnoMunDB = readJson('dengue_semana_por_ano_municipio.json')
  const perfilAnualDB  = readJson('dengue_perfil_anual.json')

  if (!historicoDB || !benchmarksDB) {
    return NextResponse.json(
      { error: 'Dados não encontrados. Execute scripts/processar_sinan_dengue.py primeiro.' },
      { status: 503 }
    )
  }

  const historico    = (historicoDB as Record<string, unknown>)[ibge6]    ?? null
  const sazonalidade = sazonalidadeDB ? (sazonalidadeDB as Record<string, unknown>)[ibge6] ?? null : null
  const perfil       = perfilDB       ? (perfilDB as Record<string, unknown>)[ibge6]       ?? null : null

  if (!historico) {
    return NextResponse.json(
      { error: `Município IBGE ${ibge6} não encontrado nos dados de dengue.` },
      { status: 404 }
    )
  }

  const semana_atual = calcSemanaAtual(calPath)

  // semana_por_ano_nacional: dados agregados nacionais (Brasil) do SINAN
  const semana_por_ano_nacional = semanaAnoRaw ?? null

  // semana_por_ano_municipio: dados reais do município × semana × ano
  const semana_por_ano_municipio = semanaAnoMunDB
    ? ((semanaAnoMunDB as Record<string, unknown>)[ibge6] ?? null)
    : null

  const perfil_anual = perfilAnualDB
    ? ((perfilAnualDB as Record<string, unknown>)[ibge6] ?? null)
    : null

  return NextResponse.json(
    { ibge: ibge6, historico, sazonalidade, perfil, benchmarks: benchmarksDB, semana_atual, semana_por_ano_nacional, semana_por_ano_municipio, perfil_anual },
    { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } }
  )
}

interface SemanaAtual {
  semana: number
  ano: number
  inicio: string
  fim: string
  badge_tipo: 'inicio' | 'ativa' | 'baixa' | 'pre'
}

function calcSemanaAtual(calPath: string): SemanaAtual | null {
  try {
    const cal  = JSON.parse(readFileSync(calPath, 'utf-8'))
    const hoje = new Date()

    const parseDate = (s: string) => {
      const [d, m, y] = s.split('/')
      return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    }

    for (const [anoStr, dados] of Object.entries(cal) as [string, { semanas: Record<string, { inicio: string; fim: string }> }][]) {
      for (const [semStr, iv] of Object.entries(dados.semanas)) {
        const ini = parseDate(iv.inicio)
        const fim = parseDate(iv.fim)
        fim.setHours(23, 59, 59)
        if (hoje >= ini && hoje <= fim) {
          const sem = parseInt(semStr)
          const badge_tipo: SemanaAtual['badge_tipo'] =
            sem <= 7  ? 'inicio' :
            sem <= 20 ? 'ativa'  :
            sem <= 39 ? 'baixa'  : 'pre'
          return { semana: sem, ano: parseInt(anoStr), inicio: iv.inicio, fim: iv.fim, badge_tipo }
        }
      }
    }
  } catch { /* fall through */ }
  return null
}
