# SIASUS — Changelog de Expansão Nacional

## Fase A — Processamento (scripts/processar_siasus.py)

**Data:** 2026-03-21

### Script criado
- `scripts/processar_siasus.py` — gerador independente dos novos JSONs nacionais.
  Aceita argumentos posicionais: `python processar_siasus.py 1 2 3` gera apenas os JSONs indicados.

### Fontes (dados_ambulatorial/siasus/)
| Arquivo CSV | Conteúdo |
|---|---|
| `siasus_complexidade_[2022..2025].csv` | Município × AB/MC/AC/NA por ano |
| `siasus_carater_[2022..2025].csv` | Município × caráter de atendimento por ano |
| `siasus_forma_org_[2022..2025].csv` | Município × forma de organização por ano |
| `siasus_financiamento_[2022..2025].csv` | Município × fonte de financiamento por ano |
| `siasus_mensal_{ab,mc,ac}_nacional.csv` | Município × mês × qtd por complexidade |
| `siasus_qtd_aprovada_nacional.csv` | Município × mês × qtd aprovada |
| `siasus_qtd_apresentada_nacional.csv` | Município × mês × qtd apresentada |
| `siasus_valor_aprovado_nacional.csv` | Município × mês × valor aprovado |

### JSONs gerados (dados_ambulatorial/processados/)

| # | Arquivo | Municípios | Status |
|---|---------|-----------|--------|
| 1 | `siasus_complexidade_anual.json` | 5.552 | ✅ |
| 2 | `siasus_complexidade_mensal.json` | 5.420 | ✅ |
| 3 | `siasus_carater_anual.json` | 5.552 | ✅ |
| 4 | `siasus_forma_org_anual.json` | 5.552 | ✅ |
| 5 | `siasus_glosa_anual.json` | — | ⚠ CSV fonte ausente |
| 6 | `siasus_financiamento_anual.json` | 5.474 | ✅ |
| 7 | `siasus_tipo_prestador.json` | — | ⚠ CSV fonte ausente |
| 8 | `siasus_benchmarks_nacional.json` | 5.552 | ✅ |

### Correção aplicada
- `GRUPOS_FORM_ORG` corrigido de grupos legados (SP) para os 8 grupos padrão SIGTAP:
  `01=Promoção e Prevenção`, `02=Diagnóstico`, `03=Clínicas`, `04=Cirúrgicas`,
  `05=Transplante`, **`06=Medicamentos`** (antes: Obstétrica e Neonatal), `07=OPM`, `08=Ações Complementares`.

### Validação — Araçatuba (350280)

**complexidade_anual:**
| Ano | AB | MC | AC | %AC |
|-----|---|---|---|---|
| 2022 | 282.400 | 1.977.724 | 11.088.375 | 81,9% |
| 2023 | 327.953 | 2.189.841 | 12.968.107 | 83,1% |
| 2024 | 457.117 | 2.645.257 | 14.306.735 | 81,2% |
| 2025 | 456.182 | 2.769.623 | 15.900.391 | 82,2% |

`perfil_2025=POLO_AC` · `var_ac_2425=+11,14%`

**carater_anual:**
| Ano | Eletivo | % | Urgência | % |
|-----|---------|---|----------|---|
| 2022 | 11.432.435 | 84,5% | 34.201 | 0,3% |
| 2025 | 16.396.182 | 84,7% | 126.684 | 0,7% |

`var_urgencia_2425_pp = -0,15pp`

**financiamento_anual:**
| Ano | Total (R$) | Fonte dominante |
|-----|-----------|-----------------|
| 2022 | 50.593.809 | MAC (66,4%) |
| 2025 | 70.830.871 | MAC (56,3%) |

**benchmarks_nacional:**
- `qtd_mensal_media`: 1.612.796 — quartil 4 (top 25% nacional)
- `taxa_glosa`: 2,58% · mediana nacional: 1,15%
- `pct_ac`: 82,2% — quartil 4

---

