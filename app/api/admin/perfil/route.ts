import { NextRequest, NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── PATCH /api/admin/perfil ───────────────────────────────────────────────────
// Atualiza nome e/ou senha do usuário autenticado
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, nome, senhaAtual, novaSenha } = body

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID do usuário obrigatório.' }, { status: 400 })
  }

  // 1. Atualizar nome na tabela perfis
  if (nome) {
    if (typeof nome !== 'string' || nome.trim().length < 2) {
      return NextResponse.json({ error: 'Nome deve ter ao menos 2 caracteres.' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('perfis')
      .update({ nome: nome.trim() })
      .eq('id', id)

    if (error) {
      console.error('[PATCH /api/admin/perfil] nome:', error)
      return NextResponse.json({ error: 'Erro ao atualizar nome.' }, { status: 500 })
    }
  }

  // 2. Atualizar senha — exige verificação da senha atual
  if (novaSenha) {
    if (!senhaAtual) {
      return NextResponse.json({ error: 'Senha atual é obrigatória para alterar a senha.' }, { status: 400 })
    }
    if (typeof novaSenha !== 'string' || novaSenha.length < 8) {
      return NextResponse.json({ error: 'Nova senha deve ter ao menos 8 caracteres.' }, { status: 400 })
    }

    // Busca o email do usuário para verificar a senha atual
    const { data: perfil } = await supabaseAdmin
      .from('perfis')
      .select('email')
      .eq('id', id)
      .single()

    if (!perfil?.email) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    }

    // Verifica se a senha atual está correta via signInWithPassword
    const { error: authErr } = await supabaseAdmin.auth.signInWithPassword({
      email: perfil.email,
      password: senhaAtual,
    })

    if (authErr) {
      return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 401 })
    }

    // Senha atual confirmada — aplica a nova senha
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password: novaSenha,
    })

    if (error) {
      console.error('[PATCH /api/admin/perfil] senha:', error)
      return NextResponse.json({ error: 'Erro ao atualizar senha.' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
