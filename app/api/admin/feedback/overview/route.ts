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

async function calcularNPS(pesquisaId: string): Promise<number | null> {
  // Buscar perguntas do tipo NPS desta pesquisa
  const { data: perguntas } = await supabaseAdmin
    .from('pesquisa_perguntas')
    .select('id')
    .eq('pesquisa_id', pesquisaId)
    .eq('tipo', 'NPS')

  if (!perguntas || perguntas.length === 0) return null

  // Buscar respostas completas da pesquisa
  const { data: respostas } = await supabaseAdmin
    .from('pesquisa_respostas')
    .select('id')
    .eq('pesquisa_id', pesquisaId)
    .eq('status', 'COMPLETA')

  if (!respostas || respostas.length === 0) return null

  const respostaIds = respostas.map(r => r.id)
  const perguntaIds = perguntas.map(p => p.id)

  // Buscar itens de resposta com valor_numerico
  const { data: itens } = await supabaseAdmin
    .from('pesquisa_respostas_itens')
    .select('valor_numerico')
    .in('resposta_id', respostaIds)
    .in('pergunta_id', perguntaIds)
    .eq('pulada', false)
    .not('valor_numerico', 'is', null)

  if (!itens || itens.length === 0) return null

  const valores = itens.map(i => i.valor_numerico as number)
  const total = valores.length
  const promotores = valores.filter(v => v >= 9).length
  const detratores = valores.filter(v => v <= 6).length

  return Math.round(((promotores - detratores) / total) * 100)
}

export async function GET(req: NextRequest) {
  try {
    const user = await verificarAdmin(req)
    if (!user) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

    // ── Sugestões ───────────────────────────────────────────────────────────

    const [
      { count: totalSugestoes },
      { count: novasSugestoes },
      { data: ultimaSugestao },
    ] = await Promise.all([
      supabaseAdmin.from('sugestoes').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('sugestoes').select('*', { count: 'exact', head: true }).eq('visualizada_admin', false),
      supabaseAdmin.from('sugestoes')
        .select('titulo, categoria, criado_em')
        .order('criado_em', { ascending: false })
        .limit(1)
        .single()
        .then(r => ({ data: r.data })),
    ])

    // ── Pesquisas ───────────────────────────────────────────────────────────

    const { data: todasPesquisas } = await supabaseAdmin
      .from('pesquisas')
      .select('id, titulo, status, data_fim')
      .in('status', ['ATIVA', 'ENCERRADA'])
      .order('data_fim', { ascending: false })

    const { count: totalRespostas } = await supabaseAdmin
      .from('pesquisa_respostas')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'COMPLETA')

    const { count: pesquisasAtivas } = await supabaseAdmin
      .from('pesquisas')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ATIVA')

    // NPS do último ciclo e variação
    let ultimoCiclo: { id: string; titulo: string; nps: number; total_completas: number } | null = null
    let variacaoNps: number | null = null

    if (todasPesquisas && todasPesquisas.length > 0) {
      // Buscar o ciclo mais recente que tenha perguntas NPS
      for (const p of todasPesquisas) {
        const nps = await calcularNPS(p.id)
        if (nps !== null) {
          const { count: totalCompletas } = await supabaseAdmin
            .from('pesquisa_respostas')
            .select('*', { count: 'exact', head: true })
            .eq('pesquisa_id', p.id)
            .eq('status', 'COMPLETA')

          ultimoCiclo = { id: p.id, titulo: p.titulo, nps, total_completas: totalCompletas ?? 0 }
          break
        }
      }

      // Variação: comparar com o ciclo anterior que também tenha NPS
      if (ultimoCiclo) {
        const restantes = todasPesquisas.filter(p => p.id !== ultimoCiclo!.id)
        for (const p of restantes) {
          const npsAnterior = await calcularNPS(p.id)
          if (npsAnterior !== null) {
            variacaoNps = ultimoCiclo.nps - npsAnterior
            break
          }
        }
      }
    }

    return NextResponse.json({
      sugestoes: {
        total: totalSugestoes ?? 0,
        novas: novasSugestoes ?? 0,
        ultima: ultimaSugestao ?? null,
      },
      pesquisas: {
        ativas: pesquisasAtivas ?? 0,
        total_respostas: totalRespostas ?? 0,
        ultimo_ciclo: ultimoCiclo,
        variacao_nps: variacaoNps,
      },
    })
  } catch (err) {
    console.error('Erro inesperado em feedback/overview:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
