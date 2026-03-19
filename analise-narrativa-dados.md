# Analise Narrativa de Dados — VigiaSaude

**Data:** 2026-03-19
**Analista:** Claude (Opus) — Analista de Dados Senior
**Escopo:** Todas as telas de dados do sistema VigiaSaude
**Telas analisadas:** 5

---

## 1. Diagnostico por Tela

### 1.1 Visao Geral (`/dashboard`)

**Classificacao: Dados genericos**

| Criterio | Avaliacao |
|---|---|
| Conta uma historia? | Nao. Mostra 4 numeros administrativos isolados sem contexto de acao. |
| Gestor entende em <5s? | Entende *o que tem*, mas nao *o que fazer*. |
| Contexto comparativo? | Nenhum. Nao ha variacao, meta, nem tendencia. |
| KPIs prioritarios em destaque? | Os 4 KPIs tem peso visual identico — nenhum se destaca. |
| Progressao macro → micro? | Parcial: KPIs → tabela de usuarios recentes. Mas falta a ponte "por que isso importa". |

**Problemas criticos:**
- Os 4 cards (Total Usuarios, Ativos, Inativos, Municipios Ativos) sao metricas de *inventario*, nao de *performance*. O gestor nao sabe se esses numeros sao bons ou ruins.
- A tabela de usuarios recentes e informativa mas nao acionavel — nao indica se ha usuarios pendentes de aprovacao, convites expirados, ou municipios sem operadores.
- Apos a remocao dos cards de producao (feita nesta sessao), a Visao Geral perdeu qualquer conexao com dados de saude. E agora uma tela puramente administrativa.
- Nao existe nenhum "call to action" ou destaque de atencao — tudo tem o mesmo peso.

**O que falta para contar uma historia:**
- Contexto comparativo nos KPIs (ex: "+3 usuarios esta semana", "2 municipios sem operadores ativos")
- Um card de "Atencao necessaria" que agregue alertas do sistema inteiro
- Um resumo de saude do sistema que conecte usuarios → municipios → dados importados

---

### 1.2 Producao APS (`/dashboard/producao-aps`)

**Classificacao: Conta uma historia**

| Criterio | Avaliacao |
|---|---|
| Conta uma historia? | Sim. A progressao e: snapshot do ultimo mes → KPIs anuais → insights narrativos → graficos → tabela. |
| Gestor entende em <5s? | Sim. O card "Ultimo mes registrado" com badge de variacao % e o ponto de entrada claro. |
| Contexto comparativo? | Bom: variacao vs mes anterior nos KPIs, sparkline de tendencia, insights automaticos, coluna "vs Media" na tabela. |
| KPIs prioritarios em destaque? | O card de resumo do ultimo mes tem o maior peso visual (correto). KPIs anuais vem logo abaixo. |
| Progressao macro → micro? | Excelente: Resumo mensal → KPIs anuais → Insights → Graficos → Tabela detalhada. |

**Pontos fortes:**
- Os insights narrativos auto-gerados ("Queda de 25.8% em Dez", "Pico em Set com 157k") transformam numeros em frases acionaveis.
- Filtro por tipo de atendimento permite drill-down sem sair da pagina.
- Seletor de ano (2024/2025) permite comparacao historica.
- Sparkline de 6 meses da contexto temporal imediato.

**Oportunidades de melhoria:**
- Falta comparacao entre anos (ex: "Dez/2025 vs Dez/2024") — o seletor de ano so mostra um ano por vez, sem sobreposicao.
- Os KPIs anuais nao tem meta/referencia. "521.340 atendimentos" — isso e bom? E o esperado? Sem parametro, o numero e so um numero.
- Os insights sao inteligentes, mas nao sugerem acao concreta (ex: em vez de "Queda de 25.8%", poderia dizer "Queda de 25.8% — verifique se houve subnotificacao ou recesso de equipes").
- Nao ha indicador de cobertura vs populacao (ex: atendimentos per capita).

