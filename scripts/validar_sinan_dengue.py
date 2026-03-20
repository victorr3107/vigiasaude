"""
validar_sinan_dengue.py
-----------------------
Fase A2 — Inventário e validação dos 8 CSVs do SINAN Dengue.
Não gera nenhum arquivo. Apenas lê, filtra SP e imprime totais.

Execução:
    python scripts/validar_sinan_dengue.py
"""

import json
import re
from datetime import date
from pathlib import Path

BASE   = Path(__file__).parent.parent / "dados_vigilancia"
CAL    = BASE / "calendario_epidemiologico.json"

# ---------------------------------------------------------------------------
# Utilitários de leitura CSV SINAN
# ---------------------------------------------------------------------------

def parse_num(v: str) -> int:
    """Converte valor SINAN para int. '-' vira 0."""
    v = v.strip().strip('"').replace(".", "").replace(",", "")
    if v in ("-", "", "...", "-"):
        return 0
    try:
        return int(float(v))
    except ValueError:
        return 0


def ler_csv(nome: str) -> list[dict]:
    """
    Lê um CSV SINAN (ISO-8859-1, sep=;, aspas duplas duplicadas).
    Retorna lista de dicts com todas as colunas.
    Filtra APENAS municípios de SP (ibge começa com '35').
    """
    path = BASE / nome
    rows = []
    with open(path, encoding="iso-8859-1") as f:
        raw = f.read()

    # Remove aspas duplas duplicadas que encapsulam cada campo
    raw = raw.replace('""', '"').replace(';"', ';').replace('";', ';')
    raw = raw.replace('\r\n', '\n').strip()

    lines = raw.split('\n')
    # Header
    header = [h.strip().strip('"') for h in lines[0].split(';')]

    for line in lines[1:]:
        line = line.strip().strip('"')
        if not line:
            continue
        parts = line.split(';')
        if len(parts) < 2:
            continue

        mun_raw = parts[0].strip().strip('"')
        ibge    = re.match(r'^(\d{6})', mun_raw)
        if not ibge:
            continue
        ibge6 = ibge.group(1)
        uf    = ibge6[:2]

        if uf != "35":          # Filtrar apenas SP
            continue

        row = {"ibge": ibge6, "nome": mun_raw[7:].strip()}
        for i, col in enumerate(header[1:], 1):
            row[col] = parse_num(parts[i]) if i < len(parts) else 0
        rows.append(row)

    return rows


# ---------------------------------------------------------------------------
# Cálculo da semana epidemiológica atual
# ---------------------------------------------------------------------------

def semana_atual() -> tuple[int, int, str, str]:
    """
    Retorna (semana, ano, data_inicio, data_fim) da semana epidemiológica
    correspondente à data de hoje, consultando o calendário JSON.
    """
    cal    = json.loads(CAL.read_text(encoding="utf-8"))
    hoje   = date.today()
    hoje_s = hoje.strftime("%d/%m/%Y")

    def parse_date(s: str) -> date:
        d, m, y = s.split("/")
        return date(int(y), int(m), int(d))

    for ano_str, dados in cal.items():
        for sem_str, intervalo in dados["semanas"].items():
            ini = parse_date(intervalo["inicio"])
            fim = parse_date(intervalo["fim"])
            if ini <= hoje <= fim:
                return int(sem_str), int(ano_str), intervalo["inicio"], intervalo["fim"]

    return -1, -1, "", ""


# ---------------------------------------------------------------------------
# VALIDAÇÃO A1 — Calendário epidemiológico
# ---------------------------------------------------------------------------

print("=" * 65)
print("VALIDAÇÃO A1 — Calendário epidemiológico")
print("=" * 65)

cal = json.loads(CAL.read_text(encoding="utf-8"))
for ano, dados in sorted(cal.items()):
    n = len(dados["semanas"])
    s1 = dados["semanas"]["1"]
    sN = dados["semanas"][str(dados["total_semanas"])]
    print(f"  {ano}: {n} semanas  |  SE1: {s1['inicio']} – {s1['fim']}  |"
          f"  SE{n}: {sN['inicio']} – {sN['fim']}")

