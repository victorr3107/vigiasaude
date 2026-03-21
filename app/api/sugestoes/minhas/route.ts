import { NextRequest, NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
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

    // Buscar sugestões do usuário
    const { data: sugestoes, error } = await supabaseAdmin
      .from('sugestoes')
      .select('id, titulo, categoria, status, resposta_admin, data_criacao, data_atualizacao')
      .eq('usuario_id', user.id)
      .order('data_criacao', { ascending: false })

    if (error) {
      console.error('Erro ao buscar sugestões:', error)
      return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
    }

    return NextResponse.json(sugestoes || [])

  } catch (error) {
    console.error('Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}