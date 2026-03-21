"""
processar_sinan_dengue.py
--------------------------
Fase B — Gera os 4 JSONs processados do SINAN Dengue em SP.

Saída em: dados_vigilancia/processados/
  - dengue_historico_anual.json
  - dengue_sazonalidade.json
  - dengue_perfil.json
  - dengue_benchmarks_sp.json

Execução:
    python scripts/processar_sinan_dengue.py
"""

import json
import re
import sys
from pathlib import Path

BASE       = Path(__file__).parent.parent / "dados_vigilancia"
DEST       = BASE / "processados"
CAL_PATH   = BASE / "calendario_epidemiologico.json"

DEST.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------

def parse_num(v: str) -> int:
    v = v.strip().strip('"').replace(".", "").replace(",", "")
    if v in ("-", "", "..."):
        return 0
    try:
        return int(float(v))
    except ValueError:
        return 0


def ler_csv(nome: str) -> list[dict]:
    """
    Lê CSV SINAN (ISO-8859-1, sep=;, aspas duplas duplicadas).
    Filtra apenas municípios SP (ibge[:2] == '35').
    """
    path = BASE / nome
    with open(path, encoding="iso-8859-1") as f:
        raw = f.read()

    raw = raw.replace('""', '"').replace(';"', ';').replace('";', ';')
    raw = raw.replace('\r\n', '\n').strip()

    lines = raw.split('\n')
    header = [h.strip().strip('"') for h in lines[0].split(';')]

    rows = []
    for line in lines[1:]:
        line = line.strip().strip('"')
        if not line:
            continue
        parts = line.split(';')
        if len(parts) < 2:
            continue

        mun_raw = parts[0].strip().strip('"')
        m = re.match(r'^(\d{6})', mun_raw)
        if not m:
            continue
        ibge6 = m.group(1)
        if ibge6[:2] != "35":
            continue

        nome_mun = mun_raw[7:].strip() if len(mun_raw) > 7 else mun_raw

        row = {"ibge": ibge6, "nome": nome_mun}
        for i, col in enumerate(header[1:], 1):
            row[col] = parse_num(parts[i]) if i < len(parts) else 0
        rows.append(row)

    return rows


def arred(v: float, casas: int = 1) -> float:
    return round(v, casas)


# ---------------------------------------------------------------------------
# Carrega calendário
# ---------------------------------------------------------------------------

cal = json.loads(CAL_PATH.read_text(encoding="utf-8"))

def datas_semana(semana: int, ano: int) -> dict:
    """Retorna {'inicio': 'DD/MM/AAAA', 'fim': 'DD/MM/AAAA'} do calendário."""
    ano_str = str(ano)
    sem_str = str(semana)
    if ano_str in cal and sem_str in cal[ano_str]["semanas"]:
        return cal[ano_str]["semanas"][sem_str]
    return {"inicio": "", "fim": ""}


# ---------------------------------------------------------------------------
# Carrega CSVs
# ---------------------------------------------------------------------------

print("Lendo CSVs...")
rows_anual  = ler_csv("sinan_dengue_anual.csv")
rows_semana = ler_csv("sinan_dengue_semana_epidem.csv")
rows_mensal = ler_csv("sinan_dengue_mensal.csv")
rows_class  = ler_csv("sinan_dengue_class_final.csv")
rows_evol   = ler_csv("sinan_dengue_evolucao.csv")
rows_hosp   = ler_csv("sinan_dengue_ocorreu_hospitalizacao.csv")
rows_fx     = ler_csv("sinan_dengue_faixa_etaria.csv")
rows_sexo   = ler_csv("sinan_dengue_sexo.csv")

# Indexar por ibge para acesso O(1)
def idx(rows: list[dict]) -> dict:
    return {r["ibge"]: r for r in rows}

anual_idx  = idx(rows_anual)
semana_idx = idx(rows_semana)
mensal_idx = idx(rows_mensal)
class_idx  = idx(rows_class)
evol_idx   = idx(rows_evol)
hosp_idx   = idx(rows_hosp)
fx_idx     = idx(rows_fx)
sexo_idx   = idx(rows_sexo)

ANOS_UTEIS = ["2019","2020","2021","2022","2023","2024","2025"]
ANO_2026   = "2026"
MESES      = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]

