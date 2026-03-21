import { NextRequest, NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

    const { id } = params
    const agora = new Date()

    // Verificar se pesquisa existe e permite adiamento
    const { data: pesquisa, error: pesquisaError } = await supabaseAdmin
      .from('pesquisas')
      .select('*')
      .eq('id', id)
      .eq('status', 'ATIVA')
      .single()

    if (pesquisaError || !pesquisa) {
      return NextResponse.json({ error: 'Pesquisa não encontrada ou não está ativa.' }, { status: 404 })
    }

    if (!pesquisa.permite_adiar) {
      return NextResponse.json({ error: 'Esta pesquisa não permite adiamento.' }, { status: 400 })
    }

    // Buscar total_adiamentos atual para incrementar manualmente
    const { data: controle } = await supabaseAdmin
      .from('pesquisa_controle_usuario')
      .select('total_adiamentos')
      .eq('usuario_id', user.id)
      .eq('pesquisa_id', id)
      .single()

    const totalAtual = controle?.total_adiamentos ?? 0

    const { error: updateError } = await supabaseAdmin
      .from('pesquisa_controle_usuario')
      .update({
        data_adiamento: agora.toISOString(),
        total_adiamentos: totalAtual + 1,
        status_final: 'PENDENTE',
      })
      .eq('usuario_id', user.id)
      .eq('pesquisa_id', id)

    if (updateError) {
      console.error('Erro ao atualizar controle:', updateError)
      return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}