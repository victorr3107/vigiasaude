# Auditoria de Design UI/UX — VigiaSaude

**Data:** 2026-03-19
**Auditor:** Claude (Opus) — Designer Senior de Sistemas de Saude
**Escopo:** Todas as telas do sistema VigiaSaude
**Telas auditadas:** 7 (Login + 6 dashboard)

---

## 1. Inventario do Sistema de Design

### 1.1 Paleta de Cores

**Accent principal:** `#10B981` (verde emerald — dark), `#059669` (verde mais escuro — light)

| Token | Dark Mode | Light Mode | Uso |
|---|---|---|---|
| `--bg-base` | `#020617` | `#F1F5F9` | Fundo da pagina |
| `--bg-card` | `rgba(255,255,255,0.04)` | `#FFFFFF` | Cards |
| `--bg-input` | `rgba(255,255,255,0.06)` | `#FFFFFF` | Inputs |
| `--bg-modal` | `#0D1526` | `#FFFFFF` | Modais |
| `--text-primary` | `#F1F5F9` (14.5:1) | `#0F172A` (17:1) | Texto principal |
| `--text-secondary` | `#94A3B8` (4.9:1) | `#334155` (10:1) | Texto secundario |
| `--text-muted` | `#64748B` (3.1:1) | `#64748B` (4.6:1) | Texto terciario |
| `--accent` | `#10B981` | `#059669` | CTAs, links, destaques |
| `--success` | `#10B981` | `#059669` | Sucesso |
| `--warning` | `#F59E0B` | `#D97706` | Alerta |
| `--danger` | `#EF4444` | `#DC2626` | Erro |
| `--info` | `#3B82F6` | `#2563EB` | Informacao |

**Cores de graficos (fixas, nao mudam com tema):**
- Verde: `#10B981`
- Azul: `#3B82F6`
- Amarelo: `#F59E0B`
- Roxo: `#8B5CF6`
- Cinza: `#94A3B8`

### 1.2 Tipografia

| Elemento | Fonte | Tamanho | Peso |
|---|---|---|---|
| Titulos de pagina | Syne | 26px | 700 |
| KPI valores | Syne | clamp(18px, 4vw, 36px) | 700 |
| Subtitulos | DM Sans | 15px | 600 |
| Corpo | DM Sans | 14px | 400-500 |
| Labels | DM Sans | 12px uppercase | 600 |
| Captions | DM Sans | 11px | 400-500 |

### 1.3 Componentes Reutilizaveis (via CSS global)

- `.kpi-card` — Card de KPI com glow e hover lift
- `.filter-btn` / `.filter-btn.active` — Botoes de filtro pill
- `.search-input` — Campo de busca com padding para icone
- `.form-input` / `.form-label` — Campos de formulario
- `.table-row` — Linha de tabela com hover
- `.action-btn` — Botao de acao (icone only)
- `.nav-item` / `.nav-item.active` — Item de navegacao sidebar
- `.toast.ok` / `.toast.erro` — Notificacao de feedback
- `.spinner` — Loading spinner
- `.status-dot` — Indicador de status
- `.role-badge` — Badge de role do usuario

### 1.4 Componentes NAO Reutilizaveis (inline em cada pagina)

- `KpiCard` — reimplementado diferente em cada pagina (visao geral, APS, ambulatorial)
- `Skeleton` — definido inline na visao geral, nao reutilizado em outras paginas
- `ChartCard` — wrapper de grafico, so existe na APS
- `InsightCard` — card de insight, implementacao diferente na APS e ambulatorial
- `CustomTooltip` — tooltip de grafico, duplicado entre APS e ambulatorial
- Modais — implementacao custom em cada pagina que usa

---

## 2. Problemas por Tela

### 2.1 Login (`/`)

| Sev. | Problema |
|---|---|
| **CRITICO** | **Pagina inteira ignora o tema.** ~50 cores hardcoded (`#0F172A`, `#1E293B`, `#334155`, etc.) — fica dark SEMPRE mesmo quando o sistema esta em light mode. Usuario que prefere light mode tera experiencia inconsistente. |
| **ALTO** | Dropdown do seletor de municipio usa ~30 cores hardcoded sem nenhuma variavel CSS. |
| **MEDIO** | Campo de senha sem botao "mostrar/ocultar" visivel o suficiente — icone de olho em `#475569` sobre fundo `#0F172A` (contraste 2.8:1, abaixo de WCAG AA). |
| **MEDIO** | Sem nenhum atributo `aria-*` na pagina inteira (formulario de login, dropdown, etapa de escolha). |
| **BAIXO** | Orbs decorativos (`.orb-1`, `.orb-2`) nao tem `aria-hidden="true"`. |

