import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// GET /api/sih/perfis
// Retorna sih_perfil_municipio.json completo (146KB) — rankings e comparativos.
export async function GET() {
  const filePath = join(process.cwd(), 'dados_hospitalar', 'processados', 'sih_perfil_municipio.json')

  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: 'Arquivo não encontrado. Execute scripts/processar_sih.py.' },
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
