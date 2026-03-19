import { NextRequest, NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── PATCH /api/admin/municipios/[id] ─────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })
  }
  const body = await req.json()

  // Whitelist: só permite campos seguros (protege codigo_ibge, nome, etc.)
  const CAMPOS_PERMITIDOS = ['ativo']
  const bodySeguro = Object.fromEntries(
    Object.entries(body).filter(([k]) => CAMPOS_PERMITIDOS.includes(k))
  )

  if (Object.keys(bodySeguro).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo válido para atualização.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('municipios')
    .update(bodySeguro)
    .eq('id', id)
    .select('id, nome, ativo, uf')
    .single()

  if (error) {
    console.error('[PATCH /api/admin/municipios]', error)
    return NextResponse.json({ error: 'Não foi possível atualizar o município. Tente novamente.' }, { status: 500 })
  }

  return NextResponse.json(data)
}