sem, ano, ini, fim = semana_atual()
print(f"\n>>> SEMANA EPIDEMIOLÓGICA ATUAL: SE {sem}/{ano}  ({ini} a {fim})")
if sem == 11 and ano == 2026:
    print("    [OK] Confirmado: SE 11/2026 - 15/03/2026 a 21/03/2026")
else:
    print(f"    [AVISO] Resultado diferente do esperado (SE 11/2026)")


# ---------------------------------------------------------------------------
# VALIDAÇÃO A2 — sinan_dengue_anual.csv
# ---------------------------------------------------------------------------

print("\n" + "=" * 65)
print("VALIDAÇÃO A2 — sinan_dengue_anual.csv  (SP)")
print("=" * 65)

rows_anual = ler_csv("sinan_dengue_anual.csv")
print(f"  Municípios SP encontrados: {len(rows_anual)}")

anos_uteis = ["2019","2020","2021","2022","2023","2024","2025","2026"]
totais_sp  = {}
for ano in anos_uteis:
    col = ano
    total = sum(r.get(col, 0) for r in rows_anual)
    totais_sp[ano] = total
    parcial = " (parcial)" if ano == "2026" else ""
    print(f"  SP {ano}{parcial}: {total:>12,}")

v2024 = totais_sp.get("2024", 0)
v2025 = totais_sp.get("2025", 0)
print(f"\n  Referência: SP 2024 ≈ 2.187.610  → encontrado: {v2024:,}")
print(f"  Referência: SP 2025 ≈   890.465  → encontrado: {v2025:,}")


# ---------------------------------------------------------------------------
# VALIDAÇÃO A3 — sinan_dengue_mensal.csv
# ---------------------------------------------------------------------------

print("\n" + "=" * 65)
print("VALIDAÇÃO A3 — sinan_dengue_mensal.csv  (SP — acumulado histórico)")
print("=" * 65)

rows_mensal = ler_csv("sinan_dengue_mensal.csv")
print(f"  Municípios SP encontrados: {len(rows_mensal)}")

meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
total_geral_mensal = 0
totais_mensais = {}
for m in meses:
    t = sum(r.get(m, 0) for r in rows_mensal)
    totais_mensais[m] = t
    total_geral_mensal += t

for m in meses:
    pct = totais_mensais[m] / total_geral_mensal * 100 if total_geral_mensal else 0
    print(f"  {m:3s}: {totais_mensais[m]:>10,}  ({pct:5.1f}%)")

pct_mar_abr = (totais_mensais.get("Mar", 0) + totais_mensais.get("Abr", 0)) / total_geral_mensal * 100
print(f"\n  Mar + Abr: {pct_mar_abr:.1f}%  (referência: ~47%)")


# ---------------------------------------------------------------------------
# VALIDAÇÃO A4 — sinan_dengue_semana_epidem.csv
# ---------------------------------------------------------------------------

print("\n" + "=" * 65)
print("VALIDAÇÃO A4 — sinan_dengue_semana_epidem.csv  (SP — acumulado histórico)")
print("=" * 65)

rows_semana = ler_csv("sinan_dengue_semana_epidem.csv")
print(f"  Municípios SP encontrados: {len(rows_semana)}")

# Detectar colunas de semanas (padrão "Semana 01" ou "01" etc.)
sem_cols = [c for c in rows_semana[0].keys() if c not in ("ibge","nome")
            and ("Semana" in c or re.match(r'^\d+$', c.strip()))]

total_semanas_val = 0
pico_sem = None
pico_val = 0
for col in sem_cols:
    t = sum(r.get(col, 0) for r in rows_semana)
    total_semanas_val += t
    if t > pico_val:
        pico_val = t
        pico_sem = col

print(f"  Total acumulado SP (semanas): {total_semanas_val:,}")
print(f"  Semana de pico SP: {pico_sem} — {pico_val:,} casos históricos")
print("  (Acumulado histórico — NÃO representa um único ano)")


# ---------------------------------------------------------------------------
# VALIDAÇÃO A5 — sinan_dengue_class_final.csv
# ---------------------------------------------------------------------------

print("\n" + "=" * 65)
print("VALIDAÇÃO A5 — sinan_dengue_class_final.csv  (SP)")
print("=" * 65)

rows_class = ler_csv("sinan_dengue_class_final.csv")
print(f"  Municípios SP encontrados: {len(rows_class)}")