---

### 1.3 Producao Ambulatorial (`/dashboard/producao-ambulatorial`)

**Classificacao: Conta uma historia (parcialmente)**

| Criterio | Avaliacao |
|---|---|
| Conta uma historia? | Parcialmente. A comparacao 2024 vs 2025 cria narrativa, mas falta profundidade. |
| Gestor entende em <5s? | Sim para o total. O card de insight narrativo ajuda a contextualizar. |
| Contexto comparativo? | Bom: 2024 vs 2025 em todos os niveis. Variacao % entre anos. |
| KPIs prioritarios em destaque? | Sim. Total ambulatorial com variacao e o elemento principal. |
| Progressao macro → micro? | Sim: KPIs totais → Insight de perfil → Grafico comparativo → Donut de composicao → Tabela. |

**Pontos fortes:**
- A comparacao interanual (2024 vs 2025) em todos os niveis e muito boa.
- O insight de perfil do municipio ("Polo de alta complexidade" vs "Foco na Atencao Basica") e uma analise de alto valor para o gestor.
- O donut chart com legenda detalhada comunica bem a composicao por complexidade.

**Oportunidades de melhoria:**
- So compara 2 anos. Nao ha tendencia historica (3-5 anos) nem sazonalidade.
- Nao ha drill-down mensal — todos os dados sao anuais agregados. O gestor nao sabe se a producao esta caindo nos ultimos meses ou se manteve estavel.
- Falta contexto de capacidade instalada (CNES) para avaliar se a producao e condizente com a infraestrutura.
- Os 4 KPIs na primeira linha tem peso visual igual, mas "Total Ambulatorial" e claramente o mais importante — deveria ter destaque maior.
- Nao existe meta ou parametro de referencia (ex: media estadual, teto financeiro MAC).

---

### 1.4 Usuarios (`/dashboard/usuarios`)

**Classificacao: Dados genericos**

| Criterio | Avaliacao |
|---|---|
| Conta uma historia? | Nao. E uma tela de gestao operacional (CRUD), nao de narrativa. |
| Gestor entende em <5s? | Sim para a funcao (listar/gerenciar usuarios), mas nao ha metricas de gestao. |
| Contexto comparativo? | Nenhum. |
| KPIs prioritarios em destaque? | Apenas contagem total e ativos no header — dados minimos. |
| Progressao macro → micro? | Basica: busca/filtro → tabela → acoes. |

**Problemas:**
- E uma tela de CRUD pura. Para um painel de gestao, faltam metricas como: usuarios que nunca logaram, ultimo acesso por usuario, municipios sem nenhum operador ativo.
- Nao ha visualizacao da distribuicao de usuarios por municipio ou por role.

**Nota:** Como tela operacional, funciona bem. Mas nao contribui para a narrativa de dados do sistema.

---

### 1.5 Municipios (`/dashboard/municipios`)

**Classificacao: Dados genericos**

| Criterio | Avaliacao |
|---|---|
| Conta uma historia? | Nao. E um cadastro com toggle de ativacao. |
| Gestor entende em <5s? | Sim para a funcao, mas sem contexto de saude. |
| Contexto comparativo? | Nenhum. |
| KPIs prioritarios em destaque? | Apenas a contagem total no header. |
| Progressao macro → micro? | Basica: filtro → tabela paginada. |

**Problemas:**
- 5.571 municipios listados sem qualquer indicador de saude, cobertura de dados, ou status de importacao.
- O gestor nao sabe quais municipios tem dados importados, quais estao atrasados, quais nunca tiveram carga.
- Nao ha mapa, nem agrupamento por UF/regiao.

---

## 2. Resumo da Classificacao

| Tela | Classificacao | Nota (1-5) |
|---|---|---|
| Visao Geral | Dados genericos | 2/5 |
| Producao APS | Conta uma historia | 4/5 |
| Producao Ambulatorial | Conta uma historia (parcial) | 3.5/5 |
| Usuarios | Dados genericos | 2/5 |
| Municipios | Dados genericos | 1.5/5 |

