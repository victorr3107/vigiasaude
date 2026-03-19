#!/usr/bin/env python3
"""
VigiaSaúde — ETL SISAB Produção Consolidada
============================================
Lê os CSVs exportados do sisab.saude.gov.br e insere na tabela
sisab_producao_consolidada do Supabase.

Uso:
    # Inserir um conjunto de arquivos de um ano
    python etl_sisab_producao.py --pasta ./dados/2025 --ano 2025

    # Inserir arquivos específicos
    python etl_sisab_producao.py \\
        --individual sisab_atendimento_individual_2025.csv \\
        --odonto     sisab_atendimento_odontologico_2025.csv \\
        --procedimentos sisab_procedimentos_2025.csv \\
        --visitas    sisab_visita_domiciliar_2025.csv

Dependências:
    pip install supabase python-dotenv pandas
"""

import os
import re
import sys
import argparse
import pandas as pd
from datetime import date
from dotenv import load_dotenv
from supabase import create_client, Client

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv(".env.local")
load_dotenv()  # lê .env.local ou .env

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Meses em português → número
MESES_PT = {
    "JAN": 1, "FEV": 2, "MAR": 3, "ABR": 4,
    "MAI": 5, "JUN": 6, "JUL": 7, "AGO": 8,
    "SET": 9, "OUT": 10, "NOV": 11, "DEZ": 12,
}

# ── Parser do CSV SISAB ────────────────────────────────────────────────────────
def parse_sisab_csv(caminho: str) -> pd.DataFrame:
    """
    Lê um CSV do SISAB (ISO-8859-1, separador ;, com cabeçalho metadata).
    Retorna DataFrame com colunas: ibge, uf, municipio, competencia, quantidade
    (formato long — uma linha por município/mês).
    """
    # Encontra a linha com os cabeçalhos reais (começa com 'Uf;')
    linha_header = None
    with open(caminho, encoding="iso-8859-1") as f:
        for i, linha in enumerate(f):
            if linha.startswith("Uf;") or linha.startswith("UF;"):
                linha_header = i
                break

    if linha_header is None:
        raise ValueError(f"Cabeçalho não encontrado em {caminho}")

    # Lê o CSV a partir da linha de cabeçalho — dtype=str para evitar conversão automática
    df = pd.read_csv(
        caminho,
        encoding="iso-8859-1",
        sep=";",
        skiprows=linha_header,
        dtype=str,
    )

    # Remove colunas e linhas vazias
    df = df.dropna(how="all", axis=1)
    df = df.dropna(how="all", axis=0)

    # Mantém só linhas com código IBGE numérico válido (6 ou 7 dígitos)
    col_ibge = [c for c in df.columns if c.lower() in ("ibge", "cód. ibge", "cod_ibge")][0]
    col_uf   = [c for c in df.columns if c.lower() in ("uf",)][0]
    col_mun  = [c for c in df.columns if c.lower() in ("municipio", "município")][0]

    # Remove .0 de valores float-como-string e filtra IBGE válido
    df[col_ibge] = df[col_ibge].fillna("").astype(str).str.strip().str.split(".").str[0]
    df = df[df[col_ibge].str.match(r"^\d{6,7}$", na=False)].copy()

    # Identifica colunas de competência (padrão: MMM/AAAA)
    col_meses = [c for c in df.columns if re.match(r"^[A-Z]{3}/\d{4}$", str(c).strip())]

    if not col_meses:
        raise ValueError(f"Nenhuma coluna de competência (MMM/AAAA) encontrada em {caminho}")

    # Unpivot: wide → long
    df_long = df[[col_ibge, col_uf, col_mun] + col_meses].melt(
        id_vars=[col_ibge, col_uf, col_mun],
        value_vars=col_meses,
        var_name="competencia_str",
        value_name="quantidade",
    )

    df_long = df_long.rename(columns={
        col_ibge: "ibge",
        col_uf: "uf",
        col_mun: "municipio",
    })

    # Converte competência "DEZ/2025" → date(2025, 12, 1)
    def str_to_date(s: str) -> date:
        mes_str, ano_str = s.strip().split("/")
        return date(int(ano_str), MESES_PT[mes_str.upper()], 1)

    df_long["competencia"] = df_long["competencia_str"].apply(str_to_date)

    # Limpa quantidade: remove pontos de milhar (ex: "24.446" → 24446)
    df_long["quantidade"] = (
        df_long["quantidade"].fillna("0").astype(str)
        .str.strip()
        .str.replace(".", "", regex=False)   # remove ponto de milhar
        .str.replace(",", "", regex=False)   # remove vírgula decimal se houver
    )
    df_long["quantidade"] = pd.to_numeric(df_long["quantidade"], errors="coerce").fillna(0).astype(int)

    # Mantém IBGE como string com 6 dígitos (SISAB omite o dígito verificador)
    df_long["ibge"] = df_long["ibge"].astype(str).str.strip().str.split(".").str[0].str[:6]

    return df_long[["ibge", "uf", "municipio", "competencia", "quantidade"]]


