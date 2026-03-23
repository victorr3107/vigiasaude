#!/usr/bin/env python3
"""
scripts/processar_siasus.py
Gera os novos JSONs nacionais do SIASUS em dados_ambulatorial/processados/.

Uso:
  python processar_siasus.py        → gera todos
  python processar_siasus.py 1      → gera apenas JSON 1
  python processar_siasus.py 1 2 3  → gera JSONs 1, 2 e 3

JSONs gerados:
  1. siasus_complexidade_anual.json
  2. siasus_complexidade_mensal.json
  3. siasus_carater_anual.json
  4. siasus_forma_org_anual.json
  5. siasus_glosa_anual.json         ← requer siasus_glosa_complexidade_*.csv (AUSENTE)
  6. siasus_financiamento_anual.json
  7. siasus_tipo_prestador.json      ← requer siasus_tipo_prestador.csv (AUSENTE)
  8. siasus_benchmarks_nacional.json
"""

import sys
import re
import json
import os
from collections import defaultdict

import pandas as pd
import numpy as np

# ── constantes ────────────────────────────────────────────────────────────────

BASE_DIR   = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dados_ambulatorial')
SIASUS_DIR = os.path.join(BASE_DIR, 'siasus')
OUT_DIR    = os.path.join(BASE_DIR, 'processados')
ARACATUBA  = '350280'
ANOS       = ['2022', '2023', '2024', '2025']

MES_ORD = {
    'Jan': 1, 'Fev': 2, 'Mar': 3, 'Abr': 4, 'Mai': 5, 'Jun': 6,
    'Jul': 7, 'Ago': 8, 'Set': 9, 'Out': 10, 'Nov': 11, 'Dez': 12,
}

GRUPOS_FORM_ORG = {
    '01': 'Promoção e Prevenção em Saúde',
    '02': 'Diagnóstico',
    '03': 'Clínicas',
    '04': 'Cirúrgicas',
    '05': 'Transplante de Órgãos, Tecidos e Células',
    '06': 'Medicamentos',
    '07': 'Órtese, Prótese e Materiais Especiais',
    '08': 'Ações Complementares da Atenção à Saúde',
}

os.makedirs(OUT_DIR, exist_ok=True)

# ── parser universal ──────────────────────────────────────────────────────────

def parse_tabnet(filepath: str, encoding: str = 'windows-1252'):
    rows = []
    with open(filepath, 'r', encoding=encoding) as f:
        for line in f:
            line = line.strip().strip('"')
            line = re.sub(r'"+', '', line)
            parts = [p.strip() for p in line.split(';')]
            rows.append(parts)

    raw_cols = rows[0]
    df = pd.DataFrame(rows[1:], columns=raw_cols[:len(rows[1])])

    mun_col = raw_cols[0]
    df = df[df[mun_col].str.match(r'^\d{6}', na=False)].copy()
    df[mun_col] = df[mun_col].str.strip()

    for col in df.columns[1:]:
        df[col] = (
            df[col].astype(str)
                   .str.replace('.', '', regex=False)
                   .str.replace(',', '.', regex=False)
                   .str.replace('-', '0', regex=False)
                   .str.strip()
        )
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    return df, mun_col

# ── helpers ───────────────────────────────────────────────────────────────────

def extrair_ibge(s: str):
    m = re.match(r'^(\d{6,7})', str(s).strip())
    return m.group(1)[:6] if m else None

def add_ibge_index(df, mun_col):
    """Extrai IBGE-6, filtra linhas válidas, seta como índice e remove mun_col."""
    df = df.copy()
    df['ibge'] = df[mun_col].apply(extrair_ibge)
    df = df[df['ibge'].notna()].drop(columns=[mun_col]).set_index('ibge')
    return df

def clamp_pct(v):
    if v is None:
        return None
    return max(0.0, min(100.0, round(float(v), 4)))

def safe_pct(num, denom):
    if not denom:
        return 0.0
    return clamp_pct(num / denom * 100)

def var_pct(novo, antigo):
    if not antigo:
        return None
    return round((float(novo) - float(antigo)) / float(antigo) * 100, 2)

def var_pp(novo_pct, antigo_pct):
    if novo_pct is None or antigo_pct is None:
        return None
    return round(float(novo_pct) - float(antigo_pct), 4)

def mes_to_order(mes: str) -> int:
    try:
        ano, mmm = mes.split('/')
        return int(ano) * 100 + MES_ORD.get(mmm, 0)
    except Exception:
        return 0

