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

    // Buscar perfil
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('perfis')
      .select('id, municipio_ativo_id, municipios!perfis_municipio_ativo_id_fkey (ibge, nome)')
      .eq('id', user.id)
      .single()

    if (perfilError || !perfil) {
      return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 })
    }

    const { id } = params
    const agora = new Date()

    // Verificar se pesquisa existe e está ativa
    const { data: pesquisa, error: pesquisaError } = await supabaseAdmin
      .from('pesquisas')
      .select('*')
      .eq('id', id)
      .eq('status', 'ATIVA')
      .single()

    if (pesquisaError || !pesquisa) {
      return NextResponse.json({ error: 'Pesquisa não encontrada ou não está ativa.' }, { status: 404 })
    }

    // Verificar elegibilidade
    let elegivel = false
    if (pesquisa.publico_alvo === 'TODOS') {
      elegivel = true
    } else if (pesquisa.publico_alvo === 'PERFIL_ESPECIFICO') {
      const { data: perfilCompleto } = await supabaseAdmin
        .from('perfis')
        .select('role')
        .eq('id', user.id)
        .single()
      elegivel = pesquisa.perfis_alvo?.includes(perfilCompleto?.role) || false
    } else if (pesquisa.publico_alvo === 'MUNICIPIOS_ESPECIFICOS') {
      elegivel = pesquisa.municipios_alvo?.includes(perfil.municipios?.ibge) || false
    }

    if (!elegivel) {
      return NextResponse.json({ error: 'Você não é elegível para esta pesquisa.' }, { status: 403 })
    }

    // Criar ou atualizar controle_usuario
    const { error: upsertError } = await supabaseAdmin
      .from('pesquisa_controle_usuario')
      .upsert({
        usuario_id: user.id,
        pesquisa_id: id,
        data_exibicao: agora.toISOString()
      }, {
        onConflict: 'usuario_id,pesquisa_id'
      })

    if (upsertError) {
      console.error('Erro ao atualizar controle:', upsertError)
      return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
    }

    // Criar resposta parcial
    const { data: resposta, error: respostaError } = await supabaseAdmin
      .from('pesquisa_respostas')
      .insert({
        pesquisa_id: id,
        usuario_id: user.id,
        municipio_ibge: perfil.municipios?.ibge || '',
        municipio_nome: perfil.municipios?.nome || '',
        status: 'PARCIAL',
        iniciada_em: agora.toISOString(),
        versao_sistema: '1.0.0' // TODO: pegar da config
      })
      .select()
      .single()

    if (respostaError) {
      console.error('Erro ao criar resposta:', respostaError)
      return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, resposta_id: resposta.id })

  } catch (error) {
    console.error('Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}