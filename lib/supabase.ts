import { createBrowserClient } from '@supabase/ssr'

// Cliente Supabase para uso no browser (client-side)
// Use createClient() para criar uma nova instância
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Singleton com lazy initialization para manter compatibilidade
// O cliente só é criado quando a propriedade é acessada
let _supabase: ReturnType<typeof createBrowserClient> | null = null

export const supabase = new Proxy({} as ReturnType<typeof createBrowserClient>, {
  get(_target, prop) {
    if (!_supabase) {
      _supabase = createClient()
    }
    return (_supabase as Record<string | symbol, unknown>)[prop]
  }
})