def colunas_temporais_df(df):
    """Retorna colunas mensais (2022/ em diante, exclui 2026/), ordenadas."""
    excluir = {'ibge', 'Total'}
    cols = [
        c for c in df.columns
        if c not in excluir and re.match(r'^\d{4}/', c)
        and not c.startswith('2026') and not c.startswith('2021')
    ]
    return sorted(cols, key=mes_to_order)

def stats(vals):
    arr = [v for v in vals if v is not None and not np.isnan(v)]
    if not arr:
        return {'media': None, 'mediana': None, 'p25': None, 'p75': None, 'p90': None}
    return {
        'media':   round(float(np.mean(arr)), 4),
        'mediana': round(float(np.median(arr)), 4),
        'p25':     round(float(np.percentile(arr, 25)), 4),
        'p75':     round(float(np.percentile(arr, 75)), 4),
        'p90':     round(float(np.percentile(arr, 90)), 4),
    }

def salvar(nome: str, dados: dict) -> str:
    path = os.path.join(OUT_DIR, nome)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False, separators=(',', ':'))
    return path

def all_ibge_from(*dfs):
    s = set()
    for d in dfs:
        if d is not None:
            s |= set(d.index)
    return sorted(s)

# ═══════════════════════════════════════════════════════════════════════════════
# JSON 1 — siasus_complexidade_anual.json
# ═══════════════════════════════════════════════════════════════════════════════

def gerar_1_complexidade_anual():
    print("\n[1/8] Gerando siasus_complexidade_anual.json…")

    dfs_ano = {}
    for ano in ANOS:
        path = os.path.join(SIASUS_DIR, f'siasus_complexidade_{ano}.csv')
        if not os.path.exists(path):
            print(f"  AVISO: {path} não encontrado")
            continue
        df, mun_col = parse_tabnet(path)
        dfs_ano[ano] = add_ibge_index(df, mun_col)

    if not dfs_ano:
        print("  ERRO: nenhum arquivo de complexidade encontrado.")
        return

    all_ibge = all_ibge_from(*dfs_ano.values())
    print(f"  Municípios encontrados: {len(all_ibge)}")

    result = {}

    for ibge in all_ibge:
        por_ano = {}

        for ano, df in dfs_ano.items():
            if ibge not in df.index:
                continue
            row = df.loc[ibge]
            # colunas por posição: AB=0, MC=1, AC=2, NA=3
            data_cols = [c for c in df.columns if c != 'Total']

            def gcol(pos):
                if pos < len(data_cols):
                    v = row.get(data_cols[pos], 0)
                    return float(v) if v is not None else 0.0
                return 0.0

            ab = gcol(0)   # Atenção Básica
            mc = gcol(1)   # Média complexidade
            ac = gcol(2)   # Alta complexidade
            na = gcol(3)   # Não se aplica
            denom = ab + mc + ac + na

            por_ano[ano] = {
                'ab':    {'qtd': int(ab), 'pct': safe_pct(ab, denom)},
                'mc':    {'qtd': int(mc), 'pct': safe_pct(mc, denom)},
                'ac':    {'qtd': int(ac), 'pct': safe_pct(ac, denom)},
                'na':    {'qtd': int(na), 'pct': safe_pct(na, denom)},
                'total': int(denom),
            }

        # variações 2024→2025
        ac24 = por_ano.get('2024', {}).get('ac', {}).get('qtd', 0) or 0
        ac25 = por_ano.get('2025', {}).get('ac', {}).get('qtd', 0) or 0
        mc24 = por_ano.get('2024', {}).get('mc', {}).get('qtd', 0) or 0
        mc25 = por_ano.get('2025', {}).get('mc', {}).get('qtd', 0) or 0
        ab24 = por_ano.get('2024', {}).get('ab', {}).get('qtd', 0) or 0
        ab25 = por_ano.get('2025', {}).get('ab', {}).get('qtd', 0) or 0

        # perfil 2025
        pct_ac = por_ano.get('2025', {}).get('ac', {}).get('pct', 0) or 0
        pct_mc = por_ano.get('2025', {}).get('mc', {}).get('pct', 0) or 0
        pct_ab = por_ano.get('2025', {}).get('ab', {}).get('pct', 0) or 0

        if pct_ac > 60:
            perfil = 'POLO_AC'
        elif pct_mc > 50 and pct_ac < 30:
            perfil = 'POLO_MC'
        elif pct_ab > 50:
            perfil = 'AB_DOMINANTE'
        else:
            perfil = 'EQUILIBRADO'

        result[ibge] = {
            'por_ano':        por_ano,
            'var_ac_2425_pct': var_pct(ac25, ac24),
            'var_mc_2425_pct': var_pct(mc25, mc24),
            'var_ab_2425_pct': var_pct(ab25, ab24),
            'perfil_2025':    perfil,
        }

    # ── Validação Araçatuba ──────────────────────────────────────────────────
    if ARACATUBA in result:
        r = result[ARACATUBA]
        print(f"  === Validação {ARACATUBA} ===")
        for ano in ANOS:
            p = r['por_ano'].get(ano, {})
            ab  = p.get('ab', {}).get('qtd', 0)
            mc  = p.get('mc', {}).get('qtd', 0)
            ac  = p.get('ac', {}).get('qtd', 0)
            tot = p.get('total', 0)
            pac = p.get('ac', {}).get('pct', 0)
            print(f"    {ano}: AB={ab:>10,}  MC={mc:>10,}  AC={ac:>10,}  Total={tot:>10,}  %AC={pac:.1f}%")
        print(f"    var_ac_2425: {r['var_ac_2425_pct']}%  "
              f"var_mc_2425: {r['var_mc_2425_pct']}%  "
              f"perfil_2025: {r['perfil_2025']}")
    else:
        print(f"  AVISO: Município {ARACATUBA} não encontrado!")

    path = salvar('siasus_complexidade_anual.json', result)
    print(f"  [OK] {path} — {len(result)} municípios")

