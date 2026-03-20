import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// GET /api/ambulatorial/perfis
// Retorna perfil_municipio.json completo (287KB) — usado no scatter comparativo.
export async function GET() {
  const filePath = join(process.cwd(), 'dados_ambulatorial', 'processados', 'perfil_municipio.json')

  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: 'Arquivo perfil_municipio.json não encontrado. Execute scripts/processar_ambulatorial.py.' },
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
