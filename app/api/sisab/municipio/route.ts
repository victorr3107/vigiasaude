import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// GET /api/sisab/municipio?ibge=355030
// Retorna dados de validação SISAB para um município específico.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const ibge = searchParams.get('ibge')?.trim()

  if (!ibge || !/^\d{6,7}$/.test(ibge)) {
    return NextResponse.json({ error: 'Parâmetro ibge obrigatório (6 dígitos).' }, { status: 400 })
  }

  const ibge6 = ibge.slice(0, 6)
  const dir = join(process.cwd(), 'dados_sisab', 'processados')

  const readJson = (name: string) => {
    const p = join(dir, name)
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf-8'))
  }

  const porMun = readJson('por_municipio.json') as Array<Record<string, unknown>> | null
  const criticos = readJson('municipios_criticos.json') as Array<Record<string, unknown>> | null
  const pendentesData = readJson('pendentes_processamento.json') as Record<string, unknown> | null
  const motivosMunData = readJson('motivos_por_municipio.json') as Record<string, Record<string, number>> | null

  if (!porMun) {
    return NextResponse.json(
      { error: 'Dados não encontrados. Execute scripts/processar_sisab.py primeiro.' },
      { status: 503 }
    )
  }

  const mun = porMun.find(m => String(m.ibge).slice(0, 6) === ibge6)
  if (!mun) {
    return NextResponse.json({ error: `Município IBGE ${ibge6} não encontrado nos dados SISAB.` }, { status: 404 })
  }

  const critico = criticos?.find(m => String(m.ibge).slice(0, 6) === ibge6) ?? null
  const pendMun = (pendentesData?.por_municipio as Array<Record<string, unknown>> | undefined)
    ?.find(m => String(m.ibge).slice(0, 6) === ibge6) ?? null

  // Motivos do município (do novo JSON)
  const motivosMun = motivosMunData?.[ibge6] ?? null

  // Principal motivo (derivado dos motivos do município)
  let principalMotivo: string | null = null
  if (motivosMun) {
    const entries = Object.entries(motivosMun).filter(([, v]) => v > 0)
    if (entries.length > 0) {
      principalMotivo = entries.sort((a, b) => b[1] - a[1])[0][0]
    }
  } else if (critico?.principal_motivo) {
    principalMotivo = critico.principal_motivo as string
  }

  return NextResponse.json({
    ibge: mun.ibge,
    municipio: mun.municipio,
    uf: mun.uf,
    total: mun.total,
    aprovado: mun.aprovado,
    reprovado: mun.reprovado,
    duplicado: mun.duplicado,
    nao_aplicado: mun.nao_aplicado,
    pendente: mun.pendente,
    outros: mun.outros,
    taxa_aprovacao: mun.taxa_aprovacao,
    taxa_reprovacao: mun.taxa_reprovacao,
    principal_motivo: principalMotivo,
    motivos: motivosMun,
    critico: critico
      ? {
          principal_motivo: critico.principal_motivo,
          motivos: critico.motivos,
          rank_reprovacao: criticos!.indexOf(critico) + 1,
        }
      : null,
    pendentes: pendMun
      ? { fichas: pendMun.fichas, competencias: pendMun.competencias }
      : null,
  }, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' },
  })
}
