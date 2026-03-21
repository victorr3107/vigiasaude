import { NextRequest, NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
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

    // Contar sugestões NOVAS não visualizadas
    const { count: novas } = await supabaseAdmin
      .from('sugestoes')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'NOVA')
      .eq('visualizada_admin', false)

    // Contar EM_ANALISE
    const { count: em_analise } = await supabaseAdmin
      .from('sugestoes')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'EM_ANALISE')

    // Total geral
    const { count: total } = await supabaseAdmin
      .from('sugestoes')
      .select('*', { count: 'exact', head: true })

    return NextResponse.json({
      novas: novas || 0,
      em_analise: em_analise || 0,
      total: total || 0
    })

  } catch (error) {
    console.error('Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}