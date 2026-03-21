# Changelog — Melhorias Vigilância Dengue

Data: 2026-03-21

---

## Mudança 1 — Nome e ícone do módulo ✅

**Arquivos:** `app/dashboard/layout.tsx`

- Label sidebar: `"Vigilância Dengue"` → `"Vigilância"`
- Ícone: `IconActivity` (polyline ondulante) → `IconMosquito` (SVG customizado 24×24, stroke-based, mosquito de lado com corpo oval, asas, 4 pernas e probóscide)
- Título da página: `"Dengue — Vigilância Epidemiológica"` → `"Vigilância — Dengue"`

---

## Mudança 2 — Novo arquivo de dados ✅

**Arquivos:** `scripts/processar_sinan_dengue.py`, `dados_vigilancia/processados/dengue_semana_por_ano.json`

O arquivo `dados_vigilancia/sinan_dengue_semana_por_ano.csv` **existe** e foi processado.

**Estrutura do CSV:** Semana epidem. (linhas) × Anos desde `<1975` até `2026` (colunas).

**Descoberta crítica:** o CSV é **dados agregados nacionais (Brasil)** — não contém coluna de IBGE, portanto não é possível gerar dados por município. O JSON foi gerado como agregado nacional, com nota explícita na chave `_meta`.

**JSON gerado:** `dengue_semana_por_ano.json`
```json
{
  "_meta": {
    "nota": "Dados AGREGADOS — total geral (não por município)...",
    "anos_disponiveis": ["2019","2020","2021","2022","2023","2024","2025","2026"],
    "total_semanas": 53
  },
  "por_semana": [{ "semana": 1, "2019": 11449, "2024": 55477, ... }],
  "pico_por_ano": {
    "2024": { "semana": 12, "casos": 433513 },
    "2025": { "semana": 12, "casos": 90393 }
  }
}
```

**Validação dos picos:**
| Ano  | SE pico | Casos (Brasil) |
|------|---------|----------------|
| 2019 | SE 19   | 103.642        |
| 2022 | SE 18   | 103.833        |
| 2023 | SE 15   | 110.627        |
| 2024 | SE 12   | 433.513        |
| 2025 | SE 12   | 90.393         |
| 2026 | SE 9    | 22.923         |

Total 2024 (soma SEs): 6.569.315 → consistente com dado nacional brasileiro.

**API route atualizada:** `app/api/sinan/dengue/municipio/route.ts` — novo campo `semana_por_ano_nacional` na resposta.

---

## Mudança 3 — Componente DengueComparativoSemanal ✅

**Arquivo:** `app/dashboard/vigilancia-dengue/page.tsx`

Componente adicionado à **aba Tendência Histórica**, abaixo do gráfico de barras anuais.

**Visual:**
- Gráfico de linhas com múltiplas séries sobrepostas (semana × ano)
- Paleta de cores: cinza para 2019–2022, azul para 2023, âmbar para 2024, vermelho para 2025, cinza tracejado para 2026
- 2024 e 2025 com linha mais grossa (2.5px), anos anteriores mais finos (1px)

**Interatividade:**
- Pills de toggle por ano (padrão: 2023, 2024, 2025, 2026)
- Botão "Ver todos os anos" / "Menos anos"
- Linha vertical na SE atual (verde, do calendário)
- Marcadores de pico para 2024 e 2025 (abaixo do gráfico)
- Tooltip com casos de todos os anos visíveis naquela SE

**Narrativa dinâmica:** comparativo automático 2024 vs 2025 (pico semanal, superação ou não).

**Nota:** dados nacionais (Brasil) — label explícito no componente.

---

## Mudança 4 — Melhorias na aba Visão Geral ✅

**Arquivo:** `app/dashboard/vigilancia-dengue/page.tsx`

### 4A — Alerta sazonal movido para o topo ✅
- Era o último elemento; agora é o **primeiro** (antes dos KPIs)
- Borda esquerda colorida por fase: `border-left: 4px solid ${alertaCor}`
- Temporada ativa (SE 8–20): vermelho | Pré-temporada (SE 40–52): âmbar | Baixa (SE 21–39): verde

### 4B — Card "Pior Ano Histórico" com badge condicional ✅
- Detecta se `ano_pico` é o ano mais recente completo nos dados
- Quando sim: exibe badge `"Ano em andamento"` em âmbar
- Nota: Araçatuba com pico em 2025 exibirá este badge

### 4C — Mini sparklines nos KPIs ✅
- Componente `Sparkline({ valores, cor })` — SVG inline 64×22px, polyline
- Aplicado nos 4 cards usando `historico.por_ano` (anos completos)
- Sem eixos, sem labels — apenas a curva de tendência

### 4D — Card "Contexto Atual" ✅
- Exibe: SE atual + datas reais, fase da temporada
- Casos parciais de 2026 (se disponíveis)
- Comparativo simples: total 2025 e 2024 como referência
- Nota sobre atualização não em tempo real do SINAN

---

## Mudança 5 — Barras agrupadas por mês/ano na aba Sazonalidade ✅

**Arquivo:** `app/dashboard/vigilancia-dengue/page.tsx`

- Adicionado acima do gráfico semanal existente
- Barras agrupadas: eixo X = meses (Jan–Dez), grupos = anos (2022, 2023, 2024, 2025)
- Cores: 2022 cinza, 2023 azul, 2024 âmbar, 2025 vermelho
- Meses calculados a partir das semanas epidemiológicas via `calcMesesPorAno()`
- Dados nacionais (Brasil) — label explícito

---

## Observações técnicas

- **Erros TS pré-existentes preservados:** 10 erros no módulo Pesquisas (pre-existentes, fora de escopo)
- **Erro novo introduzido e corrigido:** `JSX.Element` em `sugestoes/page.tsx` → `React.ReactElement` + `import React`
- **Cache API:** `s-maxage=3600` mantido
- **Dark/light mode:** todos os componentes usam CSS variables (`var(--bg-modal)`, etc.)
- **TabNavigation:** preservado sem alterações
