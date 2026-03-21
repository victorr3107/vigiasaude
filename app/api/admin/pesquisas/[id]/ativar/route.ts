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

// PATCH /api/admin/pesquisas/:id/ativar
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verificarAdmin(req)
    if (!user) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

    const { data: pesquisa } = await supabaseAdmin
      .from('pesquisas')
      .select('*')
      .eq('id', params.id)
      .single()

    if (!pesquisa) return NextResponse.json({ error: 'Pesquisa não encontrada.' }, { status: 404 })
    if (pesquisa.status !== 'RASCUNHO') {
      return NextResponse.json({ error: 'Apenas pesquisas em RASCUNHO podem ser ativadas.' }, { status: 400 })
    }

    // Validar: precisa ter ao menos 1 pergunta
    const { count } = await supabaseAdmin
      .from('pesquisa_perguntas')
      .select('*', { count: 'exact', head: true })
      .eq('pesquisa_id', params.id)

    if (!count || count === 0) {
      return NextResponse.json({ error: 'A pesquisa precisa ter ao menos uma pergunta antes de ser ativada.' }, { status: 400 })
    }

    // Validar: precisa ter data_inicio e data_fim
    if (!pesquisa.data_inicio || !pesquisa.data_fim) {
      return NextResponse.json({ error: 'A pesquisa precisa ter data de início e fim definidas.' }, { status: 400 })
    }

    if (new Date(pesquisa.data_fim) <= new Date(pesquisa.data_inicio)) {
      return NextResponse.json({ error: 'Data de fim deve ser posterior à data de início.' }, { status: 400 })
    }

    const { data: atualizada, error } = await supabaseAdmin
      .from('pesquisas')
      .update({ status: 'ATIVA' })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
    return NextResponse.json(atualizada)
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
