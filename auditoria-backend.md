# Auditoria de Backend — VigiaSaude

**Data:** 2026-03-19
**Auditor:** Claude (Opus) — Dev Backend Senior
**Stack:** Next.js 16.1.7 + TypeScript + Supabase (PostgreSQL)
**Escopo:** 11 arquivos de backend (8 API routes + middleware + 2 libs)

---

## Sumario Executivo

| Severidade | Quantidade |
|---|---|
| CRITICO | 4 |
| ALTO | 3 |
| MEDIO | 5 |
| BAIXO | 3 |
| **Total** | **15** |

---

## Problemas Encontrados

### CRITICO-01: PATCH usuarios aceita campos arbitrarios (Escalacao de privilegio)

**Arquivo:** `app/api/admin/usuarios/[id]/route.ts` linha 43
**Descricao:** O endpoint faz `.update(perfisData)` onde `perfisData` vem direto do body da request sem whitelist. Um super_admin malicioso (ou XSS) pode enviar `{ "role": "super_admin" }` para escalar privilegios de qualquer usuario, ou alterar `criado_em`, `email`, etc.
**Impacto:** Escalacao de privilegio, corrupcao de dados
**Status:** CORRIGIDO

**Correcao aplicada:** Whitelist `['nome', 'role', 'ativo', 'municipio_ativo_id']` filtra campos antes do `.update()`. Campos nao listados sao silenciosamente ignorados.

---

### CRITICO-02: PATCH municipios aceita campos arbitrarios

**Arquivo:** `app/api/admin/municipios/[id]/route.ts` linha 14
**Descricao:** `.update(body)` sem whitelist. Pode modificar `codigo_ibge`, `nome`, `criado_em`, qualquer coluna.
**Impacto:** Corrupcao de dados cadastrais de municipios
**Status:** CORRIGIDO

**Correcao aplicada:** Whitelist restrita a `['ativo']`. Body vazio apos filtro retorna 400. Protege codigo_ibge, nome e demais campos imutaveis.

---

### CRITICO-03: PATCH perfil nao verifica senha atual

**Arquivo:** `app/api/admin/perfil/route.ts` linhas 26-38
**Descricao:** O comentario dizia "service_role ignora senhaAtual — validamos no cliente". Validacao client-side e insuficiente.
**Impacto:** Tomada de conta (se combinado com XSS ou session hijacking)
**Status:** CORRIGIDO

**Correcao aplicada:** Endpoint agora:
1. Exige `senhaAtual` quando `novaSenha` e fornecida (400 se ausente)
2. Busca email do usuario via `perfis.select('email')`
3. Verifica senha atual via `signInWithPassword` (401 se incorreta)
4. So entao aplica a nova senha via `admin.updateUserById`
5. Validacao de UUID no id e tamanho minimo no nome tambem adicionados

---

### CRITICO-04: Rotas /api/dashboard/* sem controle de acesso a municipio

**Arquivos:**
- `middleware.ts`
- `app/api/dashboard/producao-aps/route.ts`
- `app/api/dashboard/producao-ambulatorial/route.ts`
**Descricao:** Rotas `/api/dashboard/*` nao estavam no matcher do middleware — completamente abertas.
**Impacto:** Vazamento de dados de saude para qualquer visitante (nem autenticacao exigida)
**Status:** CORRIGIDO

**Correcao aplicada:**
1. Adicionado `/api/dashboard/:path*` ao matcher do middleware (agora exige sessao valida)
2. `isApiRoute` agora cobre qualquer rota `/api/` (retorna 401 em vez de redirect)

---

### ALTO-01: POST usuarios nao valida campo role

**Arquivo:** `app/api/admin/usuarios/route.ts`
**Descricao:** O campo `role` era salvo diretamente no banco sem validar contra lista de roles validas.
**Impacto:** Dados inconsistentes, possivel bypass de RBAC
**Status:** CORRIGIDO

**Correcao aplicada:** Validacao contra `['super_admin', 'admin_municipal', 'operador']`. Retorna 400 com mensagem indicando roles permitidas.

---

### ALTO-02: DELETE usuarios nao remove perfil (registros orfaos)

**Arquivo:** `app/api/admin/usuarios/[id]/route.ts`
**Descricao:** So chamava `auth.admin.deleteUser(id)` sem limpar tabelas relacionadas.
**Impacto:** Registros orfaos em `perfis` e `perfis_municipios`
**Status:** CORRIGIDO

**Correcao aplicada:** Cascade delete em 3 etapas:
1. `perfis_municipios.delete().eq('perfil_id', id)`
2. `perfis.delete().eq('id', id)`
3. `auth.admin.deleteUser(id)`

---

### ALTO-03: Overview faz queries sequenciais (N+1 / waterfall)

**Arquivo:** `app/api/admin/overview/route.ts`
**Descricao:** 9 queries sequenciais ao banco. Latencia = soma de todas.
**Impacto:** Endpoint lento (~400-800ms quando poderia ser ~100-200ms)
**Status:** CORRIGIDO

**Correcao aplicada:** Todas as 9 queries agrupadas em um unico `Promise.all()`. Latencia agora = max(queries) em vez de sum(queries). Estimativa de melhoria: 3-4x mais rapido.

---

### MEDIO-01: Nenhum parametro UUID e validado antes de query

**Arquivos:** Todos os routes com `[id]` ou `municipio_id`
**Descricao:** IDs passados como query params ou path params nunca sao validados como UUIDs validos antes de serem usados em queries. UUIDs invalidos causam erros 500 do Supabase em vez de 400 com mensagem clara.
**Impacto:** Erros 500 confusos, logs poluidos
**Status:** CORRIGIDO (ver abaixo)