MESES_NOMES = {
    "Jan":"Janeiro","Fev":"Fevereiro","Mar":"Março","Abr":"Abril",
    "Mai":"Maio","Jun":"Junho","Jul":"Julho","Ago":"Agosto",
    "Set":"Setembro","Out":"Outubro","Nov":"Novembro","Dez":"Dezembro"
}

# Detectar colunas de semanas (ex: "Semana 01", "Semana 1", "01", "1")
if rows_semana:
    _sem_cols_raw = [c for c in rows_semana[0].keys()
                     if c not in ("ibge","nome")]
    # Mapear para número inteiro
    def col_to_sem(c: str) -> int:
        c2 = re.sub(r'[^\d]', '', c)
        return int(c2) if c2 else 0
    SEM_COLS = sorted(
        [c for c in _sem_cols_raw if col_to_sem(c) > 0],
        key=col_to_sem
    )
else:
    SEM_COLS = []

print(f"  {len(rows_anual)} municipios SP | {len(SEM_COLS)} semanas detectadas")


# ===========================================================================
# JSON 1 — dengue_historico_anual.json
# ===========================================================================

print("\nGerando dengue_historico_anual.json ...")

hist_out = {}

for r in rows_anual:
    ibge = r["ibge"]
    nome = r["nome"]

    por_ano = []
    casos_por_ano = {}
    for ano in ANOS_UTEIS:
        v = r.get(ano, 0)
        casos_por_ano[ano] = v
        por_ano.append({"ano": ano, "casos": v, "parcial": False})

    # 2026 parcial
    v26 = r.get(ANO_2026, 0)
    por_ano.append({"ano": ANO_2026, "casos": v26, "parcial": True})

    # Ano pico (entre anos completos)
    ano_pico   = max(casos_por_ano, key=lambda a: casos_por_ano[a])
    casos_pico = casos_por_ano[ano_pico]

    # Média histórica (2019–2025, excluindo zeros pois município pode não ter dado em todos os anos)
    vals_nz = [v for v in casos_por_ano.values() if v > 0]
    media   = arred(sum(vals_nz) / len(vals_nz), 0) if vals_nz else 0.0

    # Variações
    def var_pct(a: str, b: str) -> float | None:
        va, vb = casos_por_ano.get(a, 0), casos_por_ano.get(b, 0)
        if va == 0:
            return None
        return arred((vb - va) / va * 100, 1)

    total_historico = sum(casos_por_ano.values()) + v26

    hist_out[ibge] = {
        "ibge":             ibge,
        "uf":               ibge[:2],
        "nome":             nome,
        "por_ano":          por_ano,
        "ano_pico":         ano_pico,
        "casos_ano_pico":   casos_pico,
        "media_historica":  media,
        "var_2023_2024_pct": var_pct("2023","2024"),
        "var_2024_2025_pct": var_pct("2024","2025"),
        "total_historico":  total_historico,
    }