# ═══════════════════════════════════════════════════════════════════════════════
# JSON 2 — siasus_complexidade_mensal.json
# ═══════════════════════════════════════════════════════════════════════════════

def gerar_2_complexidade_mensal():
    print("\n[2/8] Gerando siasus_complexidade_mensal.json…")

    dfs = {}
    for comp in ('ab', 'mc', 'ac'):
        path = os.path.join(SIASUS_DIR, f'siasus_mensal_{comp}_nacional.csv')
        if not os.path.exists(path):
            print(f"  AVISO: {path} não encontrado")
            continue
        df, mun_col = parse_tabnet(path)
        dfs[comp] = add_ibge_index(df, mun_col)

    if not dfs:
        print("  ERRO: nenhum arquivo mensal encontrado.")
        return

    # meses disponíveis (união dos 3, excluindo 2021 e 2026)
    todos_meses = set()
    for comp, df in dfs.items():
        todos_meses |= set(colunas_temporais_df(df))
    todos_meses = sorted(todos_meses, key=mes_to_order)

    all_ibge = all_ibge_from(*dfs.values())
    print(f"  Municipios: {len(all_ibge)}  |  Meses: {len(todos_meses)}  ({todos_meses[0]} a {todos_meses[-1]})")

    result = {}

    for ibge in all_ibge:
        por_mes = []
        for mes in todos_meses:
            def gmes(comp):
                df = dfs.get(comp)
                if df is None or ibge not in df.index or mes not in df.columns:
                    return 0
                return int(float(df.loc[ibge, mes]))

            ab = gmes('ab')
            mc = gmes('mc')
            ac = gmes('ac')
            if ab == 0 and mc == 0 and ac == 0:
                continue
            por_mes.append({'mes': mes, 'ab': ab, 'mc': mc, 'ac': ac})

        result[ibge] = {'por_mes': por_mes}

    # ── Validação Araçatuba ──────────────────────────────────────────────────
    if ARACATUBA in result:
        r = result[ARACATUBA]
        print(f"  === Validação {ARACATUBA} ===")
        for ano in ANOS:
            meses_ano = [m for m in r['por_mes'] if m['mes'].startswith(ano)]
            tot_ab = sum(m['ab'] for m in meses_ano)
            tot_mc = sum(m['mc'] for m in meses_ano)
            tot_ac = sum(m['ac'] for m in meses_ano)
            print(f"    {ano}: AB={tot_ab:>10,}  MC={tot_mc:>10,}  AC={tot_ac:>10,}  Total={tot_ab+tot_mc+tot_ac:>10,}")
        print(f"    Meses com dado: {len(r['por_mes'])}")
    else:
        print(f"  AVISO: Município {ARACATUBA} não encontrado!")

    path = salvar('siasus_complexidade_mensal.json', result)
    print(f"  [OK] {path} — {len(result)} municípios")

# ═══════════════════════════════════════════════════════════════════════════════
# JSON 3 — siasus_carater_anual.json
# ═══════════════════════════════════════════════════════════════════════════════