### 2.2 Visao Geral (`/dashboard`)

| Sev. | Problema |
|---|---|
| **MEDIO** | Zero atributos `aria-*` na pagina. Tabela de usuarios recentes nao tem `role="table"`. |
| **MEDIO** | KPI cards tem `cursor: default` mas animacao de hover (lift + shadow). Isso sugere interatividade que nao existe — confunde o usuario. |
| **BAIXO** | Pagina ficou muito "vazia" apos remocao dos cards de producao. So 4 KPIs + 1 tabela. O gestor nao tem razao para visitar essa tela com frequencia. |

### 2.3 Producao APS (`/dashboard/producao-aps`)

| Sev. | Problema |
|---|---|
| **ALTO** | Sparkline do `ResumoUltimoMesCard` usa `#10B981` hardcoded (7x). No light mode, o verde escuro do tema seria `#059669` — cores ficam inconsistentes. |
| **ALTO** | Badge de variacao e alerta usam `rgba(239,68,68,...)` e `rgba(16,185,129,...)` hardcoded em vez de `var(--danger-subtle)` / `var(--success-subtle)`. |
| **MEDIO** | Zero atributos `aria-*` em toda a pagina. Graficos Recharts nao tem aria-label. Tabela nao tem `role="table"`. |
| **MEDIO** | Insights usam emojis como icones (📉, 📈, 🏆). Estes nao tem `aria-hidden="true"` e podem ser lidos por screen readers de forma confusa. |
| **MEDIO** | Seletor de ano: botoes de 7px padding horizontal — touch target menor que 44x44px recomendado (estimado ~45x34px, marginal). |
| **BAIXO** | Pills de filtro de tipo (`.tipo-pill`) definidos inline via `<style>` tag na pagina em vez de no CSS global. |

### 2.4 Producao Ambulatorial (`/dashboard/producao-ambulatorial`)

| Sev. | Problema |
|---|---|
| **ALTO** | Cores de variacao hardcoded: `color: variacaoPct >= 0 ? '#10B981' : '#EF4444'` em 4 lugares. No light mode, deveria usar `var(--success)` / `var(--danger)`. |
| **MEDIO** | Zero atributos `aria-*` em toda a pagina. Donut chart sem alt text ou descricao acessivel. |
| **MEDIO** | Empty state com emoji 📭 como unico indicador visual — nao acessivel. |
| **BAIXO** | `KpiCard` reimplementado com interface diferente da versao usada na APS. Mesmo componente, duas implementacoes. |

### 2.5 Usuarios (`/dashboard/usuarios`)

| Sev. | Problema |
|---|---|
| **MEDIO** | Botoes de acao na tabela (editar, toggle, excluir) tem `padding: 6px` = area de toque de ~28x28px. Abaixo do minimo de 44x44px para mobile. |
| **MEDIO** | Modal de edicao: toggle switch visual de 44x22px sem label de texto acessivel (so tem `aria-label`). |
| **MEDIO** | Exclusao usa `window.confirm()` nativo — inconsistente com o design system (deveria ser modal custom). |
| **BAIXO** | Badge de role no modal nao usa as CSS variables `--role-*`. Cores sao inline. |

### 2.6 Municipios (`/dashboard/municipios`)

| Sev. | Problema |
|---|---|
| **MEDIO** | Toggle switch na coluna de acao tem area de toque marginal (~44x22px). |
| **MEDIO** | Paginacao: botoes de pagina sao 32x32px — abaixo de 44x44px para touch. |
| **BAIXO** | Badge de UF tem border-radius de 6px enquanto outros badges usam 20px (pill). Inconsistencia menor. |

### 2.7 Configuracoes (`/dashboard/configuracoes`)

| Sev. | Problema |
|---|---|
| **MEDIO** | Cards de preview de tema (dark/light) usam cores hardcoded para simular o tema. Isso e aceitavel para preview, mas os cards poderiam ser mais representativos. |
| **BAIXO** | Indicador de forca de senha: barras de 4px de altura — dificil de perceber em telas de alta densidade. |
| **BAIXO** | Aba "Sobre" mostra fontes de dados com status "previsto" e "futuro" — poderia causar confusao sobre o que realmente funciona. |

---

## 3. Top 10 Melhorias de UX (por impacto no gestor)

