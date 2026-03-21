import { NextRequest, NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    // Verificar se é admin (middleware já protege, mas redundante)
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

    // Parâmetros de query
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const categoria = url.searchParams.get('categoria')
    const municipio = url.searchParams.get('municipio')
    const busca = url.searchParams.get('busca')
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Query base — inclui descricao e resposta_admin para o modal
    let query = supabaseAdmin
      .from('sugestoes')
      .select(`
        id, titulo, descricao, categoria, municipio_ibge, municipio_nome, status,
        resposta_admin, data_criacao, data_atualizacao, visualizada_admin,
        perfis!sugestoes_usuario_id_fkey (nome, email)
      `, { count: 'exact' })

    if (status) query = query.eq('status', status)
    if (categoria) query = query.eq('categoria', categoria)
    if (municipio) query = query.eq('municipio_ibge', municipio)
    if (busca) query = query.ilike('titulo', `%${busca}%`)

    // Buscar com paginação
    const { data: sugestoes, error, count } = await query
      .order('visualizada_admin', { ascending: true }) // Não visualizadas primeiro
      .order('data_criacao', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Erro ao buscar sugestões:', error)
      return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
    }

    // Marcar como visualizadas (se não eram)
    const idsNaoVisualizadas = sugestoes?.filter(s => !s.visualizada_admin).map(s => s.id) || []
    if (idsNaoVisualizadas.length > 0) {
      await supabaseAdmin
        .from('sugestoes')
        .update({ visualizada_admin: true })
        .in('id', idsNaoVisualizadas)
    }

    // Totais por status — 5 queries paralelas de contagem
    const statusList = ['NOVA', 'EM_ANALISE', 'PLANEJADA', 'IMPLEMENTADA', 'DESCARTADA'] as const
    const counts = await Promise.all(
      statusList.map(s =>
        supabaseAdmin
          .from('sugestoes')
          .select('*', { count: 'exact', head: true })
          .eq('status', s)
      )
    )
    const totaisPorStatus: Record<string, number> = {}
    statusList.forEach((s, i) => { totaisPorStatus[s] = counts[i].count || 0 })

    return NextResponse.json({
      sugestoes: sugestoes || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      },
      totais: totaisPorStatus
    })

  } catch (error) {
    console.error('Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}