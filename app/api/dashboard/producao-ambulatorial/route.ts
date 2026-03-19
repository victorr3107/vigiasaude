import { NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/dashboard/producao-ambulatorial?municipio_id=<uuid>
// Retorna os dados de 2024 e 2025 da tabela siasus_producao_complexidade
// com percentuais calculados por linha.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const municipio_id = searchParams.get('municipio_id')

  if (!municipio_id || !UUID_RE.test(municipio_id)) {
    return NextResponse.json({ error: 'municipio_id obrigatório e deve ser UUID válido.' }, { status: 400 })
  }

  // Busca o codigo_ibge do município para garantir o match mesmo quando
  // municipio_id está null na tabela siasus (ETL sem mapeamento)
  const { data: mun } = await supabaseAdmin
    .from('municipios')
    .select('codigo_ibge, nome, uf')
    .eq('id', municipio_id)
    .single()

  const ibge6 = mun?.codigo_ibge ? String(mun.codigo_ibge).slice(0, 6) : null

  // Query principal: by municipio_id OR por codigo_ibge (fallback)
  let query = supabaseAdmin
    .from('siasus_producao_complexidade')
    .select('municipio_id, codigo_ibge, nome_municipio, uf, ano, atencao_basica, media_complexidade, alta_complexidade, nao_se_aplica, total')
    .in('ano', [2024, 2025])
    .order('ano', { ascending: true })

  if (ibge6) {
    query = query.or(`municipio_id.eq.${municipio_id},codigo_ibge.eq.${ibge6}`)
  } else {
    query = query.eq('municipio_id', municipio_id)
  }

  const { data, error } = await query

  if (error) {
    console.error('[GET /api/dashboard/producao-ambulatorial]', error)
    return NextResponse.json({ error: 'Erro ao carregar dados ambulatoriais.' }, { status: 500 })
  }

  // Adiciona percentuais calculados por ano
  const dadosComPct = (data ?? []).map(row => {
    const total = row.total || 1
    return {
      ...row,
      nome_municipio: row.nome_municipio || mun?.nome || '—',
      uf:             row.uf             || mun?.uf   || '—',
      pct_atencao_basica:     +((row.atencao_basica     / total) * 100).toFixed(1),
      pct_media_complexidade: +((row.media_complexidade / total) * 100).toFixed(1),
      pct_alta_complexidade:  +((row.alta_complexidade  / total) * 100).toFixed(1),
      pct_nao_se_aplica:      +((row.nao_se_aplica      / total) * 100).toFixed(1),
    }
  })

  return NextResponse.json({ dados: dadosComPct })
}
