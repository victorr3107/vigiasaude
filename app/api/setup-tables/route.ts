'use server'

import { NextRequest, NextResponse } from 'next/server'
import supabaseAdmin from '@/lib/supabase-admin'

export async function POST() {
  try {
    // Script SQL para criar as tabelas
    const sql = `
-- Extensões necessárias (se não existirem)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TABELA: sugestoes
CREATE TABLE IF NOT EXISTS sugestoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  municipio_ibge VARCHAR(6) NOT NULL,
  municipio_nome VARCHAR(255) NOT NULL,
  titulo VARCHAR(120) NOT NULL,
  categoria VARCHAR(50) NOT NULL CHECK (categoria IN ('NOVO_GRAFICO', 'NOVA_ROTINA', 'MELHORIA', 'BUG', 'OUTRO')),
  descricao TEXT NOT NULL CHECK (LENGTH(descricao) <= 1000),
  status VARCHAR(50) NOT NULL DEFAULT 'NOVA' CHECK (status IN ('NOVA', 'EM_ANALISE', 'PLANEJADA', 'IMPLEMENTADA', 'DESCARTADA')),
  resposta_admin TEXT,
  data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  visualizada_admin BOOLEAN DEFAULT FALSE
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_sugestoes_usuario_id ON sugestoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sugestoes_status ON sugestoes(status);
CREATE INDEX IF NOT EXISTS idx_sugestoes_categoria ON sugestoes(categoria);
CREATE INDEX IF NOT EXISTS idx_sugestoes_municipio_ibge ON sugestoes(municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_sugestoes_visualizada_admin ON sugestoes(visualizada_admin);

-- RLS: Usuários veem apenas suas próprias sugestões; Admins veem tudo
ALTER TABLE sugestoes ENABLE ROW LEVEL SECURITY;

-- Política para usuários comuns (leitura própria)
CREATE POLICY "Usuários podem ver suas próprias sugestões" ON sugestoes
  FOR SELECT USING (auth.uid() = usuario_id);

-- Política para usuários comuns (inserção própria)
CREATE POLICY "Usuários podem criar suas próprias sugestões" ON sugestoes
  FOR INSERT WITH CHECK (auth.uid() = usuario_id);

-- Política para admins (tudo)
CREATE POLICY "Admins têm acesso total às sugestões" ON sugestoes
  FOR ALL USING (true);
`

    // Executar o SQL usando rpc (se disponível) ou tentar uma abordagem alternativa
    // Como o Supabase não suporta execução direta de DDL via cliente JS,
    // vamos tentar uma abordagem diferente

    // Primeiro, vamos verificar se conseguimos fazer uma query simples
    const { data: testData, error: testError } = await supabaseAdmin
      .from('perfis')
      .select('id')
      .limit(1)

    if (testError) {
      return NextResponse.json({
        error: 'Erro de conexão com o banco de dados',
        details: testError.message
      }, { status: 500 })
    }

    // Como não podemos executar DDL via cliente JS, vamos informar ao usuário
    // que precisa executar o script manualmente no painel do Supabase
    return NextResponse.json({
      message: 'Script SQL preparado. Execute manualmente no painel do Supabase.',
      sql: sql,
      instructions: '1. Acesse https://supabase.com/dashboard/project/ewsmydxoghwzjvuprjsa/sql\n2. Cole o SQL abaixo no editor\n3. Clique em "Run"'
    })

  } catch (error) {
    return NextResponse.json({
      error: 'Erro inesperado',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 })
  }
}