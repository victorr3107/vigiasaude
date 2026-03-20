import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// GET /api/sih/benchmarks
// Retorna sih_benchmarks.json (369B) + sih_cir_evolucao.json (7.7KB)
export async function GET() {
  const dir = join(process.cwd(), 'dados_hospitalar', 'processados')

  const readJson = (name: string) => {
    const p = join(dir, name)
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf-8'))
  }

  const benchmarks   = readJson('sih_benchmarks.json')
  const cirEvolucao  = readJson('sih_cir_evolucao.json')

  if (!benchmarks) {
    return NextResponse.json(
      { error: 'Dados não encontrados. Execute scripts/processar_sih.py primeiro.' },
      { status: 503 }
    )
  }

  return NextResponse.json(
    { benchmarks, cir_evolucao: cirEvolucao ?? [] },
    { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } }
  )
}