col_names = list(rows_class[0].keys()) if rows_class else []
print(f"  Colunas: {[c for c in col_names if c not in ('ibge','nome')]}")

# Tentar localizar coluna de dengue grave e sinais de alarme
for col in col_names:
    if col in ("ibge","nome"):
        continue
    t = sum(r.get(col, 0) for r in rows_class)
    print(f"    {col:40s}: {t:>12,}")


# ---------------------------------------------------------------------------
# VALIDAÇÃO A6 — sinan_dengue_evolucao.csv
# ---------------------------------------------------------------------------

print("\n" + "=" * 65)
print("VALIDAÇÃO A6 — sinan_dengue_evolucao.csv  (SP)")
print("=" * 65)

rows_evol = ler_csv("sinan_dengue_evolucao.csv")
print(f"  Municípios SP encontrados: {len(rows_evol)}")
col_names_evol = list(rows_evol[0].keys()) if rows_evol else []
for col in col_names_evol:
    if col in ("ibge","nome"):
        continue
    t = sum(r.get(col, 0) for r in rows_evol)
    print(f"    {col:40s}: {t:>12,}")


# ---------------------------------------------------------------------------
# VALIDAÇÃO A7 — sinan_dengue_ocorreu_hospitalizacao.csv
# ---------------------------------------------------------------------------

print("\n" + "=" * 65)
print("VALIDAÇÃO A7 — sinan_dengue_ocorreu_hospitalizacao.csv  (SP)")
print("=" * 65)

rows_hosp = ler_csv("sinan_dengue_ocorreu_hospitalizacao.csv")
print(f"  Municípios SP encontrados: {len(rows_hosp)}")
col_names_hosp = list(rows_hosp[0].keys()) if rows_hosp else []

sim_total  = 0
nao_total  = 0
for r in rows_hosp:
    for col in col_names_hosp:
        if col in ("ibge","nome"):
            continue
        col_l = col.lower()
        if "sim" in col_l:
            sim_total += r.get(col, 0)
        elif "não" in col_l or "nao" in col_l:
            nao_total += r.get(col, 0)

denominador = sim_total + nao_total
taxa_hosp   = sim_total / denominador * 100 if denominador else 0
print(f"  Hospitalizados (Sim): {sim_total:>10,}")
print(f"  Não hospitalizados:   {nao_total:>10,}")
print(f"  Taxa hospitalização:  {taxa_hosp:.2f}%  (referência: ~2,8%)")
for col in col_names_hosp:
    if col in ("ibge","nome"):
        continue
    t = sum(r.get(col, 0) for r in rows_hosp)
    print(f"    {col:40s}: {t:>12,}")


# ---------------------------------------------------------------------------
# VALIDAÇÃO A8 — sinan_dengue_faixa_etaria.csv
# ---------------------------------------------------------------------------

print("\n" + "=" * 65)
print("VALIDAÇÃO A8 — sinan_dengue_faixa_etaria.csv  (SP)")
print("=" * 65)

rows_fx = ler_csv("sinan_dengue_faixa_etaria.csv")
print(f"  Municípios SP encontrados: {len(rows_fx)}")
col_names_fx = list(rows_fx[0].keys()) if rows_fx else []
for col in col_names_fx:
    if col in ("ibge","nome"):
        continue
    t = sum(r.get(col, 0) for r in rows_fx)
    print(f"    {col:40s}: {t:>12,}")


# ---------------------------------------------------------------------------
# VALIDAÇÃO A9 — sinan_dengue_sexo.csv
# ---------------------------------------------------------------------------

print("\n" + "=" * 65)
print("VALIDAÇÃO A9 — sinan_dengue_sexo.csv  (SP)")
print("=" * 65)

rows_sexo = ler_csv("sinan_dengue_sexo.csv")
print(f"  Municípios SP encontrados: {len(rows_sexo)}")
col_names_sexo = list(rows_sexo[0].keys()) if rows_sexo else []
for col in col_names_sexo:
    if col in ("ibge","nome"):
        continue
    t = sum(r.get(col, 0) for r in rows_sexo)
    print(f"    {col:40s}: {t:>12,}")


print("\n" + "=" * 65)
print("FASE A CONCLUÍDA — aguardando aprovação para Fase B")
print("=" * 65)
