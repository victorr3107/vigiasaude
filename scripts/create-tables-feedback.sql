-- =====================================================================================
-- create-tables-feedback.sql — Criação das tabelas para Central de Sugestões e Pesquisas
-- Vigia Saúde
--
-- Executar no painel SQL do Supabase (ou via CLI supabase db push se houver migrations).
-- Este script cria as tabelas com RLS habilitado.
-- =====================================================================================

-- Extensões necessárias (se não existirem)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────────────────────────────────────────────
-- TABELA: sugestoes
-- Central de Sugestões dos usuários
-- ──────────────────────────────────────────────────────────────────────────────────────
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
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM perfis
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Trigger para atualizar data_atualizacao
CREATE OR REPLACE FUNCTION update_sugestoes_data_atualizacao()
RETURNS TRIGGER AS $$
BEGIN
  NEW.data_atualizacao = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sugestoes_data_atualizacao
  BEFORE UPDATE ON sugestoes
  FOR EACH ROW EXECUTE FUNCTION update_sugestoes_data_atualizacao();

-- ──────────────────────────────────────────────────────────────────────────────────────
-- TABELA: pesquisas
-- Configuração das pesquisas de satisfação
-- ──────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pesquisas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo VARCHAR(120) NOT NULL,
  descricao TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'ATIVA', 'ENCERRADA', 'ARQUIVADA')),
  data_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
  data_fim TIMESTAMP WITH TIME ZONE NOT NULL,
  publico_alvo VARCHAR(50) NOT NULL DEFAULT 'TODOS' CHECK (publico_alvo IN ('TODOS', 'PERFIL_ESPECIFICO', 'MUNICIPIOS_ESPECIFICOS')),
  perfis_alvo TEXT[], -- Array de strings (roles)
  municipios_alvo TEXT[], -- Array de IBGEs
  permite_adiar BOOLEAN DEFAULT TRUE,
  dias_cooldown_adiar INTEGER DEFAULT 14 CHECK (dias_cooldown_adiar >= 0),
  exibir_apos_dias INTEGER DEFAULT 7 CHECK (exibir_apos_dias >= 0),
  criado_por UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pesquisas_status ON pesquisas(status);
CREATE INDEX IF NOT EXISTS idx_pesquisas_data_inicio ON pesquisas(data_inicio);
CREATE INDEX IF NOT EXISTS idx_pesquisas_data_fim ON pesquisas(data_fim);
CREATE INDEX IF NOT EXISTS idx_pesquisas_criado_por ON pesquisas(criado_por);

-- RLS: Apenas admins podem gerenciar pesquisas
ALTER TABLE pesquisas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins têm acesso total às pesquisas" ON pesquisas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM perfis
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Trigger para data_atualizacao
CREATE OR REPLACE FUNCTION update_pesquisas_data_atualizacao()
RETURNS TRIGGER AS $$
BEGIN
  NEW.data_atualizacao = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pesquisas_data_atualizacao
  BEFORE UPDATE ON pesquisas
  FOR EACH ROW EXECUTE FUNCTION update_pesquisas_data_atualizacao();

-- ──────────────────────────────────────────────────────────────────────────────────────
-- TABELA: pesquisa_perguntas
-- Perguntas de cada pesquisa
-- ──────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pesquisa_perguntas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pesquisa_id UUID NOT NULL REFERENCES pesquisas(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  texto VARCHAR(300) NOT NULL,
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('NPS', 'ESCALA', 'MULTIPLA_ESCOLHA', 'UNICA_ESCOLHA', 'TEXTO_LIVRE')),
  obrigatoria BOOLEAN DEFAULT FALSE,
  permite_pular BOOLEAN DEFAULT TRUE,
  opcoes JSONB, -- Para MULTIPLA_ESCOLHA e UNICA_ESCOLHA
  config JSONB, -- Para NPS e ESCALA
  data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pesquisa_perguntas_pesquisa_id ON pesquisa_perguntas(pesquisa_id);
CREATE INDEX IF NOT EXISTS idx_pesquisa_perguntas_ordem ON pesquisa_perguntas(ordem);

-- RLS: Herda da pesquisa (admins)
ALTER TABLE pesquisa_perguntas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins têm acesso total às perguntas" ON pesquisa_perguntas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM perfis p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────────────
-- TABELA: pesquisa_respostas
-- Respostas completas dos usuários
-- ──────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pesquisa_respostas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pesquisa_id UUID NOT NULL REFERENCES pesquisas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  municipio_ibge VARCHAR(6) NOT NULL,
  municipio_nome VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PARCIAL' CHECK (status IN ('COMPLETA', 'PARCIAL', 'RECUSADA', 'ADIADA', 'EXPIRADA')),
  iniciada_em TIMESTAMP WITH TIME ZONE,
  concluida_em TIMESTAMP WITH TIME ZONE,
  versao_sistema VARCHAR(50)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pesquisa_respostas_pesquisa_id ON pesquisa_respostas(pesquisa_id);