def gerar_3_carater_anual():
    print("\n[3/8] Gerando siasus_carater_anual.json…")

    dfs_ano = {}
    for ano in ANOS:
        path = os.path.join(SIASUS_DIR, f'siasus_carater_{ano}.csv')
        if not os.path.exists(path):
            print(f"  AVISO: {path} não encontrado")
            continue
        df, mun_col = parse_tabnet(path)
        dfs_ano[ano] = add_ibge_index(df, mun_col)

    if not dfs_ano:
        print("  ERRO: nenhum arquivo de caráter encontrado.")
        return

    all_ibge = all_ibge_from(*dfs_ano.values())
    print(f"  Municípios encontrados: {len(all_ibge)}")

    result = {}

    for ibge in all_ibge:
        por_ano = {}

        for ano, df in dfs_ano.items():
            if ibge not in df.index:
                continue
            row = df.loc[ibge]
            data_cols = [c for c in df.columns if c != 'Total']

            def gcol(pos):
                if pos < len(data_cols):
                    v = row.get(data_cols[pos], 0)
                    return float(v) if v is not None else 0.0
                return 0.0

            # posições:
            # 0=Eletivo, 1=Urgência, 2=Acidente trabalho, 3=Acidente trajeto,
            # 4=Outros trânsito, 5=Outros lesões, 6=BPA-C (informação inexistente)
            eletivo  = gcol(0)
            urgencia = gcol(1)
            acid1    = gcol(2)  # trabalho
            acid2    = gcol(3)  # trajeto
            acid3    = gcol(4)  # outros trânsito
            acid4    = gcol(5)  # outros lesões
            bpa      = gcol(6)

            acidentes = acid1 + acid2 + acid3 + acid4
            total     = eletivo + urgencia + acidentes + bpa

            por_ano[ano] = {
                'eletivo':   {'qtd': int(eletivo),  'pct': safe_pct(eletivo,  total)},
                'urgencia':  {'qtd': int(urgencia), 'pct': safe_pct(urgencia, total)},
                'acidentes': {'qtd': int(acidentes),'pct': safe_pct(acidentes,total)},
                'bpa':       {'qtd': int(bpa),      'pct': safe_pct(bpa,      total)},
                'total':     int(total),
            }

        # variação em pp (pontos percentuais) 2024→2025
        urg24  = por_ano.get('2024', {}).get('urgencia', {}).get('pct', None)
        urg25  = por_ano.get('2025', {}).get('urgencia', {}).get('pct', None)
        elet24 = por_ano.get('2024', {}).get('eletivo',  {}).get('pct', None)
        elet25 = por_ano.get('2025', {}).get('eletivo',  {}).get('pct', None)

        result[ibge] = {
            'por_ano':            por_ano,
            'var_urgencia_2425_pp': var_pp(urg25, urg24),
            'var_eletivo_2425_pp':  var_pp(elet25, elet24),
        }

    # ── Validação Araçatuba ──────────────────────────────────────────────────
    if ARACATUBA in result:
        r = result[ARACATUBA]
        print(f"  === Validação {ARACATUBA} ===")
        for ano in ANOS:
            p = r['por_ano'].get(ano, {})
            el  = p.get('eletivo', {})
            urg = p.get('urgencia', {})
            tot = p.get('total', 0)
            print(f"    {ano}: Eletivo={el.get('qtd',0):>8,} ({el.get('pct',0):.1f}%)  "
                  f"Urgência={urg.get('qtd',0):>8,} ({urg.get('pct',0):.1f}%)  "
                  f"Total={tot:>10,}")
        print(f"    var_urgencia_2425_pp: {r['var_urgencia_2425_pp']}pp  "
              f"var_eletivo_2425_pp: {r['var_eletivo_2425_pp']}pp")
    else:
        print(f"  AVISO: Município {ARACATUBA} não encontrado!")

    path = salvar('siasus_carater_anual.json', result)
    print(f"  [OK] {path} — {len(result)} municípios")

# ═══════════════════════════════════════════════════════════════════════════════
# JSON 4 — siasus_forma_org_anual.json
# ═══════════════════════════════════════════════════════════════════════════════

