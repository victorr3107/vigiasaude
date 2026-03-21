import { NextRequest, NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Verificar se é admin
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido.' }, { status: 401 })
    }

    const { data: perfil } = await supabaseAdmin
      .from('perfis')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!perfil || perfil.role !== 'super_admin') {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    }

    // Validar ID
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'ID da sugestão é obrigatório.' }, { status: 400 })
    }

    // Validar body
    const body = await req.json()
    const { status, resposta_admin } = body

    if (!status) {
      return NextResponse.json({ error: 'Status é obrigatório.' }, { status: 400 })
    }

    const statusValidos = ['NOVA', 'EM_ANALISE', 'PLANEJADA', 'IMPLEMENTADA', 'DESCARTADA']
    if (!statusValidos.includes(status)) {
      return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
    }

    if (resposta_admin && typeof resposta_admin !== 'string') {
      return NextResponse.json({ error: 'Resposta deve ser uma string.' }, { status: 400 })
    }

    // Atualizar sugestão
    const updateData: any = { status }
    if (resposta_admin !== undefined) {
      updateData.resposta_admin = resposta_admin.trim() || null
    }

    const { data: sugestao, error: updateError } = await supabaseAdmin
      .from('sugestoes')
      .update(updateData)
      .eq('id', id)
      .select(`
        id, titulo, categoria, municipio_ibge, municipio_nome, status,
        resposta_admin, data_criacao, data_atualizacao,
        perfis!sugestoes_usuario_id_fkey (nome, email)
      `)
      .single()

    if (updateError) {
      console.error('Erro ao atualizar sugestão:', updateError)
      return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
    }

    if (!sugestao) {
      return NextResponse.json({ error: 'Sugestão não encontrada.' }, { status: 404 })
    }

    return NextResponse.json(sugestao)

  } catch (error) {
    console.error('Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}