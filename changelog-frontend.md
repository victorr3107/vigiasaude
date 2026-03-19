# Changelog Frontend — UI/UX Improvements

**Data:** 2026-03-19
**Executor:** Claude (Opus) — Frontend Senior
**Base:** auditorias `auditoria-design.md` e `analise-narrativa-dados.md`
**Build:** Compilado com sucesso apos cada grupo de alteracoes

---

## Arquivos Modificados

| Arquivo | Resumo da alteracao |
|---|---|
| `app/globals.css` | Novos tokens `--chart-*` (6 cores dark/light), scrollbar Firefox, `--text-muted` dark com melhor contraste, `.action-btn` 44x44px, `.kpi-card` sem `translateY` no hover, padding padronizado 20px 24px |
| `app/page.tsx` (Login) | ~50 cores hardcoded substituidas por CSS variables, suporte completo dark/light mode, `aria-hidden` nos orbs decorativos |
| `app/dashboard/layout.tsx` | ~20 cores `#10B981` substituidas por `var(--accent)`, gradientes e spinners com tokens, logout hover com `var(--danger-subtle)` |
| `app/dashboard/page.tsx` (Visao Geral) | KPI cores via `var(--chart-*)`, card "Producao APS" com resumo do ultimo mes + variacao + total anual, `role="table"` e `aria-label` na tabela, erro banner com tokens |
| `app/dashboard/producao-aps/page.tsx` | `TIPOS` cores via `var(--chart-*)`, sparkline SVG usa `var(--accent)`, badges variacao com `var(--success/danger)`, alerta com `var(--danger-subtle)`, `aria-hidden` em emojis, `role="table"` + `aria-label`, ano selector com touch target 44px, graficos com altura responsiva (300→220px mobile) |
| `app/dashboard/producao-ambulatorial/page.tsx` | `COMPLEXIDADES` cores via `var(--chart-*)`, KPI variation badges com tokens, tabela variacao com `var(--success/danger)`, insight icons com `var()`, spinner global, KPI principal `highlight` com span 2 colunas, `role="table"` + `aria-label`, graficos com altura responsiva (280→220px mobile) |
| `app/dashboard/municipios/page.tsx` | Paginacao botoes 44x44px, badge UF pill `borderRadius: 20` |
| `app/dashboard/configuracoes/page.tsx` | Barra forca de senha 4px → 6px |

---

## Checklist por Item do Plano

### GRUPO A — Correcoes Criticas
| # | Item | Status |
|---|------|--------|
| A1 | Criar CSS variables `--chart-green/blue/amber/purple/slate/indigo` | ✅ Implementado |
| A2 | Substituir ~120 cores hex hardcoded por CSS variables | ✅ Implementado |
| A3 | Login: ~50 cores hardcoded → CSS variables (dark/light) | ✅ Implementado |
| A4 | Touch targets: `.action-btn` 44x44px, paginacao 44x44px, ano selector 44px | ✅ Implementado |
| A5 | Acessibilidade: `role="table"` + `aria-label` (3 tabelas), `aria-hidden` emojis, sparkline `role="img"` | ✅ Implementado |

### GRUPO B — Responsividade
| # | Item | Status |
|---|------|--------|
| B1 | Graficos Recharts: 300→220px / 280→220px em mobile | ✅ Implementado |
| B2 | Scrollbar Firefox: `scrollbar-width: thin; scrollbar-color` | ✅ Implementado |

### GRUPO C — Dark/Light Mode
| # | Item | Status |
|---|------|--------|
| C1 | `--text-muted` dark: `#64748B` (3.1:1) → `#7C8CA2` (4.6:1 WCAG AA) | ✅ Implementado |
| C2 | Tokens `--success-subtle`, `--danger-subtle` ja existiam; agora usados em badges | ✅ Verificado |

### GRUPO D — Hierarquia Visual e Narrativa
| # | Item | Status |
|---|------|--------|
| D1 | Visao Geral: card "Producao APS" com total mensal, variacao %, breakdown por tipo, total anual + link | ✅ Implementado |
| D2 | Ambulatorial: KPI 2025 com `highlight` (span 2 cols, fonte maior), reordenado como primeiro | ✅ Implementado |
| D3 | KPI cards: removido `transform: translateY(-2px)` no hover (falsa interatividade) | ✅ Implementado |

### GRUPO E — Consistencia e Padronizacao
| # | Item | Status |
|---|------|--------|
| E1 | `.kpi-card` padding: 22px 24px → 20px 24px | ✅ Implementado |
| E2 | Labels: revisado — padroes existentes sao intencionais (11px compact/12px desktop) | ⚠️ Parcial — mantido como esta, pois e sizing responsivo intencional |
| E3 | Badge UF Municipios: `borderRadius: 8` → `20` (pill) | ✅ Implementado |
| E4 | Forca de senha: barras `height: 4px` → `6px` | ✅ Implementado |

---

## Itens NAO implementados (conforme plano)

| Item | Motivo |
|------|--------|
| Extrair componentes para `components/` | Refatoracao estrutural, fora do escopo |
| Substituir `window.confirm()` por modal custom | Requer novo componente + logica |
| Mover fontes `@import` para `next/font` | Risco de FOUT, melhor em PR dedicado |
| "Pulso do Sistema" completo (semaforo, ultima importacao) | Requer nova logica de negocio |
| Evolucao mensal na Ambulatorial | Requer novos dados da API |
| Insights prescritivos (sugestao de acao) | Mudanca de logica de negocio |

---

## Resumo Quantitativo

- **8 arquivos modificados**
- **~120 cores hex hardcoded eliminadas** (substituidas por CSS variables)
- **6 novos tokens de cor para graficos** (adaptam dark/light)
- **3 tabelas com acessibilidade** (`role="table"` + `aria-label`)
- **4 emojis com `aria-hidden`**
- **1 novo card de narrativa** (Producao APS na Visao Geral)
- **5 builds verificados** (1 por grupo, todos OK)
- **0 erros de compilacao**

---

*Changelog gerado automaticamente apos implementacao completa.*
