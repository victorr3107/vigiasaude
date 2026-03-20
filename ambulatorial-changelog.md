# Changelog — Módulo Produção Ambulatorial

**Data:** 2026-03-19
**Escopo:** `app/dashboard/producao-ambulatorial/` + pipeline de dados

---

## Arquivos criados / modificados

### `scripts/processar_ambulatorial.py` *(novo)*
- Parser universal `parse_tabnet()` — encoding windows-1252, traço=zero, ponto=milhar, vírgula=decimal
- Lê os 9 CSVs de `dados_ambulatorial/`
- Gera 6 JSONs em `dados_ambulatorial/processados/`
- Nota: `complexidade_sp_2024.csv` e `complexidade_sp_2025.csv` não existem no projeto → totais anuais derivados dos mensais B1+B2+B3

### `app/api/ambulatorial/municipio/route.ts` *(novo)*
- `GET /api/ambulatorial/municipio?ibge=XXXXXX`
- Filtra server-side os JSONs grandes (serie_temporal 5MB, complexidade_mensal 2.8MB)
- Retorna: `{ ibge, serie, complexidade, carater, forma, perfil }`
- Cache: `s-maxage=3600, stale-while-revalidate=86400`

### `app/api/ambulatorial/perfis/route.ts` *(novo)*
- `GET /api/ambulatorial/perfis`
- Serve `perfil_municipio.json` completo (287KB) — usado no scatter comparativo

### `app/api/ambulatorial/benchmarks/route.ts` *(novo)*
- `GET /api/ambulatorial/benchmarks`
- Serve `benchmarks_sp.json` (3KB) — estatísticas estaduais + lista POLO_AC

### `app/dashboard/producao-ambulatorial/page.tsx` *(reescrita completa)*
- Substituiu versão baseada em Supabase por versão baseada em JSONs locais
- Mecanismo de escopo: `key={perfil.municipio_ativo_id}` no layout + `useEffect` no mount (mesmo padrão do SISAB)
- Seletor de ano LOCAL: 2024 | 2025 | Comparar 2024 vs 2025

---

## JSONs gerados em `dados_ambulatorial/processados/`

| Arquivo | Tamanho | Municípios | Conteúdo |
|---|---|---|---|
| `serie_temporal.json` | 5.091 KB | 642 | Série mensal: qtd, valor, glosa, ticket, var_mom |
| `complexidade_mensal.json` | 2.844 KB | 642 | AB/MC/AC por mês + sazonalidade |
| `perfil_municipio.json` | 287 KB | 642 | Perfil, rankings, quartis, variações anuais |
| `carater_atendimento.json` | 113 KB | 642 | Eletivo, urgência, acidentes, BPA Consolidado |
| `forma_organizacao.json` | 1.286 KB | 642 | 9 grupos de procedimentos + top 5 subgrupos |
| `benchmarks_sp.json` | 3 KB | — | Estatísticas estaduais + lista POLO_AC (21 municípios) |

---

## Validação Araçatuba (IBGE 350280)

| Dado | Valor apurado | Referência spec |
|---|---|---|
| qtd_aprovada 2025 | **19.353.554** | ~19.350.000 (tolerância 0,5%) ✅ |
| valor_aprovado 2025 | R$ 70.889.852,57 | — |
| var_2425 | +9,86% | — |
| Perfil 2025 | **POLO_AC** (82,16% AC) | — |
| Ranking total SP | **#19** | — |
| Quartil de volume | **4** (top 25%) | — |
| Pico AC histórico | **Out/2025** — 1.467.138 proc. | — |
| Complexidade 2025 | AB=456.182 · MC=2.772.647 · AC=15.900.346 | — |

---

## Componentes implementados

| Componente | Status | Fonte de dados |
|---|---|---|
| `AmbKPIs` — 4 cards (Volume, Perfil, Ticket, Glosa) | ✅ Implementado | serie_temporal + perfil_municipio + benchmarks_sp |
| `AmbEvolucaoTotal` — Linha + área + toggle glosa + marcadores | ✅ Implementado | serie_temporal |
| `AmbEvolucaoComplexidade` — 3 linhas separadas + sazonalidade + variação anual | ✅ Implementado | complexidade_mensal |
| `AmbCaraterOrganizacao` — 2 colunas: barras horizontais + expandir subgrupos | ✅ Implementado | carater_atendimento + forma_organizacao |
| `AmbFinanceiro` — Resumo financeiro + gráfico barras mensais | ✅ Implementado | serie_temporal (colunas de valor) |
| `AmbComparativo` — Scatter de peers com mesmo perfil | ✅ Implementado | perfil_municipio + benchmarks_sp |

---

## Layout da página

| Linha | Desktop (≥ 1280px) | Mobile (< 768px) |
|---|---|---|
| 1 | `AmbKPIs` — 4 cards (auto-fit) | Empilhado 2×2 |
| 2 | `AmbEvolucaoComplexidade` — largura total | Largura total |
| 3 | `AmbEvolucaoTotal` (55%) + `AmbFinanceiro` (45%) | Empilhado |
| 4 | `AmbCaraterOrganizacao` (50%) + `AmbComparativo` (50%) | Empilhado |

---

## O que NÃO foi implementado

| Feature | Motivo |
|---|---|
| Linha de tendência suavizada (regressão) no AmbFinanceiro | Recharts não tem suporte nativo; alternativa: calcular manualmente — postergado |
| Rótulo de valor no último ponto de cada linha (AmbEvolucaoComplexidade) | `LabelList` em `Area` tem suporte limitado no Recharts; omitido para evitar erro de tipo |
| Scatter com tamanho variável de ponto por % AC | `Scatter` no Recharts não suporta `r` dinâmico sem wrapper customizado — ponto fixo usado |
| Comparação "Comparar 2024 vs 2025" renderizando ambos no mesmo gráfico | Seletor existe e filtra dados corretamente; exibição dual-year nos gráficos de linha seria extensão futura |

---

## Nota sobre forma_organizacao

Os grupos no CSV seguem a tabela SIGTAP real:
- Grupo 06 = **Medicamentos** (não "Obstétrica e Neonatal" como descrito no spec)
- O agrupamento por prefixo 2 dígitos foi implementado conforme especificado
- Renomear os grupos para refletir o SIGTAP real é possível ajustando `GRUPOS_FORM_ORG` no script

---

## Build

```
✓ Compiled successfully in 11.8s
├ ƒ /api/ambulatorial/benchmarks
├ ƒ /api/ambulatorial/municipio
├ ƒ /api/ambulatorial/perfis
└ ○ /dashboard/producao-ambulatorial
```