def gerar_4_forma_org_anual():
    print("\n[4/8] Gerando siasus_forma_org_anual.json…")

    dfs_ano = {}
    for ano in ANOS:
        path = os.path.join(SIASUS_DIR, f'siasus_forma_org_{ano}.csv')
        if not os.path.exists(path):
            print(f"  AVISO: {path} não encontrado")
            continue
        df, mun_col = parse_tabnet(path)
        dfs_ano[ano] = add_ibge_index(df, mun_col)

    if not dfs_ano:
        print("  ERRO: nenhum arquivo de forma_org encontrado.")
        return

    all_ibge = all_ibge_from(*dfs_ano.values())
    print(f"  Municípios encontrados: {len(all_ibge)}")

    result = {}

    for ibge in all_ibge:
        por_ano = {}

        for ano, df in dfs_ano.items():
            if ibge not in df.index:
                continue
            row = df.loc[ibge]

            # agrupar colunas pelo prefixo de 2 dígitos (código do grupo)
            grupos_agg = defaultdict(float)
            for col in df.columns:
                if col == 'Total':
                    continue
                prefix = col[:2]
                if prefix not in GRUPOS_FORM_ORG:
                    continue
                v = row.get(col, 0)
                grupos_agg[prefix] += float(v) if v is not None else 0.0

            total = sum(grupos_agg.values())
            grupos = []
            for prefix, nome_grupo in GRUPOS_FORM_ORG.items():
                qtd = grupos_agg.get(prefix, 0.0)
                if qtd == 0:
                    continue
                grupos.append({
                    'codigo': prefix,
                    'nome':   nome_grupo,
                    'qtd':    int(qtd),
                    'pct':    safe_pct(qtd, total),
                })
            grupos.sort(key=lambda g: g['qtd'], reverse=True)

            por_ano[ano] = {
                'grupos': grupos,
                'total':  int(total),
            }

        # grupo que mais cresceu e mais caiu 2024→2025
        grupo_mais_cresceu = None
        grupo_mais_caiu    = None

        grupos_2024 = {g['codigo']: g['qtd'] for g in por_ano.get('2024', {}).get('grupos', [])}
        grupos_2025 = {g['codigo']: g['qtd'] for g in por_ano.get('2025', {}).get('grupos', [])}

        variacoes = []
        for codigo in set(grupos_2024) | set(grupos_2025):
            q24 = grupos_2024.get(codigo, 0)
            q25 = grupos_2025.get(codigo, 0)
            vp  = var_pct(q25, q24)
            if vp is not None:
                variacoes.append({'codigo': codigo, 'nome': GRUPOS_FORM_ORG.get(codigo, codigo), 'var_pct': vp})

        if variacoes:
            variacoes.sort(key=lambda x: x['var_pct'], reverse=True)
            grupo_mais_cresceu = variacoes[0]
            grupo_mais_caiu    = variacoes[-1]

        result[ibge] = {
            'por_ano':               por_ano,
            'grupo_mais_cresceu_2425': grupo_mais_cresceu,
            'grupo_mais_caiu_2425':    grupo_mais_caiu,
        }

    # ── Validação Araçatuba ──────────────────────────────────────────────────
    if ARACATUBA in result:
        r = result[ARACATUBA]
        print(f"  === Validação {ARACATUBA} ===")
        for ano in ANOS:
            p = r['por_ano'].get(ano, {})
            g1 = p.get('grupos', [{}])[0] if p.get('grupos') else {}
            print(f"    {ano}: Total={p.get('total', 0):>10,}  "
                  f"Top grupo: {g1.get('nome','—')} ({g1.get('pct',0):.1f}%)")
        print(f"    Mais cresceu: {r['grupo_mais_cresceu_2425']}")
        print(f"    Mais caiu:    {r['grupo_mais_caiu_2425']}")
    else:
        print(f"  AVISO: Município {ARACATUBA} não encontrado!")

    path = salvar('siasus_forma_org_anual.json', result)
    print(f"  [OK] {path} — {len(result)} municípios")

# ═══════════════════════════════════════════════════════════════════════════════
# JSON 5 — siasus_glosa_anual.json  ← ARQUIVO FONTE AUSENTE
# ═══════════════════════════════════════════════════════════════════════════════

def gerar_5_glosa_anual():
    print("\n[5/8] siasus_glosa_anual.json")
    glosa_path = os.path.join(SIASUS_DIR, 'siasus_glosa_complexidade_2022.csv')
    if not os.path.exists(glosa_path):
        print("  [PULADO] siasus_glosa_complexidade_[2022..2025].csv ausentes.")
        print("  Forneca esses arquivos para gerar glosa por complexidade por ano.")
        return
    # implementação pendente de arquivo fonte
    print("  [OK] (stub — arquivos encontrados mas implementação pendente)")

# ═══════════════════════════════════════════════════════════════════════════════
# JSON 6 — siasus_financiamento_anual.json
# ═══════════════════════════════════════════════════════════════════════════════

