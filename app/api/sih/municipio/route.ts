import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// GET /api/sih/municipio?ibge=350280
// Filtra server-side os JSONs grandes (por_cid 2.5MB, fluxo 1.1MB, etc.)
// e retorna apenas os dados do município solicitado.
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
  const dir   = join(process.cwd(), 'dados_hospitalar', 'processados')

  const readJson = (name: string): Record<string, unknown> | null => {
    const p = join(dir, name)
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf-8'))
  }

  const serieMensal  = readJson('sih_serie_mensal.json')
  const porCid       = readJson('sih_por_cid.json')
  const faixaEtaria  = readJson('sih_faixa_etaria.json')
  const carater      = readJson('sih_carater.json')
  const fluxo        = readJson('sih_fluxo.json')
  const perfilMun    = readJson('sih_perfil_municipio.json')

  if (!serieMensal || !porCid) {
    return NextResponse.json(
      { error: 'Dados não encontrados. Execute scripts/processar_sih.py primeiro.' },
      { status: 503 }
    )
  }

  const serie   = serieMensal[ibge6]  ?? null
  const cid     = porCid[ibge6]       ?? null
  const faixa   = faixaEtaria?.[ibge6] ?? null
  const car     = carater?.[ibge6]    ?? null
  const flu     = fluxo?.[ibge6]      ?? null
  const perfil  = perfilMun?.[ibge6]  ?? null

  if (!serie && !cid) {
    return NextResponse.json(
      { error: `Município IBGE ${ibge6} não encontrado nos dados hospitalares.` },
      { status: 404 }
    )
  }

  return NextResponse.json(
    { ibge: ibge6, serie, por_cid: cid, faixa_etaria: faixa, carater: car, fluxo: flu, perfil },
    { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } }
  )
}
