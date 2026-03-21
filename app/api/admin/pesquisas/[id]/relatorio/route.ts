import { NextRequest, NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

async function verificarAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.substring(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: perfil } = await supabaseAdmin
    .from('perfis').select('role').eq('id', user.id).single()
  if (!perfil || perfil.role !== 'super_admin') return null
  return user
}

// GET /api/admin/pesquisas/:id/relatorio
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verificarAdmin(req)
    if (!user) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

    // Dados da pesquisa
    const { data: pesquisa } = await supabaseAdmin
      .from('pesquisas')
      .select('*')
      .eq('id', params.id)
      .single()

    if (!pesquisa) return NextResponse.json({ error: 'Pesquisa não encontrada.' }, { status: 404 })

    // Perguntas ordenadas
    const { data: perguntas } = await supabaseAdmin
      .from('pesquisa_perguntas')
      .select('*')
      .eq('pesquisa_id', params.id)
      .order('ordem', { ascending: true })

    // Respostas completas com dados do município
    const { data: respostas } = await supabaseAdmin
      .from('pesquisa_respostas')
      .select('id, usuario_id, municipio_ibge, municipio_nome, status, iniciada_em, concluida_em')
      .eq('pesquisa_id', params.id)

    const totalRespostas = respostas?.length ?? 0
    const totalCompletas = respostas?.filter(r => r.status === 'COMPLETA').length ?? 0
    const totalRecusadas = respostas?.filter(r => r.status === 'RECUSADA').length ?? 0
    const totalAdiadas = respostas?.filter(r => r.status === 'ADIADA').length ?? 0

    const respostaIds = (respostas ?? []).filter(r => r.status === 'COMPLETA').map(r => r.id)

    // Itens de resposta para respostas completas
    const { data: itens } = respostaIds.length > 0
      ? await supabaseAdmin
          .from('pesquisa_respostas_itens')
          .select('*')
          .in('resposta_id', respostaIds)
      : { data: [] }

    // Resultados por pergunta
    const resultadosPorPergunta = (perguntas ?? []).map(pergunta => {
      const itensPerguntas = (itens ?? []).filter(i => i.pergunta_id === pergunta.id && !i.pulada)

      if (pergunta.tipo === 'NPS') {
        const valores = itensPerguntas
          .map(i => i.valor_numerico)
          .filter((v): v is number => v !== null && v !== undefined)
        const promotores = valores.filter(v => v >= 9).length
        const detratores = valores.filter(v => v <= 6).length
        const neutros = valores.filter(v => v === 7 || v === 8).length
        const total = valores.length
        const nps = total > 0 ? Math.round(((promotores - detratores) / total) * 100) : null
        const media = total > 0 ? valores.reduce((a, b) => a + b, 0) / total : null
        return {
          pergunta_id: pergunta.id,
          texto: pergunta.texto,
          tipo: pergunta.tipo,
          total_respostas: total,
          nps,
          media: media !== null ? Math.round(media * 10) / 10 : null,
          promotores,
          neutros,
          detratores,
          distribuicao: Array.from({ length: 11 }, (_, i) => ({
            valor: i,
            count: valores.filter(v => v === i).length,
          })),
        }
      }

      if (pergunta.tipo === 'ESCALA') {
        const valores = itensPerguntas
          .map(i => i.valor_numerico)
          .filter((v): v is number => v !== null && v !== undefined)
        const total = valores.length
        const media = total > 0 ? valores.reduce((a, b) => a + b, 0) / total : null
        const min = pergunta.config?.min ?? 1
        const max = pergunta.config?.max ?? 5
        return {
          pergunta_id: pergunta.id,
          texto: pergunta.texto,
          tipo: pergunta.tipo,
          total_respostas: total,
          media: media !== null ? Math.round(media * 10) / 10 : null,
          distribuicao: Array.from({ length: max - min + 1 }, (_, i) => ({
            valor: min + i,
            count: valores.filter(v => v === min + i).length,
          })),
        }
      }

      if (pergunta.tipo === 'MULTIPLA_ESCOLHA' || pergunta.tipo === 'UNICA_ESCOLHA') {
        const contagem: Record<string, number> = {}
        for (const item of itensPerguntas) {
          for (const opcao of (item.valor_opcoes ?? [])) {
            contagem[opcao] = (contagem[opcao] ?? 0) + 1
          }
        }
        return {
          pergunta_id: pergunta.id,
          texto: pergunta.texto,
          tipo: pergunta.tipo,
          total_respostas: itensPerguntas.length,
          opcoes: (pergunta.opcoes ?? []).map((op: { valor: string; rotulo: string }) => ({
            valor: op.valor,
            rotulo: op.rotulo,
            count: contagem[op.valor] ?? 0,
          })),
        }
      }

      if (pergunta.tipo === 'TEXTO_LIVRE') {
        return {
          pergunta_id: pergunta.id,
          texto: pergunta.texto,
          tipo: pergunta.tipo,
          total_respostas: itensPerguntas.length,
          respostas_texto: itensPerguntas
            .filter(i => i.valor_texto)
            .map(i => i.valor_texto as string),
        }
      }

      return { pergunta_id: pergunta.id, texto: pergunta.texto, tipo: pergunta.tipo, total_respostas: 0 }
    })

    // Evolução diária (respostas completas por data)
    const evolucaoDiaria: Record<string, number> = {}
    for (const r of (respostas ?? []).filter(r => r.status === 'COMPLETA' && r.concluida_em)) {
      const dia = r.concluida_em!.substring(0, 10)
      evolucaoDiaria[dia] = (evolucaoDiaria[dia] ?? 0) + 1
    }

    // Por município
    const porMunicipio: Record<string, { nome: string; count: number }> = {}
    for (const r of (respostas ?? []).filter(r => r.status === 'COMPLETA')) {
      const ibge = r.municipio_ibge ?? 'N/A'
      if (!porMunicipio[ibge]) porMunicipio[ibge] = { nome: r.municipio_nome ?? ibge, count: 0 }
      porMunicipio[ibge].count++
    }

    return NextResponse.json({
      pesquisa,
      kpis: {
        total_respostas: totalRespostas,
        total_completas: totalCompletas,
        total_recusadas: totalRecusadas,
        total_adiadas: totalAdiadas,
        taxa_conclusao: totalRespostas > 0 ? Math.round((totalCompletas / totalRespostas) * 100) : 0,
      },
      evolucao_diaria: Object.entries(evolucaoDiaria)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([data, count]) => ({ data, count })),
      por_municipio: Object.entries(porMunicipio)
        .sort(([, a], [, b]) => b.count - a.count)
        .map(([ibge, v]) => ({ ibge, nome: v.nome, count: v.count })),
      resultados_por_pergunta: resultadosPorPergunta,
    })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
