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

    // Buscar pesquisas
    const { data: pesquisas, error } = await supabaseAdmin
      .from('pesquisas')
      .select('*')
      .order('data_criacao', { ascending: false })

    if (error) {
      console.error('Erro ao buscar pesquisas:', error)
      return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
    }

    // Para cada pesquisa, buscar totais de resposta
    const pesquisasComTotais = await Promise.all(
      (pesquisas || []).map(async (pesquisa) => {
        const { count: totalRespostas } = await supabaseAdmin
          .from('pesquisa_respostas')
          .select('*', { count: 'exact', head: true })
          .eq('pesquisa_id', pesquisa.id)

        const { count: totalCompletas } = await supabaseAdmin
          .from('pesquisa_respostas')
          .select('*', { count: 'exact', head: true })
          .eq('pesquisa_id', pesquisa.id)
          .eq('status', 'COMPLETA')

        return {
          ...pesquisa,
          total_respostas: totalRespostas || 0,
          total_completas: totalCompletas || 0
        }
      })
    )

    return NextResponse.json(pesquisasComTotais)

  } catch (error) {
    console.error('Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
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

    // Validar body
    const body = await req.json()
    const {
      titulo,
      descricao,
      data_inicio,
      data_fim,
      publico_alvo,
      perfis_alvo,
      municipios_alvo,
      permite_adiar,
      dias_cooldown_adiar,
      exibir_apos_dias
    } = body

    if (!titulo?.trim()) {
      return NextResponse.json({ error: 'Título é obrigatório.' }, { status: 400 })
    }

    if (titulo.length > 120) {
      return NextResponse.json({ error: 'Título muito longo.' }, { status: 400 })
    }

    if (!data_inicio || !data_fim) {
      return NextResponse.json({ error: 'Datas de início e fim são obrigatórias.' }, { status: 400 })
    }

    const dataInicio = new Date(data_inicio)
    const dataFim = new Date(data_fim)
    const agora = new Date()

    if (dataInicio < agora) {
      return NextResponse.json({ error: 'Data de início não pode ser no passado.' }, { status: 400 })
    }

    if (dataFim <= dataInicio) {
      return NextResponse.json({ error: 'Data de fim deve ser posterior à data de início.' }, { status: 400 })
    }

    const publicosValidos = ['TODOS', 'PERFIL_ESPECIFICO', 'MUNICIPIOS_ESPECIFICOS']
    if (!publicosValidos.includes(publico_alvo)) {
      return NextResponse.json({ error: 'Público alvo inválido.' }, { status: 400 })
    }

    // Criar pesquisa
    const { data: pesquisa, error: insertError } = await supabaseAdmin
      .from('pesquisas')
      .insert({
        titulo: titulo.trim(),
        descricao: descricao?.trim() || null,
        data_inicio: dataInicio.toISOString(),
        data_fim: dataFim.toISOString(),
        publico_alvo,
        perfis_alvo: publico_alvo === 'PERFIL_ESPECIFICO' ? perfis_alvo : null,
        municipios_alvo: publico_alvo === 'MUNICIPIOS_ESPECIFICOS' ? municipios_alvo : null,
        permite_adiar: permite_adiar ?? true,
        dias_cooldown_adiar: dias_cooldown_adiar ?? 14,
        exibir_apos_dias: exibir_apos_dias ?? 7,
        criado_por: user.id
      })
      .select()
      .single()

    if (insertError) {
      console.error('Erro ao criar pesquisa:', insertError)
      return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
    }

    return NextResponse.json(pesquisa)

  } catch (error) {
    console.error('Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}