### #1 — Login deve respeitar dark/light mode (CRITICO)

**Impacto:** A primeira impressao do sistema. Se o usuario esta em light mode e a tela de login e sempre escura, quebra a consistencia.
**Acao:** Substituir as ~50 cores hardcoded por variaveis CSS do tema. A pagina de login deve reagir a `data-theme`.

---

### #2 — Cores hardcoded em todas as paginas de dados (ALTO)

**Impacto:** No light mode, cores como `#10B981` (pensadas para dark) ficam muito claras contra fundo branco. O sistema parece "desbotado" em light mode.
**Acao:** Criar variaveis para cores de graficos que adaptam com o tema:
```css
--chart-green: #10B981; /* dark */
--chart-green: #059669; /* light */
```
Substituir todos os hex literais por variaveis.

**Contagem atual:** ~120 ocorrencias de hex hardcoded em arquivos `.tsx`.

---

### #3 — Acessibilidade ausente nas telas de dados (ALTO)

**Impacto:** Usuarios com deficiencia visual nao conseguem navegar as telas APS, Ambulatorial e Visao Geral por screen reader.
**Acao:**
- Adicionar `role="table"`, `role="row"`, `role="cell"` nas tabelas inline
- Adicionar `aria-label` nos graficos
- Adicionar `aria-hidden="true"` nos emojis decorativos
- Adicionar `alt` descritivo no SVG sparkline

---

### #4 — Touch targets abaixo do minimo em mobile (MEDIO)

**Impacto:** Gestores frequentemente usam tablet/celular. Botoes de acao de 28x28px causam erros de toque.
**Acao:**
- Aumentar `.action-btn` para minimo `padding: 10px` (area 36x36px) ou usar `min-height: 44px; min-width: 44px`
- Aumentar botoes de paginacao para 44x44px
- Seletor de ano na APS: aumentar padding

---

### #5 — KpiCard deveria ser um componente unico compartilhado (MEDIO)

**Impacto:** Manutencao. Hoje existem 3 implementacoes diferentes do mesmo padrao:
- Visao Geral: aceita `label, value, sub, accent, icon`
- APS: aceita `label, valor, cor, variacao`
- Ambulatorial: aceita `label, valor, cor, sub, variacaoPct`

**Acao:** Unificar em um unico componente em `components/KpiCard.tsx` com interface combinada.

---

### #6 — Confirmacao de exclusao deveria usar modal custom (MEDIO)

**Impacto:** O `window.confirm()` nativo e feio, nao estilizavel, e quebre a experiencia imersiva do sistema.
**Acao:** Criar componente `ConfirmDialog` com o design system existente (usa backdrop blur, botoes accent/danger).

---

### #7 — Visao Geral precisa de conteudo alem de KPIs (MEDIO)

**Impacto:** A tela principal ficou subutilizada. O gestor nao tem motivo para visita-la frequentemente.
**Acao:** Referir ao relatorio `analise-narrativa-dados.md` — adicionar "Pulso do Sistema" com alertas, ultima importacao, resumo de producao.

---

### #8 — Tooltip e Insight reimplementados entre APS e Ambulatorial (BAIXO)

**Impacto:** Duplicacao de codigo. Se o estilo do tooltip muda, precisa mudar em 2 lugares.
**Acao:** Extrair `CustomTooltip`, `InsightCard`, `ChartCard` para pasta `components/`.

---

### #9 — Scrollbar customizada nao funciona no Firefox (BAIXO)

**Impacto:** Estilos `::-webkit-scrollbar` nao se aplicam no Firefox. A experiencia e inconsistente entre browsers.
**Acao:** Adicionar `scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb) transparent;` para Firefox.

---

### #10 — Fontes carregadas via @import bloqueiam render (BAIXO)

**Impacto:** O `@import url(...)` no CSS e render-blocking. Pode causar FOUT (Flash of Unstyled Text).
**Acao:** Mover para `<link rel="preload">` no `app/layout.tsx` ou usar `next/font`.

---

## 4. Inconsistencias Visuais

