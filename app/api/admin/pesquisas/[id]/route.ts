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

// GET /api/admin/pesquisas/:id — retorna pesquisa + perguntas
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verificarAdmin(req)
    if (!user) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

    const { data: pesquisa } = await supabaseAdmin
      .from('pesquisas')
      .select('*')
      .eq('id', params.id)
      .single()

    if (!pesquisa) return NextResponse.json({ error: 'Pesquisa não encontrada.' }, { status: 404 })

    const { data: perguntas } = await supabaseAdmin
      .from('pesquisa_perguntas')
      .select('*')
      .eq('pesquisa_id', params.id)
      .order('ordem', { ascending: true })

    return NextResponse.json({ ...pesquisa, perguntas: perguntas ?? [] })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// PATCH /api/admin/pesquisas/:id — atualiza config da pesquisa (só RASCUNHO)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verificarAdmin(req)
    if (!user) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

    const { data: atual } = await supabaseAdmin
      .from('pesquisas').select('status').eq('id', params.id).single()

    if (!atual) return NextResponse.json({ error: 'Pesquisa não encontrada.' }, { status: 404 })
    if (atual.status !== 'RASCUNHO') {
      return NextResponse.json({ error: 'Só é possível editar pesquisas em RASCUNHO.' }, { status: 400 })
    }

    const body = await req.json()
    const {
      titulo, descricao, data_inicio, data_fim,
      publico_alvo, perfis_alvo, municipios_alvo,
      permite_adiar, dias_cooldown_adiar, exibir_apos_dias,
    } = body

    const updates: Record<string, unknown> = {}
    if (titulo !== undefined) {
      if (!titulo.trim() || titulo.length > 120)
        return NextResponse.json({ error: 'Título inválido (máx 120 caracteres).' }, { status: 400 })
      updates.titulo = titulo.trim()
    }
    if (descricao !== undefined) updates.descricao = descricao?.trim() || null
    if (data_inicio !== undefined) updates.data_inicio = data_inicio
    if (data_fim !== undefined) updates.data_fim = data_fim
    if (publico_alvo !== undefined) {
      const validos = ['TODOS', 'PERFIL_ESPECIFICO', 'MUNICIPIOS_ESPECIFICOS']
      if (!validos.includes(publico_alvo))
        return NextResponse.json({ error: 'Público alvo inválido.' }, { status: 400 })
      updates.publico_alvo = publico_alvo
    }
    if (perfis_alvo !== undefined) updates.perfis_alvo = perfis_alvo
    if (municipios_alvo !== undefined) updates.municipios_alvo = municipios_alvo
    if (permite_adiar !== undefined) updates.permite_adiar = permite_adiar
    if (dias_cooldown_adiar !== undefined) updates.dias_cooldown_adiar = dias_cooldown_adiar
    if (exibir_apos_dias !== undefined) updates.exibir_apos_dias = exibir_apos_dias

    const { data: atualizada, error } = await supabaseAdmin
      .from('pesquisas').update(updates).eq('id', params.id).select().single()

    if (error) return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
    return NextResponse.json(atualizada)
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
