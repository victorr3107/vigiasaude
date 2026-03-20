import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// GET /api/ambulatorial/benchmarks
// Retorna benchmarks_sp.json (3KB) — estatísticas estaduais e lista de POLO_AC.
export async function GET() {
  const filePath = join(process.cwd(), 'dados_ambulatorial', 'processados', 'benchmarks_sp.json')

  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: 'Arquivo benchmarks_sp.json não encontrado. Execute scripts/processar_ambulatorial.py.' },
      { status: 503 }
    )
  }

  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'))
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' },
    })
  } catch {
    return NextResponse.json({ error: 'Erro ao ler dados.' }, { status: 500 })
  }
}
