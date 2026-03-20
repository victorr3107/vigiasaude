import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// GET /api/sisab/municipio/temporal?ibge=350280
// Retorna a série temporal mensal (2024-01 → 2026-03) do município.
// O JSON de origem tem 37MB — lemos apenas a entrada do IBGE pedido.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const ibge = searchParams.get('ibge')?.trim()

  if (!ibge || !/^\d{6,7}$/.test(ibge)) {
    return NextResponse.json(
      { error: 'Parâmetro ibge obrigatório (6 dígitos).' },
      { status: 400 }
    )
  }

  const ibge6 = ibge.slice(0, 6)
  const filePath = join(process.cwd(), 'dados_sisab', 'processados', 'evolucao_por_municipio.json')

  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: 'Arquivo evolucao_por_municipio.json não encontrado. Execute scripts/processar_sisab.py.' },
      { status: 503 }
    )
  }

  try {
    const all = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown[]>
    const serie = all[ibge6] ?? null

    if (!serie) {
      return NextResponse.json(
        { error: `Município IBGE ${ibge6} sem dados temporais.` },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { ibge: ibge6, serie },
      { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } }
    )
  } catch {
    return NextResponse.json({ error: 'Erro ao ler dados.' }, { status: 500 })
  }
}
