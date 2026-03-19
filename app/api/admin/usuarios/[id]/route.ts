import { NextRequest, NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── GET /api/admin/usuarios/[id] ─────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('perfis')
    .select(`
      id, nome, email, role, ativo, tema, criado_em, municipio_ativo_id,
      municipios!perfis_municipio_ativo_id_fkey ( id, nome ),
      perfis_municipios ( municipio_id, municipios ( id, nome, uf ) )
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('[GET /api/admin/usuarios/[id]]', error)
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
  }

  return NextResponse.json(data)
}

// ── PATCH /api/admin/usuarios/[id] ──────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })
  }
  const body = await req.json()

  // Separa municipios_ids do restante dos campos do perfil
  const { municipios_ids, ...perfisDataRaw } = body

  // Whitelist: só permite campos seguros (impede escalação de privilégio)
  const CAMPOS_PERMITIDOS = ['nome', 'role', 'ativo', 'municipio_ativo_id']
  const perfisData = Object.fromEntries(
    Object.entries(perfisDataRaw).filter(([k]) => CAMPOS_PERMITIDOS.includes(k))
  )

  // 1. Atualiza o perfil (somente campos permitidos)
  const { data, error } = await supabaseAdmin
    .from('perfis')
    .update(perfisData)
    .eq('id', id)
    .select(`
      id, nome, email, role, ativo, criado_em, municipio_ativo_id,
      municipios!perfis_municipio_ativo_id_fkey ( id, nome ),
      perfis_municipios ( municipio_id, municipios ( id, nome, uf ) )
    `)
    .single()

  if (error) {
    console.error('[PATCH /api/admin/usuarios]', error)
    return NextResponse.json({ error: 'Não foi possível salvar as alterações. Tente novamente.' }, { status: 500 })
  }

  // 2. Sincroniza perfis_municipios se a lista foi enviada
  if (Array.isArray(municipios_ids)) {
    // Remove todos os vínculos existentes
    await supabaseAdmin
      .from('perfis_municipios')
      .delete()
      .eq('perfil_id', id)

    // Insere os novos vínculos
    if (municipios_ids.length > 0) {
      const { error: insErr } = await supabaseAdmin
        .from('perfis_municipios')
        .insert(municipios_ids.map((mid: string) => ({ perfil_id: id, municipio_id: mid })))

      if (insErr) {
        console.error('[PATCH /api/admin/usuarios] perfis_municipios insert:', insErr)
      }
    }

    // Se o município ativo não está mais na lista, atualiza para o primeiro ou null
    const municipioAtivoId = data?.municipio_ativo_id
    if (municipioAtivoId && !municipios_ids.includes(municipioAtivoId)) {
      await supabaseAdmin
        .from('perfis')
        .update({ municipio_ativo_id: municipios_ids[0] ?? null })
        .eq('id', id)
    }

    // Rebusca o perfil com os dados atualizados
    const { data: updated } = await supabaseAdmin
      .from('perfis')
      .select(`
        id, nome, email, role, ativo, criado_em, municipio_ativo_id,
        municipios!perfis_municipio_ativo_id_fkey ( id, nome ),
        perfis_municipios ( municipio_id, municipios ( id, nome, uf ) )
      `)
      .eq('id', id)
      .single()

    return NextResponse.json(updated ?? data)
  }

  return NextResponse.json(data)
}

// ── DELETE /api/admin/usuarios/[id] ─────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })
  }

  // 1. Remove vínculos com municípios
  const { error: errMunic } = await supabaseAdmin
    .from('perfis_municipios')
    .delete()
    .eq('perfil_id', id)

  if (errMunic) {
    console.error('[DELETE /api/admin/usuarios] perfis_municipios:', errMunic)
  }

  // 2. Remove perfil
  const { error: errPerfil } = await supabaseAdmin
    .from('perfis')
    .delete()
    .eq('id', id)

  if (errPerfil) {
    console.error('[DELETE /api/admin/usuarios] perfis:', errPerfil)
  }

  // 3. Remove usuário do Auth
  const { error } = await supabaseAdmin.auth.admin.deleteUser(id)

  if (error) {
    console.error('[DELETE /api/admin/usuarios] auth:', error)
    return NextResponse.json({ error: 'Não foi possível remover o usuário. Tente novamente.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
