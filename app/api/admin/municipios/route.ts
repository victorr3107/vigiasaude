import { NextRequest, NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

// ── GET /api/admin/municipios ─────────────────────────────────────────────────
// Query params:
//   busca    string   — filtro por nome (mínimo 2 chars)
//   ativo    boolean  — 'true' | 'false' | 'todos'
//   page     number   — página atual (default 1)
//   limit    number   — itens por página (default 10, max 50)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const busca = searchParams.get('busca')?.trim() ?? ''
  const ativoParam = searchParams.get('ativo') ?? 'true'
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '10')))
  const offset = (page - 1) * limit

  let query = supabaseAdmin
    .from('municipios')
    .select('id, nome, ativo, uf', { count: 'exact' })
    .order('nome', { ascending: true })
    .range(offset, offset + limit - 1)

  // Filtro de status
  if (ativoParam === 'true')  query = query.eq('ativo', true)
  if (ativoParam === 'false') query = query.eq('ativo', false)
  // 'todos' = sem filtro

  // Busca por nome — obrigatório para listar inativos sem filtro explícito
  if (busca.length >= 2) {
    query = query.ilike('nome', `%${busca}%`)
  }

  const { data, count, error } = await query

  if (error) {
    console.error('[GET /api/admin/municipios]', error)
    return NextResponse.json({ error: 'Erro ao carregar municípios.' }, { status: 500 })
  }

  return NextResponse.json({
    data,
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  })
}

