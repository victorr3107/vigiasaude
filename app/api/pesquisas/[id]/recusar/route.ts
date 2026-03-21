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

    // Verificar se pesquisa existe
    const { data: pesquisa, error: pesquisaError } = await supabaseAdmin
      .from('pesquisas')
      .select('*')
      .eq('id', id)
      .eq('status', 'ATIVA')
      .single()

    if (pesquisaError || !pesquisa) {
      return NextResponse.json({ error: 'Pesquisa não encontrada ou não está ativa.' }, { status: 404 })
    }

    // Atualizar controle_usuario para RECUSADA
    const { error: updateError } = await supabaseAdmin
      .from('pesquisa_controle_usuario')
      .update({ status_final: 'RECUSADA' })
      .eq('usuario_id', user.id)
      .eq('pesquisa_id', id)

    if (updateError) {
      // Se não existe controle, criar um
      if (updateError.code === 'PGRST116') {
        const { error: insertError } = await supabaseAdmin
          .from('pesquisa_controle_usuario')
          .insert({
            usuario_id: user.id,
            pesquisa_id: id,
            status_final: 'RECUSADA'
          })

        if (insertError) {
          console.error('Erro ao criar controle:', insertError)
          return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
        }
      } else {
        console.error('Erro ao atualizar controle:', updateError)
        return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}