# ── Merge dos 4 tipos ─────────────────────────────────────────────────────────
def merge_tipos(
    individual: pd.DataFrame,
    odonto: pd.DataFrame,
    procedimentos: pd.DataFrame,
    visitas: pd.DataFrame,
) -> pd.DataFrame:
    """
    Junta os 4 DataFrames (um por tipo de produção) em um único
    DataFrame com colunas separadas por tipo.
    """
    base = individual.rename(columns={"quantidade": "atendimento_individual"})

    base = base.merge(
        odonto[["ibge", "competencia", "quantidade"]].rename(columns={"quantidade": "atendimento_odonto"}),
        on=["ibge", "competencia"], how="outer",
    )
    base = base.merge(
        procedimentos[["ibge", "competencia", "quantidade"]].rename(columns={"quantidade": "procedimentos"}),
        on=["ibge", "competencia"], how="outer",
    )
    base = base.merge(
        visitas[["ibge", "competencia", "quantidade"]].rename(columns={"quantidade": "visita_domiciliar"}),
        on=["ibge", "competencia"], how="outer",
    )

    # Preenche NaN com 0
    for col in ["atendimento_individual", "atendimento_odonto", "procedimentos", "visita_domiciliar"]:
        base[col] = base[col].fillna(0).astype(int)

    return base


# ── Busca municipio_id no Supabase ────────────────────────────────────────────
def buscar_municipios(supabase: Client, ibges: list[str]) -> dict[str, str]:
    resultado = {}
    pagina = 0
    tamanho = 1000
    while True:
        res = supabase.table("municipios").select("id, codigo_ibge") \
            .range(pagina * tamanho, (pagina + 1) * tamanho - 1).execute()
        if not res.data:
            break
        for row in res.data:
            codigo = str(row["codigo_ibge"])
            resultado[codigo]     = row["id"]
            resultado[codigo[:6]] = row["id"]
        if len(res.data) < tamanho:
            break
        pagina += 1
    print(f"   ✓ {len(resultado)//2} municípios carregados do banco")
    return resultado