CREATE INDEX IF NOT EXISTS idx_pesquisa_respostas_usuario_id ON pesquisa_respostas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_pesquisa_respostas_status ON pesquisa_respostas(status);

-- RLS: Usuários veem suas próprias respostas; Admins veem tudo
ALTER TABLE pesquisa_respostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver suas próprias respostas" ON pesquisa_respostas
  FOR SELECT USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem criar suas próprias respostas" ON pesquisa_respostas
  FOR INSERT WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem atualizar suas próprias respostas" ON pesquisa_respostas
  FOR UPDATE USING (auth.uid() = usuario_id);

CREATE POLICY "Admins têm acesso total às respostas" ON pesquisa_respostas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM perfis p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────────────
-- TABELA: pesquisa_respostas_itens
-- Itens individuais das respostas
-- ──────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pesquisa_respostas_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resposta_id UUID NOT NULL REFERENCES pesquisa_respostas(id) ON DELETE CASCADE,
  pergunta_id UUID NOT NULL REFERENCES pesquisa_perguntas(id) ON DELETE CASCADE,
  valor_numerico FLOAT,
  valor_texto TEXT,
  valor_opcoes TEXT[], -- Array de strings
  pulada BOOLEAN DEFAULT FALSE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pesquisa_respostas_itens_resposta_id ON pesquisa_respostas_itens(resposta_id);
CREATE INDEX IF NOT EXISTS idx_pesquisa_respostas_itens_pergunta_id ON pesquisa_respostas_itens(pergunta_id);

-- RLS: Herda da resposta
ALTER TABLE pesquisa_respostas_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver seus próprios itens de resposta" ON pesquisa_respostas_itens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pesquisa_respostas pr
      WHERE pr.id = resposta_id AND pr.usuario_id = auth.uid()
    )
  );

CREATE POLICY "Usuários podem criar seus próprios itens de resposta" ON pesquisa_respostas_itens
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pesquisa_respostas pr
      WHERE pr.id = resposta_id AND pr.usuario_id = auth.uid()
    )
  );

CREATE POLICY "Usuários podem atualizar seus próprios itens de resposta" ON pesquisa_respostas_itens
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pesquisa_respostas pr
      WHERE pr.id = resposta_id AND pr.usuario_id = auth.uid()
    )
  );

CREATE POLICY "Admins têm acesso total aos itens de resposta" ON pesquisa_respostas_itens
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM perfis p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────────────
-- TABELA: pesquisa_controle_usuario
-- Controle de exibição por usuário
-- ──────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pesquisa_controle_usuario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  pesquisa_id UUID NOT NULL REFERENCES pesquisas(id) ON DELETE CASCADE,
  data_primeiro_acesso TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_exibicao TIMESTAMP WITH TIME ZONE,
  data_adiamento TIMESTAMP WITH TIME ZONE,
  total_adiamentos INTEGER DEFAULT 0,
  status_final VARCHAR(50) CHECK (status_final IN ('PENDENTE', 'RESPONDIDA', 'RECUSADA', 'EXPIRADA'))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pesquisa_controle_usuario_usuario_id ON pesquisa_controle_usuario(usuario_id);
CREATE INDEX IF NOT EXISTS idx_pesquisa_controle_usuario_pesquisa_id ON pesquisa_controle_usuario(pesquisa_id);
CREATE INDEX IF NOT EXISTS idx_pesquisa_controle_usuario_status_final ON pesquisa_controle_usuario(status_final);

-- Unique constraint: um controle por usuário por pesquisa
ALTER TABLE pesquisa_controle_usuario ADD CONSTRAINT unique_usuario_pesquisa UNIQUE (usuario_id, pesquisa_id);

-- RLS: Usuários veem seus próprios controles; Admins veem tudo
ALTER TABLE pesquisa_controle_usuario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver seus próprios controles" ON pesquisa_controle_usuario
  FOR SELECT USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem criar seus próprios controles" ON pesquisa_controle_usuario
  FOR INSERT WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem atualizar seus próprios controles" ON pesquisa_controle_usuario
  FOR UPDATE USING (auth.uid() = usuario_id);

CREATE POLICY "Admins têm acesso total aos controles" ON pesquisa_controle_usuario
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM perfis p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- =====================================================================================
-- FIM DO SCRIPT
-- =====================================================================================