-- =============================================================================
-- migration_001_sugestoes.sql
-- Tabela: sugestoes — Central de Sugestões do VigiaSaúde
--
-- Migration REVERSÍVEL:
--   Para aplicar  → execute este arquivo no SQL Editor do Supabase
--   Para reverter → execute o bloco ROLLBACK no final deste arquivo
--
-- Idempotente: pode ser executado múltiplas vezes sem erro (IF NOT EXISTS).
-- =============================================================================

-- Extensão UUID (geralmente já existe no Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- TABELA PRINCIPAL
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sugestoes (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id        UUID          NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  municipio_ibge    VARCHAR(7)    NOT NULL,
  municipio_nome    VARCHAR(255)  NOT NULL,
  titulo            VARCHAR(120)  NOT NULL,
  categoria         VARCHAR(50)   NOT NULL
    CHECK (categoria IN ('NOVO_GRAFICO','NOVA_ROTINA','MELHORIA','BUG','OUTRO')),
  descricao         TEXT          NOT NULL
    CHECK (char_length(descricao) <= 1000),
  status            VARCHAR(50)   NOT NULL DEFAULT 'NOVA'
    CHECK (status IN ('NOVA','EM_ANALISE','PLANEJADA','IMPLEMENTADA','DESCARTADA')),
  resposta_admin    TEXT,
  visualizada_admin BOOLEAN       NOT NULL DEFAULT FALSE,
  data_criacao      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  data_atualizacao  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ÍNDICES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sugestoes_usuario_id        ON sugestoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sugestoes_status            ON sugestoes(status);
CREATE INDEX IF NOT EXISTS idx_sugestoes_categoria         ON sugestoes(categoria);
CREATE INDEX IF NOT EXISTS idx_sugestoes_municipio_ibge    ON sugestoes(municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_sugestoes_visualizada_admin ON sugestoes(visualizada_admin);
CREATE INDEX IF NOT EXISTS idx_sugestoes_data_criacao      ON sugestoes(data_criacao DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER — atualiza data_atualizacao automaticamente em todo UPDATE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_sugestoes_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.data_atualizacao = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sugestoes_timestamp ON sugestoes;
CREATE TRIGGER trg_sugestoes_timestamp
  BEFORE UPDATE ON sugestoes
  FOR EACH ROW EXECUTE FUNCTION fn_update_sugestoes_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS (Row Level Security)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE sugestoes ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas (para re-execução segura)
DROP POLICY IF EXISTS "sugestoes_select_proprio"   ON sugestoes;
DROP POLICY IF EXISTS "sugestoes_insert_proprio"   ON sugestoes;
DROP POLICY IF EXISTS "sugestoes_admin_tudo"       ON sugestoes;

-- Usuário comum: lê apenas as próprias sugestões
CREATE POLICY "sugestoes_select_proprio" ON sugestoes
  FOR SELECT
  USING (auth.uid() = usuario_id);

-- Usuário comum: cria apenas as próprias sugestões
CREATE POLICY "sugestoes_insert_proprio" ON sugestoes
  FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

-- super_admin: acesso total (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "sugestoes_admin_tudo" ON sugestoes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM perfis
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO FINAL
-- Execute esta query para confirmar que a tabela foi criada corretamente:
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'sugestoes'
--   ORDER BY ordinal_position;
--
-- Deve retornar 11 colunas.
-- ─────────────────────────────────────────────────────────────────────────────


-- =============================================================================
-- ROLLBACK — execute apenas se quiser DESFAZER tudo
-- (copie e cole separadamente, não execute junto com o bloco acima)
-- =============================================================================
--
-- DROP TRIGGER IF EXISTS trg_sugestoes_timestamp ON sugestoes;
-- DROP FUNCTION IF EXISTS fn_update_sugestoes_timestamp();
-- DROP TABLE IF EXISTS sugestoes CASCADE;
--
-- =============================================================================