# ── Upsert no Supabase ────────────────────────────────────────────────────────
def inserir_supabase(supabase: Client, df: pd.DataFrame, dry_run: bool = False) -> dict:
    """
    Faz upsert na tabela sisab_producao_consolidada.
    Retorna estatísticas: total, inseridos, atualizados, erros.
    """
    ibges_unicos = df["ibge"].unique().tolist()
    mapa_municipios = buscar_municipios(supabase, ibges_unicos)

    stats = {"total": 0, "ok": 0, "sem_municipio": 0, "erro": 0}
    registros = []

    for _, row in df.iterrows():
        stats["total"] += 1
        municipio_id = mapa_municipios.get(row["ibge"])

        if not municipio_id:
            print(f"  ⚠ IBGE {row['ibge']} ({row.get('municipio', '?')}) não encontrado no banco")
            stats["sem_municipio"] += 1
            continue

        registros.append({
            "municipio_id":           municipio_id,
            "codigo_ibge":            row["ibge"],
            "uf":                     row["uf"],
            "competencia":            row["competencia"].isoformat(),
            "atendimento_individual": int(row["atendimento_individual"]),
            "atendimento_odonto":     int(row["atendimento_odonto"]),
            "procedimentos":          int(row["procedimentos"]),
            "visita_domiciliar":      int(row["visita_domiciliar"]),
            "fonte":                  "manual",
        })

    if dry_run:
        print(f"\n[DRY RUN] {len(registros)} registros seriam inseridos.")
        print(df.head(3).to_string())
        return stats

    # Upsert em lotes de 100
    for i in range(0, len(registros), 100):
        lote = registros[i:i+100]
        try:
            supabase.table("sisab_producao_consolidada").upsert(
                lote,
                on_conflict="municipio_id,competencia"
            ).execute()
            stats["ok"] += len(lote)
            print(f"  ✓ Lote {i//100 + 1}: {len(lote)} registros inseridos/atualizados")
        except Exception as e:
            stats["erro"] += len(lote)
            print(f"  ✗ Erro no lote {i//100 + 1}: {e}")

    return stats


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="ETL SISAB Produção → Supabase")
    parser.add_argument("--individual",     help="CSV atendimento individual")
    parser.add_argument("--odonto",         help="CSV atendimento odontológico")
    parser.add_argument("--procedimentos",  help="CSV procedimentos")
    parser.add_argument("--visitas",        help="CSV visitas domiciliares")
    parser.add_argument("--pasta",          help="Pasta com os 4 CSVs (usa nomes padrão)")
    parser.add_argument("--dry-run",        action="store_true", help="Simula sem inserir no banco")
    args = parser.parse_args()

    # Resolve caminhos se passou --pasta
    if args.pasta:
        pasta = args.pasta.rstrip("/")
        args.individual    = args.individual    or f"{pasta}/sisab_atendimento_individual_2025.csv"
        args.odonto        = args.odonto        or f"{pasta}/sisab_atendimento_odontologico_2025.csv"
        args.procedimentos = args.procedimentos or f"{pasta}/sisab_procedimentos_2025.csv"
        args.visitas       = args.visitas       or f"{pasta}/sisab_visita_domiciliar_2025.csv"

    # Valida argumentos
    if not all([args.individual, args.odonto, args.procedimentos, args.visitas]):
        print("Erro: informe os 4 arquivos CSV ou use --pasta.")
        print("Use --help para ver as opções.")
        sys.exit(1)

    # Conecta ao Supabase
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Erro: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não encontrados no .env")
        sys.exit(1)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  VigiaSaúde — ETL SISAB Produção Consolidada")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

    # Parse dos 4 arquivos
    print("1. Lendo arquivos CSV...")
    try:
        df_individual    = parse_sisab_csv(args.individual)
        print(f"   ✓ Atendimento Individual:   {len(df_individual)} linhas")

        df_odonto        = parse_sisab_csv(args.odonto)
        print(f"   ✓ Atendimento Odontológico: {len(df_odonto)} linhas")

        df_procedimentos = parse_sisab_csv(args.procedimentos)
        print(f"   ✓ Procedimentos:            {len(df_procedimentos)} linhas")

        df_visitas       = parse_sisab_csv(args.visitas)
        print(f"   ✓ Visitas Domiciliares:     {len(df_visitas)} linhas")
    except Exception as e:
        print(f"   ✗ Erro ao ler CSV: {e}")
        sys.exit(1)

    # Merge
    print("\n2. Consolidando tipos de produção...")
    df_merged = merge_tipos(df_individual, df_odonto, df_procedimentos, df_visitas)
    print(f"   ✓ {len(df_merged)} registros (município × competência)")

    # Preview
    print("\n3. Preview dos dados:")
    print(df_merged.to_string(index=False))

    # Inserção
    print(f"\n4. {'[DRY RUN] ' if args.dry_run else ''}Inserindo no Supabase...")
    stats = inserir_supabase(supabase, df_merged, dry_run=args.dry_run)

    # Resumo
    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  RESUMO")
    print(f"  Total processado:  {stats['total']}")
    print(f"  Inseridos/atualizados: {stats['ok']}")
    print(f"  Município não encontrado: {stats['sem_municipio']}")
    print(f"  Erros:             {stats['erro']}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")


if __name__ == "__main__":
    main()