def gerar_6_financiamento_anual():
    print("\n[6/8] Gerando siasus_financiamento_anual.json…")

    dfs_ano = {}
    for ano in ANOS:
        path = os.path.join(SIASUS_DIR, f'siasus_financiamento_{ano}.csv')
        if not os.path.exists(path):
            print(f"  AVISO: {path} não encontrado")
            continue
        df, mun_col = parse_tabnet(path)
        dfs_ano[ano] = add_ibge_index(df, mun_col)

    if not dfs_ano:
        print("  ERRO: nenhum arquivo de financiamento encontrado.")
        return

    # descobre nomes de fontes do primeiro DF disponível
    df_ref   = next(iter(dfs_ano.values()))
    fontes_cols = [c for c in df_ref.columns if c != 'Total']
    # mapeia coluna → nome legível usando prefixo numérico
    def nome_fonte(col):
        m = re.match(r'^(\d{2})\s*(.*)', col.strip())
        if m:
            prefix = m.group(1)
            descr  = m.group(2).strip()
            return prefix, descr if descr else f'Fonte {prefix}'
        return col[:2], col

    all_ibge = all_ibge_from(*dfs_ano.values())
    print(f"  Municípios: {len(all_ibge)}  |  Fontes encontradas: {len(fontes_cols)}")

    result = {}

    for ibge in all_ibge:
        por_ano = {}

        for ano, df in dfs_ano.items():
            if ibge not in df.index:
                continue
            row   = df.loc[ibge]
            cols  = [c for c in df.columns if c != 'Total']

            fontes = []
            total  = 0.0
            for col in cols:
                v = float(row.get(col, 0) or 0)
                if v == 0:
                    continue
                prefix, descr = nome_fonte(col)
                fontes.append({'codigo': prefix, 'fonte': descr, '_valor': v})
                total += v

            for f in fontes:
                f['valor'] = round(f.pop('_valor'), 2)
                f['pct']   = safe_pct(f['valor'], total)

            fontes.sort(key=lambda x: x['valor'], reverse=True)
            por_ano[ano] = fontes

        # fonte dominante 2025 e variação da maior fonte
        fonte_dom_2025   = None
        var_maior_f_2425 = None

        fontes25 = por_ano.get('2025', [])
        fontes24 = por_ano.get('2024', [])

        if fontes25:
            fonte_dom_2025 = fontes25[0]['fonte']
            val25_dom = fontes25[0]['valor']
            cod25_dom = fontes25[0]['codigo']
            # encontra a mesma fonte em 2024
            match24 = next((f for f in fontes24 if f['codigo'] == cod25_dom), None)
            if match24:
                var_maior_f_2425 = var_pct(val25_dom, match24['valor'])

        result[ibge] = {
            'por_ano':               por_ano,
            'fonte_dominante_2025':  fonte_dom_2025,
            'var_maior_fonte_2425_pct': var_maior_f_2425,
        }

    # ── Validação Araçatuba ──────────────────────────────────────────────────
    if ARACATUBA in result:
        r = result[ARACATUBA]
        print(f"  === Validação {ARACATUBA} ===")
        for ano in ANOS:
            fontes = r['por_ano'].get(ano, [])
            total  = sum(f['valor'] for f in fontes)
            top    = fontes[0] if fontes else {}
            print(f"    {ano}: Total=R${total:>14,.2f}  "
                  f"Top: {top.get('fonte','—')[:30]} ({top.get('pct',0):.1f}%)")
        print(f"    Fonte dominante 2025: {r['fonte_dominante_2025']}")
        print(f"    Variacao maior fonte 2024-2025: {r['var_maior_fonte_2425_pct']}%")
    else:
        print(f"  AVISO: Município {ARACATUBA} não encontrado!")

    path = salvar('siasus_financiamento_anual.json', result)
    print(f"  [OK] {path} — {len(result)} municípios")

# ═══════════════════════════════════════════════════════════════════════════════
# JSON 7 — siasus_tipo_prestador.json  ← ARQUIVO FONTE AUSENTE
# ═══════════════════════════════════════════════════════════════════════════════

def gerar_7_tipo_prestador():
    print("\n[7/8] siasus_tipo_prestador.json")
    tipo_path = os.path.join(SIASUS_DIR, 'siasus_tipo_prestador.csv')
    if not os.path.exists(tipo_path):
        print("  [PULADO] siasus_tipo_prestador.csv ausente.")
        print("  Forneca esse arquivo para gerar a distribuicao publico/filantropico/privado.")
        return
    # implementação pendente de arquivo fonte
    print("  [OK] (stub — arquivo encontrado mas implementação pendente)")

