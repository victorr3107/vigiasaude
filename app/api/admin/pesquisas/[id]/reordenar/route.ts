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

// PATCH /api/admin/pesquisas/:id/reordenar
// Body: { ordem: ["uuid1", "uuid2", "uuid3"] } — array de IDs na nova ordem
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verificarAdmin(req)
    if (!user) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

    const { data: pesquisa } = await supabaseAdmin
      .from('pesquisas').select('status').eq('id', params.id).single()
    if (!pesquisa) return NextResponse.json({ error: 'Pesquisa não encontrada.' }, { status: 404 })
    if (pesquisa.status !== 'RASCUNHO') {
      return NextResponse.json({ error: 'Só é possível reordenar pesquisas em RASCUNHO.' }, { status: 400 })
    }

    const body = await req.json()
    const { ordem } = body

    if (!Array.isArray(ordem) || ordem.length === 0) {
      return NextResponse.json({ error: 'Campo "ordem" deve ser array de IDs.' }, { status: 400 })
    }

    await Promise.all(
      ordem.map((pid: string, i: number) =>
        supabaseAdmin
          .from('pesquisa_perguntas')
          .update({ ordem: i })
          .eq('id', pid)
          .eq('pesquisa_id', params.id)
      )
    )

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