**Resultado:** 1 tela conta uma historia completa, 1 parcialmente, 3 sao dados genericos.

---

## 3. Top 5 Oportunidades de Melhoria Narrativa

Priorizadas por impacto na tomada de decisao do gestor:

### #1 — Visao Geral precisa de um "Pulso do Sistema" (Impacto: CRITICO)

**Problema:** A Visao Geral e a primeira tela que o gestor ve. Hoje mostra 4 numeros de inventario + tabela de usuarios. Nao transmite saude do sistema nem urgencia.

**Solucao proposta:**
- Adicionar card **"Saude do Sistema"** com semaforo (verde/amarelo/vermelho) baseado em:
  - Ultimo mes com dados importados (verde se < 30 dias, amarelo se < 60, vermelho se > 60)
  - Municipios sem dados recentes
  - Usuarios inativos ha mais de 90 dias
- Adicionar card **"Ultima Importacao"** mostrando quando foi a ultima carga de dados e de qual fonte
- Adicionar **mini-resumo de producao** com variacao (link para APS e Ambulatorial)
- Tornar os KPIs comparativos: "12 usuarios ativos (+2 esta semana)"

---

### #2 — Metricas derivadas ausentes em todas as telas (Impacto: ALTO)

**Problema:** O sistema mostra apenas numeros absolutos. Faltam taxas, proporcoes e indicadores per capita que sao essenciais para gestores de saude.

**Metricas que deveriam existir:**

| Metrica derivada | Onde | Formula | Por que importa |
|---|---|---|---|
| Atendimentos per capita/mes | APS | total_atendimentos / populacao_municipio | Contextualiza volume vs tamanho do municipio |
| Taxa de cobertura APS | APS | equipes_ESF * 3.450 / populacao | Indica se a APS alcanca a populacao |
| Variacao interanual por mes | APS | mes_2025 / mes_2024 - 1 | Compara sazonalidade entre anos |
| Procedimentos per capita | Ambulatorial | total_procedimentos / populacao | Contextualiza capacidade ambulatorial |
| Razao AC/AB | Ambulatorial | alta_complexidade / atencao_basica | Indica perfil de complexidade |
| Cobertura de dados (meses) | Visao Geral | meses_com_dados / meses_esperados | Indica completude dos dados |

---

### #3 — Producao Ambulatorial precisa de dimensao temporal (Impacto: ALTO)

**Problema:** A tela ambulatorial so mostra totais anuais (2024 vs 2025). O gestor nao sabe se a producao esta caindo, estavel ou crescendo dentro do ano.

**Solucao proposta:**
- Adicionar grafico de evolucao mensal (como ja existe na APS)
- Adicionar card de "Ultimo mes registrado" com sparkline (como ja existe na APS)
- Permitir drill-down por mes clicando nas barras do grafico

---

### #4 — Municipios precisa virar um "Painel de Cobertura" (Impacto: MEDIO-ALTO)

**Problema:** A tela de Municipios e um cadastro passivo. Para um super_admin que gerencia milhares de municipios, ela nao responde a pergunta mais importante: "Quais municipios precisam de atencao?"

**Solucao proposta:**
- Adicionar KPIs no topo: Total ativos | Com dados recentes | Sem dados | Nunca importaram
- Adicionar coluna "Ultimo dado" na tabela (data da ultima competencia importada)
- Adicionar indicador visual de status de dados (verde/amarelo/vermelho)
- Futuramente: mapa do Brasil com heatmap de cobertura

---

### #5 — Insights narrativos deveriam sugerir acoes concretas (Impacto: MEDIO)

**Problema:** Os insights da tela APS sao descritivos ("Queda de 25.8%") mas nao prescritivos. O gestor sabe que caiu, mas nao sabe o que investigar.

**Solucao proposta:**
Evoluir os insights para incluir sugestoes de acao:

