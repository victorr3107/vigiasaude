# SIH/SUS — Morbidade Hospitalar — Changelog

**Data de implementação:** 2026-03-20
**Módulo:** Morbidade Hospitalar (SIH/SUS)
**Status geral:** ✅ Concluído

---

## Arquivos criados ou modificados

### Scripts de processamento
| Arquivo | Status | Descrição |
|---|---|---|
| `scripts/processar_sih.py` | ✅ Novo | Processa 12 CSVs TabNet/SIH, gera 8 JSONs em `dados_hospitalar/processados/` |

### Dados gerados (`dados_hospitalar/processados/`)
| Arquivo | Tamanho | Status |
|---|---|---|
| `sih_benchmarks.json` | 369 B | ✅ |
| `sih_carater.json` | 41 KB | ✅ |
| `sih_cir_evolucao.json` | 7,7 KB | ✅ |
| `sih_faixa_etaria.json` | 548 KB | ✅ |
| `sih_fluxo.json` | 1,1 MB | ✅ |
| `sih_perfil_municipio.json` | 146 KB | ✅ |
| `sih_por_cid.json` | 2,5 MB | ✅ |
| `sih_serie_mensal.json` | 647 KB | ✅ |

### Rotas API
| Arquivo | Status | Descrição |
|---|---|---|
| `app/api/sih/municipio/route.ts` | ✅ Novo | `GET /api/sih/municipio?ibge=XXXXXX` — filtra server-side, retorna dados do município |
| `app/api/sih/benchmarks/route.ts` | ✅ Novo | `GET /api/sih/benchmarks` — benchmarks SP + evolução CIR (~8 KB) |
| `app/api/sih/perfis/route.ts` | ✅ Novo | `GET /api/sih/perfis` — perfil completo de todos os municípios (146 KB) |

### Frontend
| Arquivo | Status | Descrição |
|---|---|---|
| `app/dashboard/morbidade-hospitalar/page.tsx` | ✅ Novo | Página principal com 6 componentes |
| `app/dashboard/layout.tsx` | ✅ Modificado | Adicionado ícone `IconHospital` e entrada na nav `NAV_DADOS` |

---

## Componentes da página (`page.tsx`)

| Componente | Status | Descrição |
|---|---|---|
| `SihKPIs` | ✅ | 4 cards: Volume, Perfil Assistencial, Mortalidade, Custo |
| `SihEvolucaoTemporal` | ✅ | AreaChart com filtro de período, custom dot pico/vale, mini BarChart CIR |
| `SihCausasInternacao` | ✅ | Tabela sortável (5 colunas), badge Cap 05, paginação mobile |
| `SihMortalidade` | ✅ | Barras horizontais com quartil de cor, expand-detalhe, Cap 05 separado |
| `SihPerfilPacientes` | ✅ | BarChart faixa etária (2 séries), barras de proporção caráter |
| `SihFluxoAssistencial` | ✅ | 3 versões condicionais: polo (>15%), misto (5–15%), dependente (<5%) |

---

## Totais de validação (Araçatuba — IBGE 350280)

| Métrica | Valor |
|---|---|
| Total internações | 54.039 |
| Taxa de mortalidade | 10,69% |
| Custo médio | R$ 3.293 |
| % externos | 31,7% |
| Ranking SP | #39 |
| CIR | 35021 / Central do DRS II |
| Perfil tags | POLO REGIONAL |
| Cid principal | Cap 09 (Ap. Circulatório) |
| A2 total = Perfil total | diff 0,0000% ✅ |
| Cap 05 permanência média | 47,6 dias vs 4,7 dias outros ✅ |

---

## Cenários de validação (Fase E)

| # | Cenário | Status |
|---|---|---|
| 1 | Município polo (>15% externos): versão polo receptor | ✅ |
| 2 | Município pequeno sem hospital: versão dependente | ✅ ⚠️ |
| 3 | Cap 05 — badge "longa perm." na tabela | ✅ |
| 4 | Trocar perspectiva global: dados atualizam | ✅ |
| 5 | Benchmark mortalidade: cor correta vs mediana SP | ✅ |
| 6 | Trocar município no header: dados recarregam | ✅ |
| 7 | Mobile 375px: scroll horizontal na tabela | ✅ |

⚠️ C2: municípios com zero internações locais (sem hospital) retornam 404 — comportamento aceitável, API exibe mensagem explicativa.

---

## CSVs de entrada (TabNet/SIH)

| Arquivo | Conteúdo |
|---|---|
| `A1_internacoes_mensais.csv` | Série mensal de internações por município |
| `A2_internacoes_por_capitulo_cid.csv` | Internações por capítulo CID-10 |
| `A3_obitos_por_capitulo_cid.csv` | Óbitos por capítulo CID-10 |
| `A4_dias_permanencia_por_cid.csv` | Dias de permanência por CID-10 |
| `A5_valor_total_por_cid.csv` | Valor total AIH por CID-10 |
| `A6_faixa_etaria.csv` | Internações por faixa etária |
| `A7_carater_internacao.csv` | Caráter (eletivo/urgência/acidente) |
| `A8_fluxo_internacao.csv` | Fluxo (origem dos pacientes por CIR) |
| `B1_internacoes_residencia.csv` | Internações por residência dos pacientes |
| `B2_obitos_residencia.csv` | Óbitos por residência |
| `B3_dias_permanencia_residencia.csv` | Permanência por residência |
| `B4_valor_residencia.csv` | Valor por residência |
