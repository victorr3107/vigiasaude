import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// GET /api/ambulatorial/municipio?ibge=350280
// Retorna todos os dados ambulatoriais de um município específico,
// filtrando server-side os JSONs grandes (serie_temporal 5MB, complexidade 2.8MB).
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
  const dir = join(process.cwd(), 'dados_ambulatorial', 'processados')

  const readJson = (name: string) => {
    const p = join(dir, name)
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf-8'))
  }

  const serieTemporal    = readJson('serie_temporal.json')    as Record<string, unknown> | null
  const complexidade     = readJson('complexidade_mensal.json') as Record<string, unknown> | null
  const caratData        = readJson('carater_atendimento.json') as Record<string, unknown> | null
  const formaData        = readJson('forma_organizacao.json')   as Record<string, unknown> | null
  const perfilData       = readJson('perfil_municipio.json')    as Record<string, unknown> | null

  if (!serieTemporal || !complexidade) {
    return NextResponse.json(
      { error: 'Dados não encontrados. Execute scripts/processar_ambulatorial.py primeiro.' },
      { status: 503 }
    )
  }

  const serie     = serieTemporal[ibge6]  ?? null
  const complex   = complexidade[ibge6]   ?? null
  const carat     = caratData?.[ibge6]    ?? null
  const forma     = formaData?.[ibge6]    ?? null
  const perfil    = perfilData?.[ibge6]   ?? null

  if (!serie && !complex) {
    return NextResponse.json(
      { error: `Município IBGE ${ibge6} não encontrado nos dados ambulatoriais.` },
      { status: 404 }
    )
  }

  return NextResponse.json(
    { ibge: ibge6, serie, complexidade: complex, carater: carat, forma, perfil },
    { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } }
  )
}