# ═══════════════════════════════════════════════════════════════════════════════
# JSON 8 — siasus_benchmarks_nacional.json
# ═══════════════════════════════════════════════════════════════════════════════

def gerar_8_benchmarks_nacional():
    print("\n[8/8] Gerando siasus_benchmarks_nacional.json…")

    # Carrega séries temporais nacionais
    def load_nacional(nome):
        path = os.path.join(SIASUS_DIR, nome)
        if not os.path.exists(path):
            print(f"  AVISO: {path} não encontrado")
            return None
        df, mun_col = parse_tabnet(path)
        return add_ibge_index(df, mun_col)

    df_aprov  = load_nacional('siasus_qtd_aprovada_nacional.csv')
    df_apres  = load_nacional('siasus_qtd_apresentada_nacional.csv')
    df_vaprov = load_nacional('siasus_valor_aprovado_nacional.csv')

    # Carrega complexidade 2025 para pct_ab, pct_mc, pct_ac
    path_cx25 = os.path.join(SIASUS_DIR, 'siasus_complexidade_2025.csv')
    df_cx25   = None
    if os.path.exists(path_cx25):
        df, mun_col = parse_tabnet(path_cx25)
        df_cx25 = add_ibge_index(df, mun_col)
    else:
        print("  AVISO: siasus_complexidade_2025.csv não encontrado — pct_ac/mc/ab serão None")

    if df_aprov is None:
        print("  ERRO: siasus_qtd_aprovada_nacional.csv obrigatório.")
        return

    cols_aprov  = colunas_temporais_df(df_aprov)
    cols_apres  = colunas_temporais_df(df_apres) if df_apres is not None else []
    cols_vaprov = colunas_temporais_df(df_vaprov) if df_vaprov is not None else []

    # restringe a 2025 para cálculo de benchmarks
    meses25_aprov  = [c for c in cols_aprov  if c.startswith('2025')]
    meses25_apres  = [c for c in cols_apres  if c.startswith('2025')]
    meses25_vaprov = [c for c in cols_vaprov if c.startswith('2025')]

    all_ibge = all_ibge_from(df_aprov, df_apres, df_vaprov, df_cx25)
    print(f"  Municípios: {len(all_ibge)}")

    mets = {
        'qtd_mensal_media': [],
        'ticket_medio':     [],
        'taxa_glosa':       [],
        'pct_ac':           [],
        'pct_mc':           [],
        'pct_ab':           [],
    }

    perfis_municipio = {}  # para quartil

    for ibge in all_ibge:
        # qtd_mensal_media 2025
        qtds = [
            float(df_aprov.loc[ibge, m])
            for m in meses25_aprov
            if ibge in df_aprov.index and m in df_aprov.columns
            and float(df_aprov.loc[ibge, m]) > 0
        ]
        qtd_media = float(np.mean(qtds)) if qtds else None

        # ticket_medio 2025
        tickets = []
        for m in meses25_vaprov:
            if ibge not in df_vaprov.index or m not in df_vaprov.columns:
                continue
            if ibge not in df_aprov.index or m not in df_aprov.columns:
                continue
            v = float(df_vaprov.loc[ibge, m])
            q = float(df_aprov.loc[ibge, m])
            if q > 0 and v > 0:
                tickets.append(v / q)
        ticket = float(np.mean(tickets)) if tickets else None

        # taxa_glosa 2025 (qtd)
        glosas = []
        for m in meses25_apres:
            if df_apres is None:
                break
            if ibge not in df_apres.index or m not in df_apres.columns:
                continue
            if ibge not in df_aprov.index or m not in df_aprov.columns:
                continue
            apres = float(df_apres.loc[ibge, m])
            aprov = float(df_aprov.loc[ibge, m])
            if apres > 0:
                g = max(0, apres - aprov) / apres * 100
                glosas.append(g)
        taxa_glosa = float(np.mean(glosas)) if glosas else None

        # pct_ab, pct_mc, pct_ac (2025 anual)
        pct_ab = pct_mc = pct_ac = None
        if df_cx25 is not None and ibge in df_cx25.index:
            row    = df_cx25.loc[ibge]
            cx_col = [c for c in df_cx25.columns if c != 'Total']
            def gcx(pos):
                if pos < len(cx_col):
                    v = row.get(cx_col[pos], 0)
                    return float(v) if v is not None else 0.0
                return 0.0
            ab = gcx(0); mc = gcx(1); ac = gcx(2); na = gcx(3)
            denom = ab + mc + ac + na
            if denom > 0:
                pct_ab = safe_pct(ab, denom)
                pct_mc = safe_pct(mc, denom)
                pct_ac = safe_pct(ac, denom)

        # acumula para stats
        if qtd_media   is not None: mets['qtd_mensal_media'].append(qtd_media)
        if ticket      is not None: mets['ticket_medio'].append(ticket)
        if taxa_glosa  is not None: mets['taxa_glosa'].append(taxa_glosa)
        if pct_ac      is not None: mets['pct_ac'].append(pct_ac)
        if pct_mc      is not None: mets['pct_mc'].append(pct_mc)
        if pct_ab      is not None: mets['pct_ab'].append(pct_ab)

        perfis_municipio[ibge] = {
            'qtd_mensal_media': qtd_media,
            'ticket_medio':     round(ticket, 4) if ticket else None,
            'taxa_glosa':       round(taxa_glosa, 4) if taxa_glosa else None,
            'pct_ac':           pct_ac,
            'pct_mc':           pct_mc,
            'pct_ab':           pct_ab,
        }

    # estatísticas nacionais
    metricas = {k: stats(v) for k, v in mets.items()}

    # quartil por município
    def quartil_val(valor, lista):
        arr = sorted([v for v in lista if v is not None and not np.isnan(v)])
        if not arr or valor is None:
            return None
        p25 = np.percentile(arr, 25)
        p50 = np.percentile(arr, 50)
        p75 = np.percentile(arr, 75)
        if valor <= p25: return 1
        if valor <= p50: return 2
        if valor <= p75: return 3
        return 4

    por_municipio = {}
    for ibge, p in perfis_municipio.items():
        por_municipio[ibge] = {
            'qtd_mensal_media': p['qtd_mensal_media'],
            'ticket_medio':     p['ticket_medio'],
            'taxa_glosa':       p['taxa_glosa'],
            'pct_ac':           p['pct_ac'],
            'quartil_qtd':      quartil_val(p['qtd_mensal_media'], mets['qtd_mensal_media']),
            'quartil_ticket':   quartil_val(p['ticket_medio'],     mets['ticket_medio']),
            'quartil_glosa':    quartil_val(p['taxa_glosa'],       mets['taxa_glosa']),
            'quartil_ac':       quartil_val(p['pct_ac'],           mets['pct_ac']),
        }

    benchmarks = {
        'metricas':        metricas,
        'por_municipio':   por_municipio,
        'total_municipios': len(all_ibge),
    }

    # ── Validação Araçatuba ──────────────────────────────────────────────────
    if ARACATUBA in por_municipio:
        p = por_municipio[ARACATUBA]
        print(f"  === Validação {ARACATUBA} ===")
        print(f"    qtd_mensal_media: {p['qtd_mensal_media']}")
        print(f"    ticket_medio:     {p['ticket_medio']}")
        print(f"    taxa_glosa:       {p['taxa_glosa']}")
        print(f"    pct_ac:           {p['pct_ac']}%")
        print(f"    quartil_qtd:      {p['quartil_qtd']}  quartil_ac: {p['quartil_ac']}")
        print(f"  Benchmarks nacionais qtd_mensal_media: {metricas['qtd_mensal_media']}")
        print(f"  Benchmarks nacionais taxa_glosa:       {metricas['taxa_glosa']}")
    else:
        print(f"  AVISO: Município {ARACATUBA} não encontrado!")

    path = salvar('siasus_benchmarks_nacional.json', benchmarks)
    print(f"  [OK] {path} — {len(all_ibge)} municípios")

# ═══════════════════════════════════════════════════════════════════════════════
# dispatcher
# ═══════════════════════════════════════════════════════════════════════════════

GERADORES = {
    1: gerar_1_complexidade_anual,
    2: gerar_2_complexidade_mensal,
    3: gerar_3_carater_anual,
    4: gerar_4_forma_org_anual,
    5: gerar_5_glosa_anual,
    6: gerar_6_financiamento_anual,
    7: gerar_7_tipo_prestador,
    8: gerar_8_benchmarks_nacional,
}

if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)

    args = sys.argv[1:]
    if args:
        indices = [int(a) for a in args if a.isdigit() and 1 <= int(a) <= 8]
    else:
        indices = list(GERADORES.keys())

    print(f"=== processar_siasus.py — JSONs a gerar: {indices} ===")
    for i in indices:
        GERADORES[i]()

    print("\n=== CONCLUÍDO ===")
