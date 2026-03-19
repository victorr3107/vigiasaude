import { NextRequest, NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const municipioId = new URL(req.url).searchParams.get('municipio_id') || null

  // ── helper: aplica filtro de município quando fornecido ───────────────────
  const prodBase = () => {
    const q = supabaseAdmin
      .from('sisab_producao_consolidada')
      .select('competencia, atendimento_individual, atendimento_odonto, procedimentos, visita_domiciliar')
    return municipioId ? q.eq('municipio_id', municipioId) : q
  }

  const anoAtual = new Date().getFullYear().toString()

  // ── Queries paralelas (independentes entre si) ────────────────────────────
  const [
    { count: totalUsuarios },
    { count: ativos },
    { count: inativos },
    { count: municipiosAtivos },
    { data: recentes },
    { data: producaoUltimo },
    { data: producaoAnterior },
    { data: hist6Desc },
    { data: anuais },
  ] = await Promise.all([
    // Contagens de usuários
    supabaseAdmin.from('perfis').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('perfis').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabaseAdmin.from('perfis').select('*', { count: 'exact', head: true }).eq('ativo', false),
    supabaseAdmin.from('municipios').select('*', { count: 'exact', head: true }).eq('ativo', true),
    // Usuários recentes
    supabaseAdmin
      .from('perfis')
      .select(`id, nome, email, role, ativo, criado_em, municipio_ativo_id,
        municipios!perfis_municipio_ativo_id_fkey ( id, nome )`)
      .order('criado_em', { ascending: false })
      .limit(5),
    // Produção: último mês
    prodBase().order('competencia', { ascending: false }).limit(1).maybeSingle(),
    // Produção: mês anterior
    prodBase().order('competencia', { ascending: false }).range(1, 1).maybeSingle(),
    // Histórico 6 meses
    prodBase().order('competencia', { ascending: false }).limit(6),
    // Dados do ano atual
    prodBase()
      .gte('competencia', `${anoAtual}-01`)
      .lte('competencia', `${anoAtual}-12`)
      .order('competencia', { ascending: true }),
  ])

  // ── Pós-processamento (leve, sem I/O) ─────────────────────────────────────
  const historico6m = (hist6Desc ?? []).reverse()

  let totalAnual = 0
  let melhorMes: { competencia: string; total: number } | null = null
  for (const p of anuais ?? []) {
    const t = p.atendimento_individual + p.atendimento_odonto + p.procedimentos + p.visita_domiciliar
    totalAnual += t
    if (!melhorMes || t > melhorMes.total) melhorMes = { competencia: p.competencia, total: t }
  }
  const mesesImportados = (anuais ?? []).map(p => parseInt(p.competencia.split('-')[1]))

  return NextResponse.json({
    usuarios: { total: totalUsuarios ?? 0, ativos: ativos ?? 0, inativos: inativos ?? 0 },
    municipiosAtivos: municipiosAtivos ?? 0,
    recentes: recentes ?? [],
    producao: { ultimo: producaoUltimo ?? null, anterior: producaoAnterior ?? null },
    historico6m,
    anual: {
      total: totalAnual,
      melhorMes,
      mesesComDados: mesesImportados.length,
      mesesImportados,
      anoAtual: parseInt(anoAtual),
    },
  })
}