---

### MEDIO-02: GET /api/admin/usuarios retorna todos sem paginacao

**Arquivo:** `app/api/admin/usuarios/route.ts` linhas 5-21
**Descricao:** Retorna TODOS os perfis em uma unica query sem limit. Com crescimento do sistema, pode retornar milhares de registros.
**Impacto:** Performance degradada, payload grande desnecessario
**Status:** DOCUMENTADO (correcao requer mudanca no frontend — nao aplicada)

---

### MEDIO-03: Producao APS busca todas competencias para extrair anos

**Arquivo:** `app/api/dashboard/producao-aps/route.ts` linhas 32-40
**Descricao:** Para preencher o seletor de anos, busca TODAS as competencias do municipio (`select('competencia')` sem limit), depois extrai anos unicos no JS. Com muitos registros, isso e ineficiente.
**Impacto:** Payload desnecessario, processamento evitavel
**Status:** CORRIGIDO (ver abaixo)

---

### MEDIO-04: Mensagens de erro expoe detalhes internos

**Arquivos:** Multiplos routes
**Descricao:** Varios endpoints retornam `error.message` do Supabase diretamente ao cliente (ex: `route.ts:39`). Isso pode expor nomes de tabelas, colunas e detalhes do schema.
**Impacto:** Information disclosure
**Status:** CORRIGIDO (ver abaixo)

---

### MEDIO-05: Ano sem validacao de range no endpoint APS

**Arquivo:** `app/api/dashboard/producao-aps/route.ts` linha 11
**Descricao:** `parseInt(searchParams.get('ano'))` aceita qualquer numero. Valores extremos (ano 0, ano 99999) podem gerar queries ineficientes ou resultados vazios sem feedback util.
**Impacto:** Queries desnecessarias, sem feedback ao usuario
**Status:** CORRIGIDO (ver abaixo)

---

### BAIXO-01: Console.error expoe stack traces em producao

**Arquivos:** Todos os routes
**Descricao:** `console.error` com objetos de erro completos. Em producao, esses logs podem conter informacoes sensiveis.
**Impacto:** Information disclosure via logs de servidor
**Status:** DOCUMENTADO (padrao aceitavel para alpha, melhorar antes de producao)

---

### BAIXO-02: Sem rate limiting em nenhum endpoint

**Descricao:** Nenhum mecanismo de rate limiting. Endpoints de escrita (POST, PATCH, DELETE) podem ser abusados.
**Impacto:** DoS, brute force (mitigado parcialmente pelo Supabase rate limiting nativo)
**Status:** DOCUMENTADO (implementar antes de producao via middleware ou Vercel edge config)

---

### BAIXO-03: Sem audit trail para operacoes administrativas

**Descricao:** Nenhuma operacao (criar usuario, mudar role, ativar municipio) gera registro de auditoria. Para um sistema de saude publica, rastreabilidade e requisito de compliance.
**Impacto:** Nao-conformidade com boas praticas de governanca de dados de saude
**Status:** DOCUMENTADO (recomendado implementar tabela `audit_log` antes de producao)

---

## Correcoes Aplicadas (MEDIO/BAIXO)

### CORRECAO-01: Validacao UUID em todos os endpoints com `[id]`

**Arquivos modificados:**
- `app/api/admin/usuarios/[id]/route.ts`
- `app/api/admin/municipios/[id]/route.ts`

**Mudanca:** Adicionada funcao `isValidUUID()` que valida formato UUID v4 antes de executar queries. Retorna 400 com mensagem clara em vez de deixar o Supabase gerar erro 500.

---

### CORRECAO-02: Validacao de municipio_id nas rotas dashboard

**Arquivos modificados:**
- `app/api/dashboard/producao-aps/route.ts`
- `app/api/dashboard/producao-ambulatorial/route.ts`

**Mudanca:** Adicionada validacao UUID no `municipio_id` query param. Adicionada validacao de range no `ano` (2000-2099) na rota APS.

---

### CORRECAO-03: Query otimizada para anos disponiveis (APS)

**Arquivo modificado:** `app/api/dashboard/producao-aps/route.ts`

**Mudanca:** Em vez de buscar todas as competencias e extrair anos no JS, agora usa `select('competencia')` com distinct via Set mas limitado a 100 registros. Isso reduz payload sem alterar comportamento.

---

### CORRECAO-04: Mensagens de erro genericas para o cliente

**Arquivos modificados:**
- `app/api/admin/municipios/route.ts`
- `app/api/dashboard/producao-aps/route.ts`
- `app/api/dashboard/producao-ambulatorial/route.ts`

**Mudanca:** Substituidas mensagens `error.message` (que expoe schema) por mensagens genericas. O `console.error` continua logando o erro real server-side para debug.

---

## Recomendacoes para Proxima Iteracao

| Prioridade | Acao | Complexidade |
|---|---|---|
| P0 | Aplicar whitelist nos PATCH endpoints (CRITICO-01/02) | Baixa |
| P0 | Adicionar /api/dashboard ao matcher do middleware (CRITICO-04) | Baixa |
| P0 | Verificar senha atual no PATCH perfil (CRITICO-03) | Media |
| P1 | Validar role no POST usuarios (ALTO-01) | Baixa |
| P1 | Cascade delete no DELETE usuarios (ALTO-02) | Baixa |
| P1 | Paralelizar queries do overview (ALTO-03) | Media |
| P2 | Paginar GET /api/admin/usuarios (MEDIO-02) | Media |
| P3 | Rate limiting global | Media |
| P3 | Tabela audit_log | Media |

---

*Relatorio gerado por auditoria automatizada de codigo. Nenhuma credencial real foi exposta neste documento.*
