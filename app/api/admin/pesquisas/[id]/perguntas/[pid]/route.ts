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

async function pesquisaEstaEmRascunho(pesquisaId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('pesquisas').select('status').eq('id', pesquisaId).single()
  return data?.status === 'RASCUNHO'
}

// PATCH /api/admin/pesquisas/:id/perguntas/:pid — edita pergunta (só RASCUNHO)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; pid: string } }
) {
  try {
    const user = await verificarAdmin(req)
    if (!user) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

    if (!(await pesquisaEstaEmRascunho(params.id))) {
      return NextResponse.json({ error: 'Só é possível editar pesquisas em RASCUNHO.' }, { status: 400 })
    }

    const body = await req.json()
    const { texto, tipo, obrigatoria, permite_pular, opcoes, config } = body

    const updates: Record<string, unknown> = {}
    if (texto !== undefined) {
      if (!texto.trim() || texto.length > 300) {
        return NextResponse.json({ error: 'Texto inválido (máx 300 caracteres).' }, { status: 400 })
      }
      updates.texto = texto.trim()
    }
    if (tipo !== undefined) {
      const tiposValidos = ['NPS', 'ESCALA', 'MULTIPLA_ESCOLHA', 'UNICA_ESCOLHA', 'TEXTO_LIVRE']
      if (!tiposValidos.includes(tipo)) {
        return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 })
      }
      updates.tipo = tipo
    }
    if (obrigatoria !== undefined) updates.obrigatoria = obrigatoria
    if (permite_pular !== undefined) updates.permite_pular = permite_pular
    if (opcoes !== undefined) updates.opcoes = opcoes
    if (config !== undefined) updates.config = config

    const { data: pergunta, error } = await supabaseAdmin
      .from('pesquisa_perguntas')
      .update(updates)
      .eq('id', params.pid)
      .eq('pesquisa_id', params.id)
      .select()
      .single()

    if (error || !pergunta) return NextResponse.json({ error: 'Pergunta não encontrada.' }, { status: 404 })
    return NextResponse.json(pergunta)
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// DELETE /api/admin/pesquisas/:id/perguntas/:pid — remove pergunta (só RASCUNHO)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; pid: string } }
) {
  try {
    const user = await verificarAdmin(req)
    if (!user) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

    if (!(await pesquisaEstaEmRascunho(params.id))) {
      return NextResponse.json({ error: 'Só é possível editar pesquisas em RASCUNHO.' }, { status: 400 })
    }

    const { data: pergunta } = await supabaseAdmin
      .from('pesquisa_perguntas')
      .select('ordem')
      .eq('id', params.pid)
      .eq('pesquisa_id', params.id)
      .single()

    if (!pergunta) return NextResponse.json({ error: 'Pergunta não encontrada.' }, { status: 404 })

    const { error } = await supabaseAdmin
      .from('pesquisa_perguntas')
      .delete()
      .eq('id', params.pid)
      .eq('pesquisa_id', params.id)

    if (error) return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })

    // Reordenar as restantes
    const { data: restantes } = await supabaseAdmin
      .from('pesquisa_perguntas')
      .select('id')
      .eq('pesquisa_id', params.id)
      .order('ordem', { ascending: true })

    if (restantes) {
      await Promise.all(
        restantes.map((p, i) =>
          supabaseAdmin.from('pesquisa_perguntas').update({ ordem: i }).eq('id', p.id)
        )
      )
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
