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

    // Buscar perfil do usuário
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('perfis')
      .select('id, role, municipio_ativo_id, municipios!perfis_municipio_ativo_id_fkey (ibge, nome)')
      .eq('id', user.id)
      .single()

    if (perfilError || !perfil) {
      return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 })
    }

    const agora = new Date()

    // Buscar pesquisas ativas dentro do período
    const { data: pesquisas, error: pesquisasError } = await supabaseAdmin
      .from('pesquisas')
      .select('*')
      .eq('status', 'ATIVA')
      .lte('data_inicio', agora.toISOString())
      .gte('data_fim', agora.toISOString())

    if (pesquisasError) {
      console.error('Erro ao buscar pesquisas:', pesquisasError)
      return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
    }

    if (!pesquisas || pesquisas.length === 0) {
      return NextResponse.json({ pesquisa: null, deve_exibir: false })
    }

    // Filtrar por público alvo
    let pesquisaCandidata = null

    for (const pesquisa of pesquisas) {
      let elegivel = false

      if (pesquisa.publico_alvo === 'TODOS') {
        elegivel = true
      } else if (pesquisa.publico_alvo === 'PERFIL_ESPECIFICO') {
        elegivel = pesquisa.perfis_alvo?.includes(perfil.role) || false
      } else if (pesquisa.publico_alvo === 'MUNICIPIOS_ESPECIFICOS') {
        elegivel = pesquisa.municipios_alvo?.includes(perfil.municipios?.ibge) || false
      }

      if (!elegivel) continue

      // Verificar controle_usuario
      const { data: controle, error: controleError } = await supabaseAdmin
        .from('pesquisa_controle_usuario')
        .select('*')
        .eq('usuario_id', user.id)
        .eq('pesquisa_id', pesquisa.id)
        .single()

      if (controleError && controleError.code !== 'PGRST116') { // PGRST116 = not found
        console.error('Erro ao buscar controle:', controleError)
        continue
      }

      // Se não existe controle, verificar se já está usando há tempo suficiente
      if (!controle) {
        const { data: primeiroAcesso } = await supabaseAdmin
          .from('perfis')
          .select('criado_em')
          .eq('id', user.id)
          .single()

        if (primeiroAcesso) {
          const diasDesdePrimeiroAcesso = Math.floor(
            (agora.getTime() - new Date(primeiroAcesso.criado_em).getTime()) / (1000 * 60 * 60 * 24)
          )

          if (diasDesdePrimeiroAcesso >= pesquisa.exibir_apos_dias) {
            pesquisaCandidata = pesquisa
            break
          }
        }
        continue
      }

      // Se já respondeu ou recusou, não exibir
      if (controle.status_final === 'RESPONDIDA' || controle.status_final === 'RECUSADA') {
        continue
      }

      // Se foi expirada, não exibir
      if (controle.status_final === 'EXPIRADA') {
        continue
      }

      // Verificar cooldown de adiamento
      if (controle.data_adiamento) {
        const diasDesdeAdiamento = Math.floor(
          (agora.getTime() - new Date(controle.data_adiamento).getTime()) / (1000 * 60 * 60 * 24)
        )

        if (diasDesdeAdiamento < pesquisa.dias_cooldown_adiar) {
          continue
        }
      }

      // Se chegou aqui, pode exibir
      pesquisaCandidata = pesquisa
      break
    }

    if (!pesquisaCandidata) {
      return NextResponse.json({ pesquisa: null, deve_exibir: false })
    }

    // Buscar perguntas da pesquisa
    const { data: perguntas, error: perguntasError } = await supabaseAdmin
      .from('pesquisa_perguntas')
      .select('*')
      .eq('pesquisa_id', pesquisaCandidata.id)
      .order('ordem')

    if (perguntasError) {
      console.error('Erro ao buscar perguntas:', perguntasError)
      return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
    }

    return NextResponse.json({
      pesquisa: {
        ...pesquisaCandidata,
        perguntas: perguntas || []
      },
      deve_exibir: true
    })

  } catch (error) {
    console.error('Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}