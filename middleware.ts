// ─────────────────────────────────────────────────────────────────────────────
// middleware.ts — Proteção de rotas + refresh de sessão Supabase
//
// Regras:
//   /dashboard/*        → exige sessão válida (redireciona para / se não)
//   /api/admin/*        → exige sessão válida (retorna 401 se não)
//   /api/dashboard/*    → exige sessão válida (retorna 401 se não)
//   Rotas admin-only    → exige role super_admin (401/redirect se role menor)
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Rotas que só super_admin pode acessar
const SUPER_ADMIN_ROUTES = [
  '/dashboard/usuarios',
  '/dashboard/municipios',
  '/api/admin/usuarios',
  '/api/admin/municipios',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApiRoute = pathname.startsWith('/api/')

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Cria cliente Supabase com cookies (refresh automático do token)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANTE: Use getUser() ao invés de getSession() para segurança.
  // getUser() valida o token no servidor Supabase Auth.
  // getSession() não valida o JWT, apenas lê do cookie.
  const { data: { user } } = await supabase.auth.getUser()

  // ── Sem usuário autenticado → bloqueia ────────────────────────────────────
  if (!user) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }
    const loginUrl = new URL('/', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── Verifica role para rotas restritas ────────────────────────────────────
  const isRestrita = SUPER_ADMIN_ROUTES.some(r => pathname.startsWith(r))

  if (isRestrita) {
    const { data: perfil } = await supabase
      .from('perfis')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!perfil || perfil.role !== 'super_admin') {
      if (isApiRoute) {
        return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/admin/:path*',
    '/api/dashboard/:path*',
  ],
}