## Fase B — Componentes Frontend

**Data:** 2026-03-21

### Arquivos alterados
- `app/api/ambulatorial/municipio/route.ts`
- `app/dashboard/producao-ambulatorial/page.tsx`

### API route (`route.ts`)
Carrega e retorna 3 novos JSONs por município:
- `siasus_complexidade_anual.json` → campo `complexidade_anual`
- `siasus_carater_anual.json` → campo `carater_anual`
- `siasus_financiamento_anual.json` → campo `financiamento_anual`

Todos opcionais com `??` fallback — sem quebra se arquivo ausente.

### Interfaces TypeScript novas (`page.tsx`)
```typescript
interface QtdPct { qtd: number; pct: number }

interface AnoComplexidade { ab: QtdPct; mc: QtdPct; ac: QtdPct; na: QtdPct; total: number }
interface ComplexidadeAnual {
  por_ano: Record<string, AnoComplexidade>
  var_ac_2425_pct: number | null
  var_mc_2425_pct: number | null
  var_ab_2425_pct: number | null
  perfil_2025: 'POLO_AC' | 'POLO_MC' | 'AB_DOMINANTE' | 'EQUILIBRADO'
}

interface AnoCarater { eletivo: QtdPct; urgencia: QtdPct; acidentes: QtdPct; bpa: QtdPct; total: number }
interface CaraterAnual {
  por_ano: Record<string, AnoCarater>
  var_urgencia_2425_pp: number | null
  var_eletivo_2425_pp: number | null
}

interface FonteFinanciamento { codigo: string; fonte: string; valor: number; pct: number }
interface FinanciamentoAnual {
  por_ano: Record<string, FonteFinanciamento[]>
  fonte_dominante_2025: string | null
  var_maior_fonte_2425_pct: number | null
}
```

### Aba "Visão Geral" — Card Glosa
- Adicionado **sparkline de 4 barras** (2022→2025) abaixo do valor de glosa atual.
- Calculado diretamente de `serie.por_mes` — média anual de `taxa_glosa_qtd` por ano.
- Barra de 2025 destacada na cor da classe de glosa; anos anteriores em cinza.

### Aba "Por Complexidade" — Toggle Mensal / Comparativo anual
- Toggle `[Mensal] [Comparativo anual]` aparece quando `complexidade_anual` tem ≥ 2 anos.
- **Modo "Comparativo anual"**: BarChart agrupado AB/MC/AC por ano (2022→2025).
- **Modo "Mensal"** (padrão): comportamento original preservado integralmente.
- Narrativa automática: `"AC cresceu/caiu X% de 2024 para 2025."`

### Aba "Financeiro" — Seção Fontes de Financiamento
- Adicionado **BarChart empilhado** por ano (2022→2025) com mix de fontes.
- Fonte dominante em 2025 e variação da maior fonte exibidas acima do gráfico.
- Exibido apenas quando `financiamento_anual` está disponível (guard implícito).

### Aba "Caráter e Organização" — Evolução do caráter por ano
- Adicionado **LineChart** com % eletivo e % urgência de 2022 a 2025.
- Alerta automático (box vermelho) quando urgência cresce > 5 pp de 2024 para 2025.
- Exibido apenas quando `carater_anual` tem ≥ 2 anos de dado.

### Constantes globais adicionadas
```typescript
const ANOS_COMPLEX = ['2022','2023','2024','2025']
const COR_COMPLEX: Record<string, string> = { ab: '...green', mc: '...blue', ac: '...purple' }
const CORES_FONTE: Record<string, string> = { '02': '...green', '04': '...purple', ... }
```

### Regras respeitadas
- Nenhum município hardcoded — todos os dados via estado global (`ibge` do perfil do usuário).
- Campos ausentes omitidos sem erro (guards `?.` e `?? null`).
- Toda funcionalidade existente das 5 abas mantida intacta.
- Toggle só aparece quando JSON tem dados para o município (`temAnualComplex` guard).
