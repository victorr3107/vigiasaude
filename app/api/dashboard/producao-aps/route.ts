import { NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/dashboard/producao-aps
// Query params:
//   municipio_id  uuid    — filtra por município (obrigatório)
//   ano           number  — filtra por ano (default: ano atual)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const municipio_id = searchParams.get('municipio_id')
  const ano = parseInt(searchParams.get('ano') ?? new Date().getFullYear().toString())

  if (!municipio_id || !UUID_RE.test(municipio_id)) {
    return NextResponse.json({ error: 'municipio_id obrigatório e deve ser UUID válido.' }, { status: 400 })
  }
  if (isNaN(ano) || ano < 2000 || ano > 2099) {
    return NextResponse.json({ error: 'Ano inválido.' }, { status: 400 })
  }

  // Busca dados da view agregada por município/competência
  const { data, error } = await supabaseAdmin
    .from('vw_sisab_producao_anual')
    .select('*')
    .eq('municipio_id', municipio_id)
    .gte('competencia', `${ano}-01-01`)
    .lte('competencia', `${ano}-12-31`)
    .order('competencia', { ascending: true })

  if (error) {
    console.error('[GET /api/dashboard/producao-aps]', error)
    return NextResponse.json({ error: 'Erro ao carregar dados de produção APS.' }, { status: 500 })
  }

  // Anos disponíveis para o seletor (limitado para evitar payload grande)
  const { data: anos } = await supabaseAdmin
    .from('sisab_producao_consolidada')
    .select('competencia')
    .eq('municipio_id', municipio_id)
    .order('competencia', { ascending: false })
    .limit(120)

  const anosUnicos = [...new Set(
    (anos ?? []).map(r => new Date(r.competencia).getFullYear())
  )].sort((a, b) => b - a)

  return NextResponse.json({ data: data ?? [], anos: anosUnicos })
}