| Insight atual | Insight melhorado |
|---|---|
| "Queda de 25.8% em Dez" | "Queda de 25.8% em Dez — tipica do periodo de ferias. Se persistir em Jan, verifique equipes com ferias acumuladas." |
| "Pico em Set com 157k" | "Pico em Set com 157k (+12% vs media). Considere replicar as condicoes deste mes como referencia de capacidade." |
| "5 de 12 meses acima da media" | "5 de 12 meses acima da media. Producao irregular — meses abaixo coincidem com periodos de ferias (Dez-Jan) e carnaval (Fev)." |

---

## 4. Metricas Derivadas Faltantes (Consolidado)

### Indicadores que o sistema deveria calcular automaticamente:

**Para APS:**
- [ ] Atendimentos per capita (requer populacao do municipio)
- [ ] Variacao mes-a-mes (ja existe parcialmente nos KPIs, falta na tabela)
- [ ] Comparativo mesmo mes do ano anterior (Dez/2025 vs Dez/2024)
- [ ] Media movel de 3 meses (suaviza sazonalidade)
- [ ] Proporcao entre tipos (% de cada tipo sobre o total)
- [ ] Indice de regularidade (desvio padrao / media — quanto menor, mais consistente)

**Para Ambulatorial:**
- [ ] Evolucao mensal por complexidade (hoje so tem anual)
- [ ] Valor medio por procedimento (requer dado financeiro do SIASUS)
- [ ] Variacao mensal (nao existe — so anual)
- [ ] Comparativo mesmo periodo entre anos (Jan-Mar/2025 vs Jan-Mar/2024)

**Para Visao Geral:**
- [ ] Score de saude do sistema (composicao de: dados atualizados + usuarios ativos + municipios cobertos)
- [ ] Dias desde ultima importacao de dados
- [ ] Municipios sem operadores ativos
- [ ] Usuarios que nunca logaram

**Para Municipios:**
- [ ] Data da ultima competencia importada por municipio
- [ ] Quantidade de meses com dados por municipio
- [ ] Quantidade de usuarios vinculados por municipio
- [ ] Flag de "necessita atencao" (sem dados recentes ou sem usuarios)

---

## 5. Visao Arquitetural

### O que o sistema faz bem:
1. **A tela APS e um modelo a seguir** — tem insights, tendencia, drill-down e progressao logica
2. **Design system consistente** — KPI cards, tabelas, tooltips seguem padrao visual coeso
3. **Responsividade** — todas as telas adaptam para mobile
4. **Comparacao interanual** na ambulatorial e um diferencial

### O que precisa evoluir:
1. **De inventario para inteligencia** — a maioria das telas mostra "o que temos" em vez de "o que isso significa"
2. **De telas isoladas para narrativa conectada** — Visao Geral deveria ser o hub que conecta APS, Ambulatorial e status do sistema
3. **De numeros absolutos para contexto** — faltam metas, benchmarks, per capita e tendencias
4. **De descritivo para prescritivo** — insights deveriam sugerir acao, nao so descrever

---

## 6. Proximos Passos Recomendados

| Prioridade | Acao | Complexidade | Impacto |
|---|---|---|---|
| P0 | Redesenhar Visao Geral com "Pulso do Sistema" | Media | Critico |
| P1 | Adicionar evolucao mensal na Ambulatorial | Baixa | Alto |
| P1 | Adicionar metricas de cobertura na tela Municipios | Media | Alto |
| P2 | Implementar comparativo interanual na APS (mesmo mes, ano diferente) | Baixa | Medio |
| P2 | Evoluir insights para sugerir acoes | Baixa | Medio |
| P3 | Adicionar populacao do municipio para calculos per capita | Media | Medio |
| P3 | Adicionar "ultimo acesso" e "nunca logou" na tela Usuarios | Baixa | Baixo |

---

*Relatorio gerado automaticamente por analise de codigo. Nenhum arquivo de codigo foi alterado.*
