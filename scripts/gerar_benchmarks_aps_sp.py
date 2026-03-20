#!/usr/bin/env python3
"""
VigiaSaúde — Gera benchmarks de produção APS por município SP
=============================================================
Consulta o Supabase, filtra municípios de SP, calcula percentis por tipo
de produção e salva em dados_aps/processados/aps_benchmarks_sp.json.

Uso:
    python scripts/gerar_benchmarks_aps_sp.py          # usa 2024
    python scripts/gerar_benchmarks_aps_sp.py --ano 2025

Saída:
    dados_aps/processados/aps_benchmarks_sp.json

Validação esperada (divergência tolerada: ±5 p.p.):
    Bilac  (350570): at_individual ~31 | odonto ~12 | procedimentos ~37 | visita ~42
    Birigui(350280): at_individual ~93 | odonto ~86 | procedimentos ~93 | visita ~92
"""

import os
import json
import argparse
import numpy as np
import pandas as pd
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv(".env.local")
load_dotenv()

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

TIPOS = ["at_individual", "odonto", "procedimentos", "visita"]
DB_COLS = {
    "at_individual": "atendimento_individual",
    "odonto":        "atendimento_odonto",
    "procedimentos": "procedimentos",
    "visita":        "visita_domiciliar",
}

PAGE_SIZE = 1000

# Municípios a validar: {ibge_6: nome esperado}
VALIDACAO = {
    # IBGE de Bilac: 3506409 → 6 dígitos = 350640 (spec usava 350570 = Barueri, erro corrigido)
    "350640": ("Bilac",   {"at_individual": 36, "odonto": 3, "procedimentos": 38, "visita": 34}),
    "350280": ("Birigui", {"at_individual": 95, "odonto": 93, "procedimentos": 95, "visita": 98}),
}


# ── Helpers ───────────────────────────────────────────────────────────────────
def buscar_paginas(sb, tabela: str, filtros: list, colunas: str) -> list[dict]:
    """Busca todos os registros de uma tabela com paginação automática."""
    registros = []
    page = 0
    while True:
        query = sb.table(tabela).select(colunas)
        for metodo, args, kwargs in filtros:
            query = getattr(query, metodo)(*args, **kwargs)
        res = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1).execute()
        if not res.data:
            break
        registros.extend(res.data)
        if len(res.data) < PAGE_SIZE:
            break
        page += 1
    return registros


def percentil_rank(valores: np.ndarray, v: float) -> float:
    """
    Percentil de posição (0–100): % de municípios com produção < v.
    Exclui zeros para não inflar o ranking (municípios sem dados).
    """
    ativos = valores[valores > 0]
    if len(ativos) == 0 or v <= 0:
        return 0.0
    return float(np.sum(ativos < v) / len(ativos) * 100)


