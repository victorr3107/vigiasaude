#!/usr/bin/env python3
"""
VigiaSaúde — ETL SIASUS Produção Ambulatorial por Complexidade
==============================================================
Lê os CSVs exportados do TABNET/SIASUS e insere na tabela
siasus_producao_complexidade do Supabase.

Uso:
    python etl_siasus_complexidade.py --arquivo2024 complexidade_sp_2024.csv --arquivo2025 complexidade_sp_2025.csv
    python etl_siasus_complexidade.py --arquivo2024 complexidade_sp_2024.csv  (só um ano)
    python etl_siasus_complexidade.py --arquivo2024 complexidade_sp_2024.csv --dry-run
"""

import os
import re
import sys
import argparse
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv('.env.local')
load_dotenv()

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')


# ── Parser do CSV TABNET ──────────────────────────────────────────────────────
def parse_siasus_csv(caminho: str, ano: int) -> pd.DataFrame:
    """
    Lê CSV do TABNET/SIASUS (Latin-1, sep=;, aspas duplas extras).
    Retorna DataFrame com colunas padronizadas.
    """
    with open(caminho, encoding='latin1') as f:
        lines = f.readlines()

    rows = []
    for line in lines[1:]:  # pula cabeçalho
        line = line.strip()
        clean = line.strip('"').strip("'")

        # Só linhas com IBGE (6 dígitos no início)
        if not re.match(r'^\d{6}', clean):
            continue

        parts = line.strip('"').split(';')
        if len(parts) != 6:
            continue

        municipio = parts[0].strip('"').strip()
        ibge = municipio[:6]
        nome = municipio[7:].strip() if len(municipio) > 6 else municipio

        vals = []
        for p in parts[1:]:
            p = p.strip().strip('"').replace('.', '').replace('-', '0').strip()
            try:
                vals.append(int(p))
            except ValueError:
                vals.append(0)

        rows.append({
            'ibge':                ibge,
            'nome_municipio':      nome,
            'uf':                  'SP',
            'ano':                 ano,
            'atencao_basica':      vals[0],
            'media_complexidade':  vals[1],
            'alta_complexidade':   vals[2],
            'nao_se_aplica':       vals[3],
            'total':               vals[4],
        })

    return pd.DataFrame(rows)


# ── Busca municipio_id com paginação ─────────────────────────────────────────
def buscar_municipios(supabase: Client) -> dict[str, str]:
    """Retorna dict {ibge_6digitos: uuid}"""
    resultado = {}
    pagina, tamanho = 0, 1000

    while True:
        res = supabase.table('municipios').select('id, codigo_ibge') \
            .range(pagina * tamanho, (pagina + 1) * tamanho - 1).execute()
        if not res.data:
            break
        for row in res.data:
            codigo = str(row['codigo_ibge'])
            resultado[codigo]      = row['id']   # 7 dígitos
            resultado[codigo[:6]]  = row['id']   # 6 dígitos (prefixo TABNET)
        if len(res.data) < tamanho:
            break
        pagina += 1

    return resultado


# ── Upsert no Supabase ────────────────────────────────────────────────────────
def inserir_supabase(supabase: Client, df: pd.DataFrame, mapa: dict, dry_run: bool) -> dict:
    stats = {'total': 0, 'ok': 0, 'sem_municipio': 0, 'erro': 0}
    registros = []

    for _, row in df.iterrows():
        stats['total'] += 1
        municipio_id = mapa.get(row['ibge'])

        if not municipio_id:
            # Tenta com zero à esquerda
            municipio_id = mapa.get(row['ibge'].zfill(7))

        registros.append({
            'municipio_id':        municipio_id,    # pode ser None se não encontrar
            'codigo_ibge':         row['ibge'],
            'nome_municipio':      row['nome_municipio'],
            'uf':                  row['uf'],
            'ano':                 int(row['ano']),
            'atencao_basica':      int(row['atencao_basica']),
            'media_complexidade':  int(row['media_complexidade']),
            'alta_complexidade':   int(row['alta_complexidade']),
            'nao_se_aplica':       int(row['nao_se_aplica']),
            'total':               int(row['total']),
            'fonte':               'manual',
        })

        if not municipio_id:
            stats['sem_municipio'] += 1

    if dry_run:
        sem = stats['sem_municipio']
        print(f'\n[DRY RUN] {len(registros)} registros seriam inseridos ({sem} sem municipio_id)')
        print(df[['ibge', 'nome_municipio', 'atencao_basica', 'media_complexidade', 'total']].head(5).to_string(index=False))
        return stats

    # Upsert em lotes de 100
    for i in range(0, len(registros), 100):
        lote = registros[i:i+100]
        try:
            supabase.table('siasus_producao_complexidade').upsert(
                lote, on_conflict='codigo_ibge,ano'
            ).execute()
            stats['ok'] += len(lote)
            print(f'  ✓ Lote {i//100 + 1}: {len(lote)} registros inseridos/atualizados')
        except Exception as e:
            stats['erro'] += len(lote)
            print(f'  ✗ Erro no lote {i//100 + 1}: {e}')

    return stats


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='ETL SIASUS Complexidade → Supabase')
    parser.add_argument('--arquivo2024', help='CSV de 2024')
    parser.add_argument('--arquivo2025', help='CSV de 2025')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    if not args.arquivo2024 and not args.arquivo2025:
        print('Erro: informe ao menos um arquivo (--arquivo2024 ou --arquivo2025)')
        sys.exit(1)

    if not SUPABASE_URL or not SUPABASE_KEY:
        print('Erro: variáveis de ambiente não encontradas. Rode dentro da pasta vigiasaude.')
        sys.exit(1)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    print('  VigiaSaúde — ETL SIASUS Complexidade')
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    print('1. Lendo arquivos CSV...')
    dfs = []
    for arq, ano in [(args.arquivo2024, 2024), (args.arquivo2025, 2025)]:
        if not arq:
            continue
        try:
            df = parse_siasus_csv(arq, ano)
            print(f'   ✓ {ano}: {len(df)} municípios | Total SP: {df["total"].sum():,}')
            dfs.append(df)
        except Exception as e:
            print(f'   ✗ Erro ao ler {arq}: {e}')
            sys.exit(1)

    df_all = pd.concat(dfs, ignore_index=True)

    print(f'\n2. Carregando mapa de municípios do Supabase...')
    mapa = buscar_municipios(supabase)
    print(f'   ✓ {len(mapa)//2} municípios carregados')

    print(f'\n3. {"[DRY RUN] " if args.dry_run else ""}Inserindo {len(df_all)} registros...')
    stats = inserir_supabase(supabase, df_all, mapa, dry_run=args.dry_run)

    print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    print('  RESUMO')
    print(f'  Total processado:         {stats["total"]}')
    print(f'  Inseridos/atualizados:    {stats["ok"]}')
    print(f'  Sem municipio_id (ok):    {stats["sem_municipio"]}')
    print(f'  Erros:                    {stats["erro"]}')
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')


if __name__ == '__main__':
    main()