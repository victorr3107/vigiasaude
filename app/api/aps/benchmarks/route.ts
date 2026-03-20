import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * GET /api/aps/benchmarks?ibge=350640
 *
 * Retorna benchmarks de produção APS de SP.
 * Se ibge for fornecido, inclui os percentis do município.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const ibge = searchParams.get('ibge')?.slice(0, 6) ?? null

  try {
    const filePath = join(process.cwd(), 'dados_aps', 'processados', 'aps_benchmarks_sp.json')
    const raw = readFileSync(filePath, 'utf-8')
    const benchmarks = JSON.parse(raw)

    const munData = ibge ? (benchmarks.por_municipio[ibge] ?? null) : null

    return NextResponse.json({
      ano:                 benchmarks.ano,
      total_municipios_sp: benchmarks.total_municipios_sp,
      at_individual:       benchmarks.at_individual,
      odonto:              benchmarks.odonto,
      procedimentos:       benchmarks.procedimentos,
      visita:              benchmarks.visita,
      municipio:           munData,
    })
  } catch (e) {
    console.error('[GET /api/aps/benchmarks]', e)
    return NextResponse.json({ error: 'Benchmarks não disponíveis.' }, { status: 503 })
  }
}
