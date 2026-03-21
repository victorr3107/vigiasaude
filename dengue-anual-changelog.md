# Dengue — Changelog de Expansão Nacional e Perfil Anual

## Fase A — Backend (scripts + JSONs)

**Data:** 2026-03-21

### Scripts alterados
- `scripts/processar_sinan_dengue.py`

### Mudanças principais

#### Expansão nacional
- `ler_csv()` passou a retornar todos os municípios do Brasil por padrão.
  Adicionado parâmetro `filtrar_sp=True` usado apenas em `sinan_dengue_semana_epidem.csv` e `sinan_dengue_mensal.csv` (sazonalidade SP — mantida por tamanho).

#### Nova função `ler_csvs_anuais()`
- Lê arquivos `dados_vigilancia/dengue/{prefixo}_{ano}.csv` para cada ano.
- Encoding **CP850** (codepage DOS/DATAPREV — diferente dos CSVs raiz que usam ISO-8859-1).
- Anos cobertos: 2022, 2023, 2024, 2025, 2026.

#### Novo JSON: `dengue_benchmarks_nacional.json`
- Substituiu `dengue_benchmarks_sp.json` (arquivo antigo pode coexistir como legado).
- Campos renomeados: `*_sp_*` → `*_brasil_*`.
- Escopo: Brasil inteiro (5514 municípios).
- Sazonalidade SP mantida internamente (único agregado disponível em escala SE).

#### Novo JSON: `dengue_perfil_anual.json` (42 MB)
- 5497 municípios × anos 2022–2026.
- Por ano: `mensal`, `evolucao`, `hospitalizacao`, `faixa_etaria`, `sexo`, `classificacao`.
- Variações calculadas: `variacao_hospitalizacao_2425_pp`, `variacao_letalidade_2425_pp`, `variacao_idosos_2425_pp`.
- Campos de destaque: `ano_maior_hospitalizacao`, `ano_maior_letalidade`.

#### JSONs mantidos (sem alteração de estrutura)
| Arquivo | Escopo | Tamanho |
|---|---|---|
| `dengue_historico_anual.json` | Brasil | 5,4 MB |
| `dengue_sazonalidade.json` | SP (645 mun.) | 8,2 MB |
| `dengue_perfil.json` | Brasil | 8,3 MB |

#### Validação final (Araçatuba 350280)
| Ano | Hosp % | Letal % | Faixa dom. |
|---|---|---|---|
| 2022 | 4,22 | 0,192 | adulto_jovem |
| 2023 | 4,90 | 0,360 | adulto_jovem |
| 2024 | 4,00 | 0,106 | adulto |
| 2025 | 5,12 | 0,081 | adulto_jovem |
| 2026 | 2,53 | 0,000 | adulto_jovem |

---

## Fase B — Frontend (dashboard)

**Data:** 2026-03-21

### Arquivos alterados
- `app/api/sinan/dengue/municipio/route.ts`
- `app/dashboard/vigilancia-dengue/page.tsx`

### API route (`route.ts`)
- Lê `dengue_benchmarks_nacional.json` com fallback para `dengue_benchmarks_sp.json` (retrocompatibilidade).
- Lê `dengue_perfil_anual.json` e retorna `perfil_anual` para o município requisitado.

### Interfaces TypeScript (`page.tsx`)
- `Benchmarks`: campos `*_sp_*` renomeados para `*_brasil_*`; versões `*_sp_*` mantidas como opcionais para retrocompatibilidade.
- Novas interfaces: `MensalAnual`, `AnoPerfilAnual`, `PerfilAnual`.
- `DadosDengue`: adicionado campo `perfil_anual: PerfilAnual | null`.

### Aba "Tendência Histórica"
- **Novo card "Sazonalidade Mensal por Ano"**: barras agrupadas meses × anos (2022–2025).
  Fonte: `dengue_perfil_anual.json` — dados reais mensais por município.
  Card só é exibido se `perfil_anual` tiver dados disponíveis (sem erro se ausente).

### Aba "Perfil dos Casos"
Cada seção ganhou toggle `[Acumulado histórico] / [Comparar por ano]`:

| Seção | Modo "Comparar por ano" |
|---|---|
| Classificação dos Casos | Line chart: % sinais de alarme + % dengue grave por ano (2022–2025). Narrativa variação 2024→2025. |
| Taxa de Letalidade | Line chart: taxa de letalidade por ano. Destaca ano de maior letalidade e variação 2024→2025 em pp. |
| Hospitalização | Line chart: taxa de hospitalização por ano, com linha de referência média BR. Narrativa variação. |
| Faixa Etária | Grouped bars: faixas (x) × anos (barras). Mostra faixa dominante 2025 e variação idosos 2024→2025. |
| Distribuição por Sexo | Tabela compacta: masc%/fem%/total por ano 2022–2025. |

### Labels atualizados
- "Média SP" → "Média BR" em todos os cards.
- "Comparativo com SP (base 100 em 2019)" → "Comparativo com BR (base 100 em 2019)".
- Linha "SP" no gráfico de comparativo → "Brasil".

### Regras respeitadas
- Nenhum município hardcoded: todos os dados vêm via `perfil_anual` do API.
- Campos ausentes omitidos sem erro (guards `?.` e `?? 0`).
- Toda funcionalidade existente mantida intacta.
- Toggle só aparece quando `perfil_anual` tem dados para o município (`temAnual` guard).