dest1 = DEST / "dengue_historico_anual.json"
dest1.write_text(json.dumps(hist_out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"  Salvo: {dest1}  ({len(hist_out)} municipios)")


# ===========================================================================
# JSON 2 — dengue_sazonalidade.json
# ===========================================================================

print("\nGerando dengue_sazonalidade.json ...")

ANO_REF = 2026   # Ano de referência para datas reais nos tooltips

sazon_out = {}

for r in rows_semana:
    ibge = r["ibge"]

    # --- Sazonalidade semanal ---
    total_semanas_mun = sum(r.get(c, 0) for c in SEM_COLS)

    por_semana = []
    pico_sem_num = 1
    pico_sem_val = 0

    for col in SEM_COLS:
        sem_num = col_to_sem(col)
        casos   = r.get(col, 0)
        pct     = arred(casos / total_semanas_mun * 100, 2) if total_semanas_mun else 0.0
        datas   = datas_semana(sem_num, ANO_REF)

        por_semana.append({
            "semana":           sem_num,
            "casos_historicos": casos,
            "pct_do_total":     pct,
            "datas_2026":       datas,
        })

        if casos > pico_sem_val:
            pico_sem_val = casos
            pico_sem_num = sem_num

    datas_pico_2026 = datas_semana(pico_sem_num, ANO_REF)

    # --- Sazonalidade mensal ---
    rm = mensal_idx.get(ibge, {})
    total_mensal_mun = sum(rm.get(m, 0) for m in MESES)

    por_mes = []
    meses_criticos = []
    mes_pico = "Mar"
    pico_mes_val = 0

    for i, m in enumerate(MESES, 1):
        casos = rm.get(m, 0)
        pct   = arred(casos / total_mensal_mun * 100, 2) if total_mensal_mun else 0.0
        por_mes.append({
            "mes":              m,
            "mes_nome":         MESES_NOMES[m],
            "mes_num":          i,
            "casos_historicos": casos,
            "pct_do_total":     pct,
        })
        if pct > 10:
            meses_criticos.append(m)
        if casos > pico_mes_val:
            pico_mes_val = casos
            mes_pico     = m

    # % jan-jun
    casos_jan_jun  = sum(rm.get(m, 0) for m in ["Jan","Fev","Mar","Abr","Mai","Jun"])
    pct_jan_jun    = arred(casos_jan_jun / total_mensal_mun * 100, 1) if total_mensal_mun else 0.0

    sazon_out[ibge] = {
        "ibge":                   ibge,
        "por_semana":             por_semana,
        "por_mes":                por_mes,
        "semana_pico_historica":  pico_sem_num,
        "datas_semana_pico_2026": datas_pico_2026,
        "mes_pico":               mes_pico,
        "meses_criticos":         meses_criticos,
        "pct_jan_jun":            pct_jan_jun,
    }

dest2 = DEST / "dengue_sazonalidade.json"
dest2.write_text(json.dumps(sazon_out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"  Salvo: {dest2}  ({len(sazon_out)} municipios)")


# ===========================================================================
# JSON 3 — dengue_perfil.json
# ===========================================================================

print("\nGerando dengue_perfil.json ...")

def qtd_pct(qtd: int, total: int) -> dict:
    pct = arred(qtd / total * 100, 1) if total > 0 else 0.0
    return {"qtd": qtd, "pct": pct}

# Faixas etárias
FAIXAS_MAP = {
    "crianca":      ["<1 Ano","1-4","5-9"],
    "adolescente":  ["10-14","15-19"],
    "adulto_jovem": ["20-39"],
    "adulto":       ["40-59"],
    "idoso":        ["60-64","65-69","70-79","80 e +"],
}
FAIXAS_LABELS = {
    "crianca": "Crianças (0–9 anos)",
    "adolescente": "Adolescentes (10–19 anos)",
    "adulto_jovem": "Adultos jovens (20–39 anos)",
    "adulto": "Adultos (40–59 anos)",
    "idoso": "Idosos (60+ anos)",
}

perfil_out = {}

for r in rows_anual:
    ibge = r["ibge"]
    nome = r["nome"]

    # Total notificado histórico (soma dos anos úteis + 2026)
    total_notif = sum(r.get(a, 0) for a in ANOS_UTEIS) + r.get(ANO_2026, 0)

    # --- Classificação ---
    rc = class_idx.get(ibge, {})
    c_total    = rc.get("Total", 0) or total_notif
    c_simples  = rc.get("Dengue", 0)
    c_alarme   = rc.get("Dengue com sinais de alarme", 0)
    c_grave    = rc.get("Dengue grave", 0)
    c_inconc   = rc.get("Inconclusivo", 0)

    classificacao = {
        "dengue_simples": qtd_pct(c_simples, c_total),
        "sinais_alarme":  qtd_pct(c_alarme,  c_total),
        "grave":          qtd_pct(c_grave,   c_total),
        "inconclusivo":   qtd_pct(c_inconc,  c_total),
    }

    # --- Evolução ---
    re_ = evol_idx.get(ibge, {})
    e_total        = re_.get("Total", 0) or total_notif
    e_cura         = re_.get("Cura", 0)
    e_obito_dengue = re_.get("Óbito pelo agravo notificado", 0)
    e_obito_outra  = re_.get("Óbito por outra causa", 0)
    e_obito_inv    = re_.get("Óbito em investigação", 0)
    e_total_obitos = e_obito_dengue + e_obito_outra + e_obito_inv

    taxa_letal = arred(e_obito_dengue / e_total * 100, 3) if e_total > 0 else 0.0

    evolucao = {
        "cura":              qtd_pct(e_cura,         e_total),
        "obito_dengue":      qtd_pct(e_obito_dengue, e_total),
        "obito_outra_causa": qtd_pct(e_obito_outra,  e_total),
        "taxa_letalidade":   taxa_letal,
    }

    # --- Hospitalização ---
    rh = hosp_idx.get(ibge, {})
    h_sim = rh.get("Sim", 0)
    h_nao = rh.get("Não", 0)
    h_den = h_sim + h_nao

    taxa_hosp = arred(h_sim / h_den * 100, 2) if h_den > 0 else 0.0

    hospitalizacao = {
        "sim":                 qtd_pct(h_sim, h_den),
        "nao":                 qtd_pct(h_nao, h_den),
        "taxa_hospitalizacao": taxa_hosp,
    }

    # --- Faixa etária ---
    rfx = fx_idx.get(ibge, {})
    fx_grupos = {}
    fx_total  = 0
    for grupo, colunas in FAIXAS_MAP.items():
        q = sum(rfx.get(c, 0) for c in colunas)
        fx_grupos[grupo] = q
        fx_total += q

    faixa_etaria = {}
    faixa_dom = "adulto_jovem"
    faixa_dom_pct = 0.0
    for grupo, q in fx_grupos.items():
        dp = qtd_pct(q, fx_total)
        faixa_etaria[grupo] = dp
        if dp["pct"] > faixa_dom_pct:
            faixa_dom_pct = dp["pct"]
            faixa_dom     = grupo
    faixa_etaria["faixa_dominante"]       = faixa_dom
    faixa_etaria["faixa_dominante_label"] = FAIXAS_LABELS[faixa_dom]

    # --- Sexo ---
    rs = sexo_idx.get(ibge, {})
    s_masc = rs.get("Masculino", 0)
    s_fem  = rs.get("Feminino", 0)
    s_den  = s_masc + s_fem

    sexo = {
        "masculino": qtd_pct(s_masc, s_den),
        "feminino":  qtd_pct(s_fem,  s_den),
    }

    perfil_out[ibge] = {
        "ibge":             ibge,
        "nome":             nome,
        "total_notificado": total_notif,
        "classificacao":    classificacao,
        "evolucao":         evolucao,
        "hospitalizacao":   hospitalizacao,
        "faixa_etaria":     faixa_etaria,
        "sexo":             sexo,
    }

dest3 = DEST / "dengue_perfil.json"
dest3.write_text(json.dumps(perfil_out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"  Salvo: {dest3}  ({len(perfil_out)} municipios)")


# ===========================================================================
# JSON 4 — dengue_benchmarks_sp.json
# ===========================================================================

print("\nGerando dengue_benchmarks_sp.json ...")

# Totais anuais SP
total_sp_por_ano = {}
for ano in ANOS_UTEIS:
    total_sp_por_ano[ano] = sum(r.get(ano, 0) for r in rows_anual)
total_sp_por_ano[ANO_2026] = sum(r.get(ANO_2026, 0) for r in rows_anual)

ano_pico_sp = max(ANOS_UTEIS, key=lambda a: total_sp_por_ano[a])

# Sazonalidade SP
total_sem_sp = sum(sum(r.get(c, 0) for r in rows_semana) for c in SEM_COLS)
sazon_semana_sp = []
for col in SEM_COLS:
    sem_num = col_to_sem(col)
    t = sum(r.get(col, 0) for r in rows_semana)
    pct = arred(t / total_sem_sp * 100, 2) if total_sem_sp else 0.0
    sazon_semana_sp.append({"semana": sem_num, "pct_historico": pct, "casos_historicos": t})

total_mes_sp = sum(sum(r.get(m, 0) for r in rows_mensal) for m in MESES)
sazon_mes_sp = []
for i, m in enumerate(MESES, 1):
    t   = sum(r.get(m, 0) for r in rows_mensal)
    pct = arred(t / total_mes_sp * 100, 2) if total_mes_sp else 0.0
    sazon_mes_sp.append({"mes": m, "mes_nome": MESES_NOMES[m], "mes_num": i,
                          "pct_historico": pct, "casos_historicos": t})

# Médias SP (excluindo municípios sem dado)
def media_sp(vals: list[float]) -> float:
    vals_nz = [v for v in vals if v > 0]
    return arred(sum(vals_nz) / len(vals_nz), 2) if vals_nz else 0.0

taxas_hosp_muns = []
for r in rows_hosp:
    h_sim = r.get("Sim", 0)
    h_nao = r.get("Não", 0)
    h_den = h_sim + h_nao
    if h_den > 0:
        taxas_hosp_muns.append(h_sim / h_den * 100)

taxas_letal_muns = []
for r in rows_evol:
    e_total = r.get("Total", 0)
    e_obito = r.get("Óbito pelo agravo notificado", 0)
    if e_total > 0:
        taxas_letal_muns.append(e_obito / e_total * 100)

pct_alarme_muns = []
for r in rows_class:
    c_total  = r.get("Total", 0)
    c_alarme = r.get("Dengue com sinais de alarme", 0)
    if c_total > 0:
        pct_alarme_muns.append(c_alarme / c_total * 100)

# Taxa hospitalização SP (Sim / (Sim+Não) — excluindo Ign/Branco)
h_sim_sp = sum(r.get("Sim", 0) for r in rows_hosp)
h_nao_sp = sum(r.get("Não", 0) for r in rows_hosp)
taxa_hosp_sp = arred(h_sim_sp / (h_sim_sp + h_nao_sp) * 100, 2) if (h_sim_sp + h_nao_sp) > 0 else 0.0

e_obito_sp  = sum(r.get("Óbito pelo agravo notificado", 0) for r in rows_evol)
e_total_sp  = sum(r.get("Total", 0) for r in rows_evol)
taxa_letal_sp = arred(e_obito_sp / e_total_sp * 100, 3) if e_total_sp > 0 else 0.0

c_alarme_sp = sum(r.get("Dengue com sinais de alarme", 0) for r in rows_class)
c_total_sp  = sum(r.get("Total", 0) for r in rows_class)
pct_alarme_sp = arred(c_alarme_sp / c_total_sp * 100, 2) if c_total_sp > 0 else 0.0

benchmarks = {
    "total_casos_sp_por_ano":         total_sp_por_ano,
    "ano_pico_sp":                    ano_pico_sp,
    "municipios_com_dado":            len(rows_anual),
    "sazonalidade_sp": {
        "por_semana": sazon_semana_sp,
        "por_mes":    sazon_mes_sp,
    },
    "taxa_hospitalizacao_sp_media":   taxa_hosp_sp,
    "taxa_letalidade_sp_media":       taxa_letal_sp,
    "pct_sinais_alarme_sp_media":     pct_alarme_sp,
    "taxa_hospitalizacao_por_municipio_media": arred(media_sp(taxas_hosp_muns), 2),
    "taxa_letalidade_por_municipio_media":     arred(media_sp(taxas_letal_muns), 3),
}

dest4 = DEST / "dengue_benchmarks_sp.json"
dest4.write_text(json.dumps(benchmarks, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"  Salvo: {dest4}")


# ===========================================================================
# VALIDAÇÃO FINAL
# ===========================================================================

print("\n" + "=" * 65)
print("VALIDACAO FINAL")
print("=" * 65)

v2024 = total_sp_por_ano.get("2024", 0)
v2025 = total_sp_por_ano.get("2025", 0)
print(f"  SP 2024: {v2024:,}  (ref: 2.187.610)  {'[OK]' if v2024 == 2187610 else '[DIFF]'}")
print(f"  SP 2025: {v2025:,}  (ref:   890.465)  {'[OK]' if v2025 == 890465  else '[DIFF]'}")

pct_mar = next((m["pct_historico"] for m in sazon_mes_sp if m["mes"] == "Mar"), 0)
pct_abr = next((m["pct_historico"] for m in sazon_mes_sp if m["mes"] == "Abr"), 0)
print(f"  Mar + Abr SP: {pct_mar + pct_abr:.1f}%  (ref: ~47%)  {'[OK]' if 44 < pct_mar+pct_abr < 52 else '[DIFF]'}")
print(f"  Taxa hospitalizacao SP: {taxa_hosp_sp:.2f}%  (ref: ~2.8%–3.5%)")
print(f"  Taxa letalidade SP: {taxa_letal_sp:.3f}%")
print(f"  % sinais de alarme SP: {pct_alarme_sp:.2f}%")
print(f"  Ano pico SP: {ano_pico_sp}")
print(f"  Municipios processados: {len(perfil_out)}")

print("\n[FASE B CONCLUIDA] 4 JSONs gerados em dados_vigilancia/processados/")


# ===========================================================================
# FASE C — semana × ano (agregado geral do CSV sinan_dengue_semana_por_ano)
# ===========================================================================

print("\n" + "=" * 65)
print("FASE C — dengue_semana_por_ano.json")
print("=" * 65)

CSV_SEM_ANO = BASE / "sinan_dengue_semana_por_ano.csv"

if not CSV_SEM_ANO.exists():
    print("  [SKIP] sinan_dengue_semana_por_ano.csv não encontrado.")
else:
    ANOS_ALVO = [str(a) for a in range(2019, 2027)]  # 2019-2026

    with open(CSV_SEM_ANO, encoding="iso-8859-1") as f:
        raw_sem = f.read()

    # Normalizar aspas duplas duplicadas
    raw_sem = raw_sem.replace('""', '"').replace(';"', ';').replace('";', ';')
    raw_sem = raw_sem.replace('\r\n', '\n').strip()

    linhas_sem = raw_sem.split('\n')
    header_sem = [h.strip().strip('"') for h in linhas_sem[0].split(';')]

    # Índices das colunas dos anos alvo
    idx_anos = {}
    for ano in ANOS_ALVO:
        try:
            idx_anos[ano] = header_sem.index(ano)
        except ValueError:
            pass  # ano não presente no CSV

    anos_disponiveis = sorted(idx_anos.keys())

    por_semana: list[dict] = []
    pico_por_ano: dict[str, dict] = {a: {"semana": 0, "casos": 0} for a in anos_disponiveis}

    for linha in linhas_sem[1:]:
        linha = linha.strip().strip('"')
        if not linha:
            continue
        cols = [c.strip().strip('"') for c in linha.split(';')]
        nome_sem = cols[0] if cols else ''

        # Processar apenas linhas "Semana NN"
        if not nome_sem.startswith('Semana '):
            continue

        try:
            num_sem = int(nome_sem.replace('Semana ', '').strip())
        except ValueError:
            continue

        entrada: dict = {"semana": num_sem}
        for ano in anos_disponiveis:
            idx = idx_anos[ano]
            val = cols[idx] if idx < len(cols) else '-'
            casos = parse_num(val)
            entrada[ano] = casos
            # Rastrear pico por ano
            if casos > pico_por_ano[ano]["casos"]:
                pico_por_ano[ano] = {"semana": num_sem, "casos": casos}

        por_semana.append(entrada)

    # Ordenar semanas
    por_semana.sort(key=lambda x: x["semana"])

    saida_sem_ano = {
        "_meta": {
            "fonte": "sinan_dengue_semana_por_ano.csv",
            "nota": (
                "Dados AGREGADOS — total geral (não por município). "
                "O CSV de origem não contém coluna de IBGE; representa o "
                "somatório nacional/estadual exportado do SINAN."
            ),
            "anos_disponiveis": anos_disponiveis,
            "total_semanas": len(por_semana),
        },
        "por_semana": por_semana,
        "pico_por_ano": pico_por_ano,
    }

    dest_c = DEST / "dengue_semana_por_ano.json"
    dest_c.write_text(json.dumps(saida_sem_ano, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  Salvo: {dest_c}")
    print(f"  Anos disponíveis: {anos_disponiveis}")
    print(f"  Semanas processadas: {len(por_semana)}")
    for ano in anos_disponiveis:
        p = pico_por_ano[ano]
        print(f"  Pico {ano}: SE {p['semana']} com {p['casos']:,} casos")


# ===========================================================================
# FASE D — dengue_semana_por_ano_municipio.json (município × semana × ano)
# ===========================================================================

print("\n" + "=" * 65)
print("FASE D — dengue_semana_por_ano_municipio.json")
print("=" * 65)

ANOS_MUN   = [str(a) for a in range(2019, 2027)]
N_SEMANAS  = 53


def ler_csv_mun_semana(ano: str) -> dict:
    """
    Lê sinan_dengue_mun_semana_{ano}.csv.
    Retorna {ibge6: [casos_s1, ..., casos_s53]} — apenas municípios SP.
    """
    path = BASE / f"sinan_dengue_mun_semana_{ano}.csv"
    if not path.exists():
        print(f"  [SKIP] {path.name} não encontrado.")
        return {}

    with open(path, encoding="iso-8859-1") as f:
        raw = f.read()

    raw = raw.replace('""', '"').replace(';"', ';').replace('";', ';')
    raw = raw.replace('\r\n', '\n').strip()

    lines  = raw.split('\n')
    header = [h.strip().strip('"') for h in lines[0].split(';')]

    # Detectar índices das colunas "Semana XX" (ignora Em Branco/ign, Total, etc.)
    sem_indices: dict[int, int] = {}
    for i, col in enumerate(header):
        col_clean = col.strip()
        if col_clean.lower().startswith('semana '):
            try:
                num = int(re.sub(r'[^\d]', '', col_clean))
                if 1 <= num <= N_SEMANAS:
                    sem_indices[num] = i
            except ValueError:
                pass

    result: dict[str, list[int]] = {}
    for line in lines[1:]:
        line = line.strip().strip('"')
        if not line:
            continue
        parts = line.split(';')
        if len(parts) < 2:
            continue

        mun_raw = parts[0].strip().strip('"')
        m = re.match(r'^(\d{6})', mun_raw)
        if not m:
            continue
        ibge6 = m.group(1)
        if ibge6[:2] != "35":
            continue

        casos_por_semana = [0] * N_SEMANAS
        for num_sem, idx in sem_indices.items():
            if idx < len(parts):
                casos_por_semana[num_sem - 1] = parse_num(parts[idx])

        result[ibge6] = casos_por_semana

    return result


# Ler todos os anos
dados_por_ano_mun: dict[str, dict[str, list[int]]] = {}
for ano in ANOS_MUN:
    dados_por_ano_mun[ano] = ler_csv_mun_semana(ano)
    n = len(dados_por_ano_mun[ano])
    if n:
        print(f"  {ano}: {n} municípios SP")

# Anos que realmente têm dados
anos_disp_mun = [a for a in ANOS_MUN if dados_por_ano_mun.get(a)]

# Coletar todos os ibges presentes em pelo menos um ano
todos_ibges_mun: set[str] = set()
for d in dados_por_ano_mun.values():
    todos_ibges_mun.update(d.keys())

mun_out: dict = {}

for ibge in sorted(todos_ibges_mun):
    por_semana: list[dict] = []
    pico_por_ano_mun: dict = {}

    for sem_idx in range(N_SEMANAS):
        entrada: dict = {"semana": sem_idx + 1}
        for ano in anos_disp_mun:
            entrada[ano] = dados_por_ano_mun[ano].get(ibge, [0] * N_SEMANAS)[sem_idx]
        por_semana.append(entrada)

    for ano in anos_disp_mun:
        casos_ano = dados_por_ano_mun[ano].get(ibge, [0] * N_SEMANAS)
        max_casos = max(casos_ano) if casos_ano else 0
        max_sem   = (casos_ano.index(max_casos) + 1) if max_casos > 0 else 1
        pico_por_ano_mun[ano] = {"semana": max_sem, "casos": max_casos}

    mun_out[ibge] = {
        "por_semana":       por_semana,
        "pico_por_ano":     pico_por_ano_mun,
        "anos_disponiveis": anos_disp_mun,
    }

dest_d = DEST / "dengue_semana_por_ano_municipio.json"
dest_d.write_text(json.dumps(mun_out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\n  Salvo: {dest_d}")
print(f"  Municípios: {len(mun_out)}")
print(f"  Anos: {anos_disp_mun}")

# Validar com Araçatuba (350640) e Bilac (350640 → verifica o que existir)
for ibge_test in ["350640", "350900"]:
    if ibge_test in mun_out:
        p = mun_out[ibge_test]["pico_por_ano"]
        nome_test = next((r["nome"] for r in rows_anual if r["ibge"] == ibge_test), ibge_test)
        print(f"\n  Validação {nome_test} ({ibge_test}):")
        for ano in ["2023", "2024", "2025", "2026"]:
            if ano in p:
                print(f"    {ano}: SE {p[ano]['semana']} com {p[ano]['casos']:,} casos")
        break

print("\n[FASE D CONCLUIDA]")
