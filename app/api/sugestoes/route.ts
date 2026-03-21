import { NextRequest, NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    // Verificar sessão
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido.' }, { status: 401 })
    }

    // Buscar perfil do usuário
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('perfis')
      .select('id, municipio_ativo_id, municipios!perfis_municipio_ativo_id_fkey (ibge, nome)')
      .eq('id', user.id)
      .single()

    if (perfilError || !perfil) {
      return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 })
    }

    // Validar body
    const body = await req.json()
    const { titulo, categoria, descricao } = body

    if (!titulo?.trim() || !categoria || !descricao?.trim()) {
      return NextResponse.json({ error: 'Título, categoria e descrição são obrigatórios.' }, { status: 400 })
    }

    if (titulo.length > 120 || descricao.length > 1000) {
      return NextResponse.json({ error: 'Título ou descrição muito longos.' }, { status: 400 })
    }

    const categoriasValidas = ['NOVO_GRAFICO', 'NOVA_ROTINA', 'MELHORIA', 'BUG', 'OUTRO']
    if (!categoriasValidas.includes(categoria)) {
      return NextResponse.json({ error: 'Categoria inválida.' }, { status: 400 })
    }

    // Criar sugestão
    const { data: sugestao, error: insertError } = await supabaseAdmin
      .from('sugestoes')
      .insert({
        usuario_id: perfil.id,
        municipio_ibge: (perfil.municipios as any)?.ibge || '',
        municipio_nome: (perfil.municipios as any)?.nome || '',
        titulo: titulo.trim(),
        categoria,
        descricao: descricao.trim(),
        status: 'NOVA'
      })
      .select('id, titulo, status, data_criacao')
      .single()

    if (insertError) {
      console.error('Erro ao criar sugestão:', insertError)
      return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
    }

    return NextResponse.json(sugestao)

  } catch (error) {
    console.error('Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}