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

// PATCH /api/admin/pesquisas/:id/encerrar
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verificarAdmin(req)
    if (!user) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

    const { data: pesquisa } = await supabaseAdmin
      .from('pesquisas')
      .select('status')
      .eq('id', params.id)
      .single()

    if (!pesquisa) return NextResponse.json({ error: 'Pesquisa não encontrada.' }, { status: 404 })
    if (pesquisa.status !== 'ATIVA') {
      return NextResponse.json({ error: 'Apenas pesquisas ATIVAS podem ser encerradas.' }, { status: 400 })
    }

    // Expirar controles PENDENTES desta pesquisa
    await supabaseAdmin
      .from('pesquisa_controle_usuario')
      .update({ status_final: 'EXPIRADA' })
      .eq('pesquisa_id', params.id)
      .eq('status_final', 'PENDENTE')

    // Expirar respostas PARCIAIS desta pesquisa
    await supabaseAdmin
      .from('pesquisa_respostas')
      .update({ status: 'EXPIRADA' })
      .eq('pesquisa_id', params.id)
      .eq('status', 'PARCIAL')

    const { data: atualizada, error } = await supabaseAdmin
      .from('pesquisas')
      .update({ status: 'ENCERRADA' })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
    return NextResponse.json(atualizada)
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
