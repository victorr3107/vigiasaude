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
    const body = await req.json()
    const { respostas } = body

    if (!Array.isArray(respostas)) {
      return NextResponse.json({ error: 'Respostas deve ser um array.' }, { status: 400 })
    }

    const agora = new Date()

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

    // Buscar resposta parcial do usuário
    const { data: respostaExistente, error: respostaError } = await supabaseAdmin
      .from('pesquisa_respostas')
      .select('*')
      .eq('pesquisa_id', id)
      .eq('usuario_id', user.id)
      .eq('status', 'PARCIAL')
      .single()

    if (respostaError || !respostaExistente) {
      return NextResponse.json({ error: 'Resposta parcial não encontrada.' }, { status: 404 })
    }

    // Processar respostas
    for (const resp of respostas) {
      const { pergunta_id, valor_numerico, valor_texto, valor_opcoes, pulada } = resp

      // Validar pergunta existe
      const { data: pergunta, error: perguntaError } = await supabaseAdmin
        .from('pesquisa_perguntas')
        .select('*')
        .eq('id', pergunta_id)
        .eq('pesquisa_id', id)
        .single()

      if (perguntaError || !pergunta) {
        return NextResponse.json({ error: `Pergunta ${pergunta_id} não encontrada.` }, { status: 400 })
      }

      // Validar resposta obrigatória
      if (pergunta.obrigatoria && pulada && !pergunta.permite_pular) {
        return NextResponse.json({ error: `Pergunta "${pergunta.texto}" é obrigatória.` }, { status: 400 })
      }

      // Inserir resposta da pergunta
      const { error: insertError } = await supabaseAdmin
        .from('pesquisa_respostas_itens')
        .insert({
          resposta_id: respostaExistente.id,
          pergunta_id,
          valor_numerico: pulada ? null : valor_numerico || null,
          valor_texto: pulada ? null : valor_texto || null,
          valor_opcoes: pulada ? null : valor_opcoes || null,
          pulada: pulada || false
        })

      if (insertError) {
        console.error('Erro ao inserir resposta:', insertError)
        return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
      }
    }

    // Atualizar resposta para COMPLETA
    const { error: updateRespostaError } = await supabaseAdmin
      .from('pesquisa_respostas')
      .update({
        status: 'COMPLETA',
        concluida_em: agora.toISOString()
      })
      .eq('id', respostaExistente.id)

    if (updateRespostaError) {
      console.error('Erro ao atualizar resposta:', updateRespostaError)
      return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
    }

    // Atualizar controle_usuario
    const { error: updateControleError } = await supabaseAdmin
      .from('pesquisa_controle_usuario')
      .update({ status_final: 'RESPONDIDA' })
      .eq('usuario_id', user.id)
      .eq('pesquisa_id', id)

    if (updateControleError) {
      console.error('Erro ao atualizar controle:', updateControleError)
      // Não é erro crítico, continua
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}