| Inconsistencia | Onde | Padrao esperado |
|---|---|---|
| KpiCard com 3 implementacoes diferentes | Visao Geral, APS, Ambulatorial | Um unico componente |
| Badge de UF: `border-radius: 6px` vs `20px` | Municipios vs Usuarios | Usar 20px (pill) em todos |
| Emojis como icones em insights | APS, Ambulatorial | Usar SVG icons do design system |
| `window.confirm()` vs modal custom | Usuarios (delete) vs Usuarios (create/edit) | Sempre modal custom |
| Cores de variacao: `#10B981`/`#EF4444` hardcoded | APS, Ambulatorial | Usar `var(--success)` / `var(--danger)` |
| Skeleton loader: definido inline na Visao Geral | Visao Geral | Extrair para componente global |
| Spinner: inline em APS/Ambulatorial | APS, Ambulatorial | Usar classe `.spinner` global |
| Insight cards: implementacao diferente | APS vs Ambulatorial | Componente unico |
| Padding de cards: `22px 24px` vs `20px 24px` | Varias paginas | Padronizar `20px 24px` |
| Labels: `12px` vs `11px` vs `13px` | Varias paginas | Padronizar `12px` |

---

## 5. Analise de Dark/Light Mode

### O que funciona bem:
- Sistema de tokens CSS com variaveis completo e bem calibrado
- Contraste WCAG AA atendido na maioria dos tokens
- Transicao suave entre temas (0.2s ease)
- Anti-flash script no `<head>` evita flash branco
- Cores semanticas ajustadas por tema (verde mais escuro no light)

### O que precisa corrigir:

| Problema | Severidade | Arquivos afetados |
|---|---|---|
| Login totalmente hardcoded (dark-only) | CRITICO | `app/page.tsx` (~50 cores) |
| Layout hardcoded: `#10B981` em ~20 lugares | ALTO | `app/dashboard/layout.tsx` |
| APS sparkline + badges hardcoded | ALTO | `app/dashboard/producao-aps/page.tsx` (~15 cores) |
| Ambulatorial variacao hardcoded | ALTO | `app/dashboard/producao-ambulatorial/page.tsx` (~10 cores) |
| `--text-muted` no dark mode: 3.1:1 contraste | MEDIO | `globals.css` (abaixo de WCAG AA para texto normal) |

### Recomendacao de paleta adicional:

Criar tokens para cores de graficos que adaptam com o tema:
```css
:root, [data-theme="dark"] {
  --chart-green:  #10B981;
  --chart-blue:   #3B82F6;
  --chart-amber:  #F59E0B;
  --chart-purple: #8B5CF6;
  --chart-slate:  #94A3B8;
}

[data-theme="light"] {
  --chart-green:  #059669;
  --chart-blue:   #2563EB;
  --chart-amber:  #D97706;
  --chart-purple: #7C3AED;
  --chart-slate:  #64748B;
}
```

---

## 6. Responsividade

### Breakpoints utilizados:
- Unico breakpoint: `768px` (mobile vs desktop)
- Sem breakpoints intermediarios (tablet portrait, tablet landscape, large desktop)

### O que funciona:
- Grids de KPI adaptam de 4 para 2 colunas
- Sidebar colapsa em mobile com overlay + backdrop
- Tabelas tem `overflow-x: auto`
- Toasts se expandem full-width em mobile
- KPI cards reduzem padding

### O que precisa melhorar:
- **Graficos Recharts:** Nao tem altura responsiva — `height={300}` fixo pode ficar grande demais em celulares 320px
- **Tabelas de dados:** Scrollam horizontalmente mas nao tem indicador visual de que ha mais conteudo (sombra lateral ou seta)
- **320px (iPhone SE):** Nao ha breakpoint especifico. Grids de 2 colunas com gap de 10px podem ficar apertados
- **1440px+ (monitor grande):** `max-width: 1100px` limita o conteudo. Em monitores ultrawide, ha muito espaco desperdicado

---

## 7. Estados de Interface

| Estado | Implementado? | Onde |
|---|---|---|
| Loading (spinner) | Sim | Todas as paginas |
| Loading (skeleton) | Parcial | So Visao Geral |
| Erro de fetch | Parcial | Visao Geral (banner), outras usam console.error |
| Empty state | Sim | APS e Ambulatorial |
| Empty state | Nao | Visao Geral (tabela vazia mostra "Nenhum usuario") |
| Toast de sucesso | Sim | Usuarios, Municipios, Configuracoes |
| Toast de erro | Sim | Usuarios, Configuracoes |
| Disabled button | Sim | Formularios durante submit |
| Confirmacao destrutiva | Parcial | Usuarios (window.confirm nativo) |
| Hover states | Sim | Todas as paginas |
| Focus ring | Sim | Global via `:focus-visible` |

---

*Relatorio gerado por auditoria automatizada de codigo. Nenhum arquivo de codigo foi alterado nesta etapa.*
