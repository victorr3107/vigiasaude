import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const DATASETS_PERMITIDOS = new Set([
  'resumo_geral',
  'evolucao_temporal',
  'por_uf',
  'por_municipio',
  'motivos_reprovacao',
  'municipios_criticos',
  'pendentes_processamento',
  'por_tipo_equipe',
])

// GET /api/sisab/[dataset]
// Serve os JSONs analíticos gerados pelo script processar_sisab.py
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ dataset: string }> }
) {
  const { dataset } = await params

  if (!DATASETS_PERMITIDOS.has(dataset)) {
    return NextResponse.json(
      { error: `Dataset '${dataset}' não encontrado.` },
      { status: 404 }
    )
  }

  const filePath = join(
    process.cwd(),
    'dados_sisab',
    'processados',
    `${dataset}.json`
  )

  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: `Arquivo ${dataset}.json não encontrado. Execute scripts/processar_sisab.py primeiro.` },
      { status: 503 }
    )
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' },
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro ao ler arquivo de dados.' },
      { status: 500 }
    )
  }
}
