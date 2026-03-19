import { NextRequest, NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

// ── GET /api/admin/usuarios ──────────────────────────────────────────────────
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('perfis')
    .select(`
      id, nome, email, role, ativo, criado_em, municipio_ativo_id,
      municipios!perfis_municipio_ativo_id_fkey ( id, nome ),
      perfis_municipios ( municipio_id, municipios ( id, nome, uf ) )
    `)
    .order('criado_em', { ascending: false })

  if (error) {
    console.error('[GET /api/admin/usuarios]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// ── POST /api/admin/usuarios ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { nome, email, senha, role, municipio_id, ativo } = body

  if (!nome || !email || !senha || !role) {
    return NextResponse.json({ error: 'Preencha todos os campos obrigatórios antes de continuar.' }, { status: 400 })
  }

  const ROLES_VALIDAS = ['super_admin', 'admin_municipal', 'operador']
  if (!ROLES_VALIDAS.includes(role)) {
    return NextResponse.json({ error: `Role inválida. Permitidas: ${ROLES_VALIDAS.join(', ')}` }, { status: 400 })
  }

  if (senha.length < 8) {
    return NextResponse.json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, { status: 400 })
  }

  // 1. Criar usuário no Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })

  if (authError) {
    console.error('[POST /api/admin/usuarios] Auth error:', authError)
    if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
      return NextResponse.json({ error: 'Já existe um usuário cadastrado com esse e-mail.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Não foi possível criar o usuário. Tente novamente.' }, { status: 500 })
  }

  const userId = authData.user.id

  // 2. Inserir perfil
  const { data: perfilData, error: perfilError } = await supabaseAdmin
    .from('perfis')
    .insert({
      id: userId,
      nome,
      email,
      role,
      municipio_ativo_id: municipio_id || null,
      ativo: ativo ?? true,
    })
    .select(`
      id, nome, email, role, ativo, criado_em, municipio_ativo_id,
      municipios!perfis_municipio_ativo_id_fkey ( id, nome )
    `)
    .single()

  if (perfilError) {
    console.error('[POST /api/admin/usuarios] Perfil error:', perfilError)
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Usuário criado, mas houve um erro ao salvar o perfil. Entre em contato com o suporte.' }, { status: 500 })
  }

  // 3. Vincular município em perfis_municipios
  if (municipio_id) {
    await supabaseAdmin
      .from('perfis_municipios')
      .insert({ perfil_id: userId, municipio_id })
      .then(({ error }) => {
        if (error) console.error('[POST] perfis_municipios error:', error)
      })
  }

  return NextResponse.json(perfilData, { status: 201 })
}