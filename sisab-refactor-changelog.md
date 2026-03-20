# Changelog — Refatoração Tela Validação SISAB

**Data:** 2026-03-19
**Escopo:** `app/dashboard/validacao-sisab/` + pipeline de dados

---

## Arquivos modificados

### `scripts/processar_sisab.py`
- Adicionado acumulador `temporal_por_mun` (série mensal por município)
- Normalização de IBGE corrigida (float "355030.0" → string "355030")
- **Novo output 9:** `motivos_por_municipio.json` — dict `{ibge: {PROF, CNES, INE, CBO, MÚLTIPLOS, OUTROS}}`
  677 KB | 5.516 municípios com pelo menos 1 reprovação
- **Novo output 10:** `evolucao_por_municipio.json` — dict `{ibge: [{competencia, total, aprovado, reprovado, ...}]}`
  37 MB | 5.571 municípios × 27 competências (servido via API com filtro por IBGE)

### `app/api/sisab/[dataset]/route.ts`
- Adicionado `motivos_por_municipio` ao allowlist de datasets permitidos

### `app/api/sisab/municipio/route.ts`
- Resposta enriquecida com `principal_motivo` (derivado de `motivos_por_municipio.json`)
- Resposta enriquecida com `motivos` (breakdown por categoria do município)
- Leitura do novo JSON `motivos_por_municipio.json`

### `app/api/sisab/municipio/temporal/route.ts` *(novo)*
- `GET /api/sisab/municipio/temporal?ibge=XXXXXX`
- Lê `evolucao_por_municipio.json` (37MB) server-side e retorna apenas a série do município pedido
- Cache: `s-maxage=3600, stale-while-revalidate=86400`

### `app/dashboard/validacao-sisab/page.tsx`
Reescrita completa (1.082 → ~730 linhas efetivas, mais modular).

---

## Novos componentes e funcionalidades

### `FiltrosGlobais`
- Seletor de **Ano** (2024 / 2025 / 2026 / Todos os anos)
- Seletor de **Competência** (meses do ano selecionado, opção "Acumulado do período")
- Botão **"Comparar período anterior"** — ativa deltas ▲▼ nos KPIs
- Botão "Limpar filtros" condicional
- Todos os filtros propagados como props para todos os componentes filhos

### `KpisTopo` (4 cards reformulados)
| Card | Antes | Depois |
|------|-------|--------|
| Total fichas | — (inexistente) | Valor + delta vs período anterior se comparação ativa |
| Taxa aprovação | Inline no funil | Card dedicado com badge Excelente/Bom/Atenção/Crítico |
| Fichas reprovadas | — | Valor absoluto + % da base contabilizável + badge do motivo principal |
| Pendentes | Card "Competência de referência" | "Fichas em processamento" com nota contextual |

### `ResumoExecutivo` (parágrafo dinâmico)
Substituiu o resumo horizontal de KPIs por texto em prosa gerado em código:
_"Em Mar/26, Araçatuba enviou 25K fichas ao SISAB. 99,95% foram aprovadas..."_

### `EvolucaoTemporal` (refatoração completa)
- `ComposedChart` com eixo duplo: barras de volume (eixo direito) + linhas de taxa (eixo esquerdo)
- Linha verde espessa: aprovação efetiva
- Linha vermelha tracejada: reprovação
- Barras cinzas translúcidas: volume de fichas
- `ReferenceDot` marcando melhor (★) e pior (⚠) ponto da série
- `ReferenceDot` com label da média estadual (apenas quando município selecionado)
- Clicar em qualquer ponto seta o filtro de competência globalmente
- Narrativa dinâmica abaixo do gráfico com tendência dos últimos meses

### `MotivosReprovacao` (melhorias)
- **PROF** recebe cor vermelha (`var(--danger)`) para destaque
- `<LabelList>` do Recharts exibe percentual à direita de cada barra
- Insight textual contextual: "PROF é a causa de X em cada 10 reprovações"
- Nova aba **"O que fazer"**: tabela 4 colunas (Motivo | Fichas | O que causa | Como resolver)
- Aba temporal migrada de `LineChart` para `BarChart` empilhado por competência
- Com município selecionado: usa motivos do próprio município (não dados nacionais)

### `MunicipiosCard` (escopo correto por contexto)
**Visão município** (quando ctx ativo):
- Posição no ranking da UF em volume de reprovação
- 3 barras horizontais comparativas: município vs média UF vs média nacional
- Badge de classificação de risco (CRÍTICO/ALERTA/ATENÇÃO/OK)
- Alerta se o município está na lista dos 100 maiores em reprovação nacional

**Visão nacional** (sem município):
- Tabela com colunas: # | Município | UF | Enviadas | Reprovadas | Taxa | Causa | Risco
- Filtros de classificação: Todos (>5%) | CRÍTICO (>30%) | ALERTA (15–30%)
- Alerta contextual sobre Previne Brasil
- `RiscoBadge` em cada linha

### `PendentesCard` (ajuste de tom e comportamento)
- Quando zero pendentes: componente colapsado para uma linha verde "✓ Nenhuma ficha pendente"
- Quando tem pendentes: mostra competências afetadas e gráfico contextualizado
- Município selecionado no gráfico destacado com `var(--accent)`
- Removido gráfico de outras cidades quando contexto é município específico

### `ScopeBadge`
Novo componente de badge no cabeçalho indicando o escopo atual:
"Araçatuba — SP" ou "Brasil"

---

## Regra de escopo aplicada

| Componente | Visão Município | Visão Nacional |
|---|---|---|
| KPIs | Dados do município, filtrados por período | Dados nacionais filtrados por período |
| Resumo Executivo | Texto com nome do município | Texto com "o Brasil" |
| Evolução Temporal | Série do município + linha UF de referência | Série nacional |
| Motivos | Motivos do município (do novo JSON) | Motivos nacionais |
| Municípios | Posição + comparativo 3 barras | Tabela críticos com filtro de risco |
| Pendentes | Apenas do município (colapsado se zero) | Por UF + por município nacional |

---

## O que NÃO foi implementado (limitações dos dados)

| Feature | Motivo |
|---|---|
| Linha tracejada da UF no gráfico temporal por município | `por_uf.json` não tem série temporal — apenas acumulado total. A média da UF é exibida como referência estática via `ReferenceDot`. |
| Filtro temporal nos motivos por município | `motivos_por_municipio.json` armazena acumulado total, não por competência. Adicionaria ~150MB ao JSON. |
| Visão "UF" intermediária (sem município) | Sistema atual só tem visão municipal ou nacional. Adicionar seletor de UF no filtro global seria extensão futura. |