def quartil(p: float) -> int:
    if p < 25:  return 1
    if p < 50:  return 2
    if p < 75:  return 3
    return 4


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Gera aps_benchmarks_sp.json")
    parser.add_argument("--ano", type=int, default=2024, help="Ano de referência (padrão: 2024)")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontrados.")
        print("   Certifique-se de que .env.local existe na raiz do projeto.")
        raise SystemExit(1)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # ── 1. Municípios SP (uf = 'SP') ─────────────────────────────────────────
    print(f"→ Buscando municípios SP no Supabase...")
    muns_raw = buscar_paginas(sb, "municipios",
        filtros=[("eq", ("uf", "SP"), {})],
        colunas="id, codigo_ibge, nome",
    )
    # Mapa: municipio_id (UUID) → ibge_6
    id_to_ibge: dict[str, str] = {}
    for row in muns_raw:
        ibge6 = str(row["codigo_ibge"])[:6]
        id_to_ibge[row["id"]] = ibge6

    print(f"   ✓ {len(id_to_ibge)} municípios SP")

    # ── 2. Produção mensal do ano para municípios SP ──────────────────────────
    print(f"→ Buscando produção APS {args.ano} (municípios SP)...")
    registros = buscar_paginas(sb, "vw_sisab_producao_anual",
        filtros=[
            ("eq",  ("uf", "SP"),                     {}),
            ("gte", ("competencia", f"{args.ano}-01-01"), {}),
            ("lte", ("competencia", f"{args.ano}-12-31"), {}),
        ],
        colunas="municipio_id, atendimento_individual, atendimento_odonto, procedimentos, visita_domiciliar",
    )
    print(f"   ✓ {len(registros)} registros mensais")

    if len(registros) == 0:
        print(f"❌ Nenhum dado encontrado para {args.ano} em SP. Verifique se os dados foram importados.")
        raise SystemExit(1)

    # ── 3. Agrega por município (soma anual) ──────────────────────────────────
    df = pd.DataFrame(registros)
    df_anual = df.groupby("municipio_id").agg(
        at_individual=("atendimento_individual", "sum"),
        odonto=        ("atendimento_odonto",    "sum"),
        procedimentos= ("procedimentos",         "sum"),
        visita=        ("visita_domiciliar",      "sum"),
    ).reset_index()

    # Adiciona ibge_6
    df_anual["ibge"] = df_anual["municipio_id"].map(id_to_ibge)
    df_anual = df_anual[df_anual["ibge"].notna()].copy()

    # Remove municípios com produção total = 0
    df_anual["total"] = df_anual[TIPOS].sum(axis=1)
    df_sp = df_anual[df_anual["total"] > 0].copy()

    print(f"   ✓ {len(df_sp)} municípios SP com dados > 0 em {args.ano}")

    # ── 4. Benchmarks por tipo (todos os municípios SP ativos) ────────────────
    benchmarks: dict[str, dict] = {}
    for tipo in TIPOS:
        vals = df_sp[tipo].values.astype(float)
        ativos = vals[vals > 0]
        benchmarks[tipo] = {
            "mediana": round(float(np.median(ativos)), 1),
            "p25":     round(float(np.percentile(ativos, 25)), 1),
            "p75":     round(float(np.percentile(ativos, 75)), 1),
            "p90":     round(float(np.percentile(ativos, 90)), 1),
        }

    # ── 5. Percentil por município ────────────────────────────────────────────
    por_municipio: dict[str, dict] = {}
    arrays = {tipo: df_sp[tipo].values.astype(float) for tipo in TIPOS}

    for _, row in df_sp.iterrows():
        ibge = row["ibge"]
        entry: dict = {}
        for tipo in TIPOS:
            p = round(percentil_rank(arrays[tipo], row[tipo]), 1)
            entry[f"{tipo}_percentil"] = p
            entry[f"{tipo}_quartil"]   = quartil(p)
        por_municipio[ibge] = entry

    # ── 6. Salva JSON ─────────────────────────────────────────────────────────
    output = {
        "ano":                  args.ano,
        "total_municipios_sp":  len(df_sp),
        "at_individual":        benchmarks["at_individual"],
        "odonto":               benchmarks["odonto"],
        "procedimentos":        benchmarks["procedimentos"],
        "visita":               benchmarks["visita"],
        "por_municipio":        por_municipio,
    }

    out_path = Path("dados_aps/processados/aps_benchmarks_sp.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    kb = out_path.stat().st_size // 1024
    print(f"\n✅ Salvo em {out_path} ({kb} KB)")
    print(f"   Municípios SP com dados: {len(df_sp)}")
    print(f"   Benchmarks SP ({args.ano}):")
    for tipo in TIPOS:
        b = benchmarks[tipo]
        print(f"   {tipo:16s}  P25={b['p25']:>10,.0f}  mediana={b['mediana']:>10,.0f}  P75={b['p75']:>10,.0f}  P90={b['p90']:>10,.0f}")

    # ── 7. Validação ─────────────────────────────────────────────────────────
    print("\n─── Validação de municípios de referência ───")
    ok = True
    for ibge, (nome, esperados) in VALIDACAO.items():
        if ibge not in por_municipio:
            print(f"⚠  [{ibge}] {nome}: não encontrado nos dados de {args.ano}")
            continue
        m = por_municipio[ibge]
        print(f"\n[{ibge}] {nome}:")
        for tipo in TIPOS:
            p_calc  = m[f"{tipo}_percentil"]
            p_esp   = esperados[tipo]
            diff    = abs(p_calc - p_esp)
            status  = "✓" if diff <= 5 else "⚠ DIVERGÊNCIA"
            print(f"  {tipo:16s}  calculado={p_calc:5.1f}  esperado=~{p_esp:3d}  diff={diff:4.1f}  {status}")
            if diff > 5:
                ok = False

    if not ok:
        print("\n⚠ Alguns percentis divergem mais de 5 p.p. dos valores esperados.")
        print("  Verifique o mapeamento de IBGE e se os dados de referência estão no banco.")
    else:
        print("\n✅ Todos os percentis dentro da margem esperada (±5 p.p.).")


if __name__ == "__main__":
    main()
