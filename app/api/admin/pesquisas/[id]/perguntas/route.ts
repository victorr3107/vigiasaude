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

// GET /api/admin/pesquisas/:id/perguntas — lista perguntas da pesquisa
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verificarAdmin(req)
    if (!user) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

    const { data: perguntas, error } = await supabaseAdmin
      .from('pesquisa_perguntas')
      .select('*')
      .eq('pesquisa_id', params.id)
      .order('ordem', { ascending: true })

    if (error) return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
    return NextResponse.json(perguntas ?? [])
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// POST /api/admin/pesquisas/:id/perguntas — adiciona pergunta
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verificarAdmin(req)
    if (!user) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

    // Só permite adicionar perguntas em RASCUNHO
    const { data: pesquisa } = await supabaseAdmin
      .from('pesquisas').select('status').eq('id', params.id).single()
    if (!pesquisa) return NextResponse.json({ error: 'Pesquisa não encontrada.' }, { status: 404 })
    if (pesquisa.status !== 'RASCUNHO') {
      return NextResponse.json({ error: 'Só é possível editar pesquisas em RASCUNHO.' }, { status: 400 })
    }

    const body = await req.json()
    const { texto, tipo, obrigatoria, permite_pular, opcoes, config } = body

    if (!texto?.trim() || texto.length > 300) {
      return NextResponse.json({ error: 'Texto da pergunta inválido (máx 300 caracteres).' }, { status: 400 })
    }
    const tiposValidos = ['NPS', 'ESCALA', 'MULTIPLA_ESCOLHA', 'UNICA_ESCOLHA', 'TEXTO_LIVRE']
    if (!tiposValidos.includes(tipo)) {
      return NextResponse.json({ error: 'Tipo de pergunta inválido.' }, { status: 400 })
    }

    // Calcular próxima ordem
    const { count } = await supabaseAdmin
      .from('pesquisa_perguntas')
      .select('*', { count: 'exact', head: true })
      .eq('pesquisa_id', params.id)

    const { data: pergunta, error } = await supabaseAdmin
      .from('pesquisa_perguntas')
      .insert({
        pesquisa_id: params.id,
        ordem: (count ?? 0),
        texto: texto.trim(),
        tipo,
        obrigatoria: obrigatoria ?? true,
        permite_pular: permite_pular ?? false,
        opcoes: opcoes ?? null,
        config: config ?? null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
    return NextResponse.json(pergunta, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
