#!/usr/bin/env python3
"""
scripts/processar_sih.py
Processa os 12 CSVs de Morbidade Hospitalar (SIH/SUS) e gera 8 JSONs analíticos.
Destino: dados_hospitalar/processados/
"""

import re
import json
import os
import unicodedata
from collections import defaultdict

import pandas as pd
import numpy as np

# ── constantes ────────────────────────────────────────────────────────────────

BASE_DIR      = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dados_hospitalar')
OUT_DIR       = os.path.join(BASE_DIR, 'processados')
MUNICIPIO_REF = '350280'   # Araçatuba — município de referência para validação

MES_ORD = {'Jan':1,'Fev':2,'Mar':3,'Abr':4,'Mai':5,'Jun':6,
            'Jul':7,'Ago':8,'Set':9,'Out':10,'Nov':11,'Dez':12}

CAPS = [
    'Cap 01','Cap 02','Cap 03','Cap 04','Cap 05','Cap 06','Cap 07',
    'Cap 08','Cap 09','Cap 10','Cap 11','Cap 12','Cap 13','Cap 14',
    'Cap 15','Cap 16','Cap 17','Cap 18','Cap 19','Cap 21',
]

CAP_NOMES = {
    'Cap 01': 'Doenças Infecciosas e Parasitárias',
    'Cap 02': 'Neoplasias (Câncer)',
    'Cap 03': 'Doenças do Sangue e Imunidade',
    'Cap 04': 'Doenças Endócrinas e Nutricionais',
    'Cap 05': 'Transtornos Mentais',
    'Cap 06': 'Doenças do Sistema Nervoso',
    'Cap 07': 'Doenças do Olho e Anexos',
    'Cap 08': 'Doenças do Ouvido',
    'Cap 09': 'Doenças do Aparelho Circulatório',
    'Cap 10': 'Doenças do Aparelho Respiratório',
    'Cap 11': 'Doenças do Aparelho Digestivo',
    'Cap 12': 'Doenças da Pele',
    'Cap 13': 'Doenças Músculo-esqueléticas',
    'Cap 14': 'Doenças do Aparelho Genitourinário',
    'Cap 15': 'Gravidez, Parto e Puerpério',
    'Cap 16': 'Afecções Perinatais',
    'Cap 17': 'Malformações Congênitas',
    'Cap 18': 'Sintomas e Sinais Inespecíficos',
    'Cap 19': 'Lesões e Causas Externas',
    'Cap 21': 'Contatos com Serviços de Saúde',
}

FAIXAS = [
    'Menor 1 ano','1 a 4 anos','5 a 9 anos','10 a 14 anos','15 a 19 anos',
    '20 a 29 anos','30 a 39 anos','40 a 49 anos','50 a 59 anos',
    '60 a 69 anos','70 a 79 anos','80 anos e mais',
]

# ── helpers ───────────────────────────────────────────────────────────────────

def safe_div(a, b, default=0.0):
    return a / b if b else default

def percentil(arr, p):
    if not arr:
        return 0.0
    arr_s = sorted(arr)
    idx = (len(arr_s) - 1) * p / 100
    lo = int(idx)
    hi = lo + 1
    if hi >= len(arr_s):
        return float(arr_s[-1])
    return arr_s[lo] + (idx - lo) * (arr_s[hi] - arr_s[lo])

def norm_name(s: str) -> str:
    """Normaliza nome de município: remove acentos, uppercase."""
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return s.upper().strip()

def get_ibge(name_str: str):
    m = re.match(r'^(\d{6})', str(name_str).strip())
    return m.group(1) if m else None

def get_nome(name_str: str) -> str:
    return re.sub(r'^\d{6}\s*', '', str(name_str).strip())

def bench_stats(values: list) -> dict:
    values = [v for v in values if v is not None]
    if not values:
        return {}
    values = sorted(values)
    mean = sum(values) / len(values)
    return {
        'media':   round(mean, 2),
        'mediana': round(percentil(values, 50), 2),
        'p25':     round(percentil(values, 25), 2),
        'p75':     round(percentil(values, 75), 2),
        'p90':     round(percentil(values, 90), 2),
    }

# ── parser universal ──────────────────────────────────────────────────────────

def parse_tabnet(filepath: str) -> pd.DataFrame:
    """Parser universal: encoding windows-1252, traço=zero, ponto=milhar, vírgula=decimal."""
    rows = []
    with open(filepath, 'r', encoding='windows-1252') as f:
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

    return df

# ── parser especial: fluxo de internação (estrutura CIR hierárquica) ─────────

def parse_fluxo_internacao(filepath: str):
    """
    Retorna:
      cirs_list  — lista de CIRs com internacoes_por_ano (2022-2025)
      mun_to_cir — {nome_normalizado: (codigo_cir, nome_cir)}
    """
    cirs_list  = []
    mun_to_cir = {}

    with open(filepath, 'r', encoding='windows-1252') as f:
        lines = f.readlines()

    # Header: Região de Saúde/Município ; 2021 ; 2022 ; 2023 ; 2024 ; 2025 ; 2026 ; Total
    header_raw = re.sub(r'"+', '', lines[0].strip().strip('"'))
    col_names  = [p.strip() for p in header_raw.split(';')]
    anos_cols  = col_names[1:]  # ['2021','2022','2023','2024','2025','2026','Total']

    def parse_val(s):
        s = str(s).strip().replace('.', '').replace(',', '.').replace('-', '0')
        try:
            return float(s)
        except Exception:
            return 0.0

    current_cir_code = None
    current_cir_name = None

    for line in lines[1:]:
        raw   = re.sub(r'"+', '', line.strip().strip('"'))
        parts = [p.strip() for p in raw.split(';')]
        if not parts or not parts[0]:
            continue

        name_field = parts[0]
        vals       = parts[1:]

        # CIR: começa com código 5 dígitos
        m = re.match(r'^(\d{5})\s+(.+)$', name_field)
        if m:
            current_cir_code = m.group(1)
            current_cir_name = m.group(2).strip()
            entry = {
                'codigo_cir': current_cir_code,
                'nome_cir':   current_cir_name,
                'internacoes_por_ano': {},
            }
            for i, ano in enumerate(anos_cols):
                if ano in ('2022', '2023', '2024', '2025') and i < len(vals):
                    entry['internacoes_por_ano'][ano] = int(parse_val(vals[i]))
            cirs_list.append(entry)

        # Município sub-linha: começa com pontos
        elif name_field.startswith('.') and current_cir_code:
            mun_name = re.sub(r'^\.+\s*', '', name_field).strip()
            mun_to_cir[norm_name(mun_name)] = (current_cir_code, current_cir_name)

    return cirs_list, mun_to_cir

# ── classificação de perfil ───────────────────────────────────────────────────

def classificar_perfil(int_por_cid: dict, total: int, pct_externos: float) -> list:
    if not total:
        return []
    tags = []
    if int_por_cid.get('Cap 19', 0) / total * 100 > 20:
        tags.append('POLO DE TRAUMA')
    if int_por_cid.get('Cap 02', 0) / total * 100 > 15:
        tags.append('POLO ONCOLÓGICO')
    if int_por_cid.get('Cap 09', 0) / total * 100 > 15:
        tags.append('POLO CARDIOVASCULAR')
    if pct_externos > 25:
        tags.append('POLO REGIONAL')
    return tags

# ─────────────────────────────────────────────────────────────────────────────
# LEITURA DOS CSVs
# ─────────────────────────────────────────────────────────────────────────────

os.makedirs(OUT_DIR, exist_ok=True)
print('Lendo CSVs...')

df_a1 = parse_tabnet(os.path.join(BASE_DIR, 'sih_internacoes_mensal.csv'))
df_a2 = parse_tabnet(os.path.join(BASE_DIR, 'sih_internacoes_cid.csv'))
df_a3 = parse_tabnet(os.path.join(BASE_DIR, 'sih_obitos_cid.csv'))
df_a4 = parse_tabnet(os.path.join(BASE_DIR, 'sih_dias_permanencia_cid.csv'))
df_a5 = parse_tabnet(os.path.join(BASE_DIR, 'sih_valor_cid.csv'))
df_a6 = parse_tabnet(os.path.join(BASE_DIR, 'sih_faixa_etaria.csv'))
df_a7 = parse_tabnet(os.path.join(BASE_DIR, 'sih_carater.csv'))
df_b1 = parse_tabnet(os.path.join(BASE_DIR, 'sih_residencia_internacoes_cid.csv'))
df_b2 = parse_tabnet(os.path.join(BASE_DIR, 'sih_residencia_obitos_cid.csv'))
df_b3 = parse_tabnet(os.path.join(BASE_DIR, 'sih_residencia_faixa_etaria.csv'))
df_b4 = parse_tabnet(os.path.join(BASE_DIR, 'sih_fluxo_residencia.csv'))

cirs_list, mun_to_cir = parse_fluxo_internacao(
    os.path.join(BASE_DIR, 'sih_fluxo_internacao.csv')
)

print(f'  A1 mensal:        {len(df_a1)} municípios')
print(f'  A2 internacoes:   {len(df_a2)} municípios')
print(f'  A3 obitos:        {len(df_a3)} municípios')
print(f'  A4 dias:          {len(df_a4)} municípios')
print(f'  A5 valor:         {len(df_a5)} municípios')
print(f'  A6 faixa_etaria:  {len(df_a6)} municípios')
print(f'  A7 carater:       {len(df_a7)} municípios')
print(f'  B1 res_intern:    {len(df_b1)} municípios')
print(f'  B2 res_obitos:    {len(df_b2)} municípios')
print(f'  B3 res_faixa:     {len(df_b3)} municípios')
print(f'  B4 fluxo_res:     {len(df_b4)} municípios')
print(f'  A8 CIRs:          {len(cirs_list)}')

# ── índices auxiliares ────────────────────────────────────────────────────────

# ibge → nome
ibge_nome: dict[str, str] = {}
for _, row in df_a2.iterrows():
    ibge = get_ibge(row.iloc[0])
    if ibge:
        ibge_nome[ibge] = get_nome(row.iloc[0])

# nome normalizado → ibge (para mapear CIR)
nome_norm_to_ibge = {norm_name(v): k for k, v in ibge_nome.items()}

# ibge → (codigo_cir, nome_cir)
ibge_to_cir: dict[str, tuple] = {}
for mun_norm, cir_info in mun_to_cir.items():
    ibge = nome_norm_to_ibge.get(mun_norm)
    if ibge:
        ibge_to_cir[ibge] = cir_info

# CID columns presentes no A2 (sem "Total")
available_caps = [c for c in CAPS if c in df_a2.columns]

def df_to_ibge_cap_dict(df) -> dict:
    """Converte DataFrame em {ibge: {cap: valor}}."""
    result = {}
    for _, row in df.iterrows():
        ibge = get_ibge(row.iloc[0])
        if ibge:
            result[ibge] = {cap: float(row[cap]) if cap in row.index else 0.0
                            for cap in available_caps}
    return result

a2_dict = df_to_ibge_cap_dict(df_a2)
a3_dict = df_to_ibge_cap_dict(df_a3)
a4_dict = df_to_ibge_cap_dict(df_a4)
a5_dict = df_to_ibge_cap_dict(df_a5)
b1_dict = df_to_ibge_cap_dict(df_b1)
b2_dict = df_to_ibge_cap_dict(df_b2)

# ─────────────────────────────────────────────────────────────────────────────
# JSON 1 — sih_perfil_municipio.json
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 1/8 sih_perfil_municipio.json ===')

perfil_mun: dict = {}

for ibge in a2_dict:
    int_c  = a2_dict[ibge]
    obi_c  = a3_dict.get(ibge, {})
    dias_c = a4_dict.get(ibge, {})
    val_c  = a5_dict.get(ibge, {})
    res_c  = b1_dict.get(ibge, {})

    total_int  = sum(int_c.values())
    total_obi  = sum(obi_c.values())
    total_val  = sum(val_c.values())
    total_dias = sum(dias_c.values())
    total_res  = sum(res_c.values())

    tx_mort    = safe_div(total_obi,  total_int)  * 100
    custo_med  = safe_div(total_val,  total_int)
    perm_med   = safe_div(total_dias, total_int)
    pac_ext    = total_int - total_res
    pct_ext    = safe_div(pac_ext, total_int) * 100

    tags = classificar_perfil(int_c, total_int, pct_ext)

    cid_principal = max(int_c, key=lambda k: int_c[k]) if int_c else ''

    # CID com maior mortalidade (≥ 50 internações)
    tx_per_cap = {
        cap: safe_div(obi_c.get(cap, 0), int_c.get(cap, 0)) * 100
        for cap in available_caps
        if int_c.get(cap, 0) >= 50
    }
    cid_maior_mort = max(tx_per_cap, key=lambda k: tx_per_cap[k]) if tx_per_cap else ''

    cir_info = ibge_to_cir.get(ibge, (None, None))

    perfil_mun[ibge] = {
        'ibge':                     ibge,
        'nome':                     ibge_nome.get(ibge, ''),
        'total_internacoes':        round(total_int),
        'total_obitos':             round(total_obi),
        'total_valor':              round(total_val, 2),
        'total_dias':               round(total_dias),
        'tx_mortalidade_geral':     round(tx_mort, 2),
        'custo_medio_geral':        round(custo_med, 2),
        'permanencia_media_geral':  round(perm_med, 2),
        'pct_externos':             round(pct_ext, 2),
        'eh_polo_receptor':         pct_ext > 15,
        'perfil_tags':              tags,
        'cid_principal':            cid_principal,
        'cid_maior_mortalidade':    cid_maior_mort,
        'codigo_cir':               cir_info[0],
        'nome_cir':                 cir_info[1],
        'ranking_internacoes_sp':   0,   # preenchido abaixo
        'quartil_mortalidade':      0,   # preenchido abaixo
    }

# Rankings
for rank, ibge in enumerate(
    sorted(perfil_mun, key=lambda k: perfil_mun[k]['total_internacoes'], reverse=True), 1
):
    perfil_mun[ibge]['ranking_internacoes_sp'] = rank

# Quartis de mortalidade (municípios com ≥ 500 internações)
tx_vals = [perfil_mun[ibge]['tx_mortalidade_geral']
           for ibge in perfil_mun
           if perfil_mun[ibge]['total_internacoes'] >= 500]
q25 = percentil(tx_vals, 25)
q50 = percentil(tx_vals, 50)
q75 = percentil(tx_vals, 75)
for ibge in perfil_mun:
    if perfil_mun[ibge]['total_internacoes'] >= 500:
        tx = perfil_mun[ibge]['tx_mortalidade_geral']
        if   tx <= q25: perfil_mun[ibge]['quartil_mortalidade'] = 1
        elif tx <= q50: perfil_mun[ibge]['quartil_mortalidade'] = 2
        elif tx <= q75: perfil_mun[ibge]['quartil_mortalidade'] = 3
        else:           perfil_mun[ibge]['quartil_mortalidade'] = 4

with open(os.path.join(OUT_DIR, 'sih_perfil_municipio.json'), 'w', encoding='utf-8') as f:
    json.dump(perfil_mun, f, ensure_ascii=False, separators=(',', ':'))

ref = perfil_mun.get(MUNICIPIO_REF, {})
print(f'  Municípios: {len(perfil_mun)}')
print(f'  [{MUNICIPIO_REF} {ref.get("nome","")}]')
print(f'    total_internacoes:       {ref.get("total_internacoes"):,}')
print(f'    tx_mortalidade_geral:    {ref.get("tx_mortalidade_geral")}%')
print(f'    custo_medio_geral:       R$ {ref.get("custo_medio_geral"):,.2f}')
print(f'    permanencia_media_geral: {ref.get("permanencia_media_geral")} dias')
print(f'    pct_externos:            {ref.get("pct_externos")}%')
print(f'    perfil_tags:             {ref.get("perfil_tags")}')
print(f'    ranking_internacoes_sp:  #{ref.get("ranking_internacoes_sp")}')
print(f'    codigo_cir / nome_cir:   {ref.get("codigo_cir")} / {ref.get("nome_cir")}')

# ─────────────────────────────────────────────────────────────────────────────
# JSON 2 — sih_por_cid.json
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 2/8 sih_por_cid.json ===')

por_cid: dict = {}

for ibge in a2_dict:
    int_c  = a2_dict[ibge]
    obi_c  = a3_dict.get(ibge, {})
    dias_c = a4_dict.get(ibge, {})
    val_c  = a5_dict.get(ibge, {})
    res_c  = b1_dict.get(ibge, {})
    res_ob = b2_dict.get(ibge, {})

    total_int = sum(int_c.values())

    lista = []
    for cap in available_caps:
        n_int     = int_c.get(cap, 0)
        n_obi     = obi_c.get(cap, 0)
        n_dias    = dias_c.get(cap, 0)
        n_val     = val_c.get(cap, 0)
        n_res     = res_c.get(cap, 0)
        n_res_obi = res_ob.get(cap, 0)

        tx_local  = safe_div(n_obi,     n_int) * 100
        tx_res    = safe_div(n_res_obi, n_res) * 100
        perm_med  = safe_div(n_dias,    n_int)
        custo_med = safe_div(n_val,     n_int)
        pac_ext   = n_int - n_res
        pct_ext   = safe_div(pac_ext, n_int) * 100 if n_int > 0 else 0.0
        pct_total = safe_div(n_int, total_int) * 100

        lista.append({
            'cid':                       cap,
            'nome':                      CAP_NOMES.get(cap, cap),
            'internacoes_local':         round(n_int),
            'pct_total':                 round(pct_total, 1),
            'obitos_local':              round(n_obi),
            'tx_mortalidade_local':      round(tx_local, 2),
            'dias_total':                round(n_dias),
            'permanencia_media':         round(perm_med, 1),
            'flag_longa_permanencia':    cap == 'Cap 05',
            'valor_total':               round(n_val, 2),
            'custo_medio':               round(custo_med, 2),
            'internacoes_residentes':    round(n_res),
            'obitos_residentes':         round(n_res_obi),
            'tx_mortalidade_residentes': round(tx_res, 2),
            'pacientes_externos':        round(pac_ext),
            'pct_externos':              round(pct_ext, 2),
        })

    por_cid[ibge] = sorted(lista, key=lambda x: x['internacoes_local'], reverse=True)

with open(os.path.join(OUT_DIR, 'sih_por_cid.json'), 'w', encoding='utf-8') as f:
    json.dump(por_cid, f, ensure_ascii=False, separators=(',', ':'))

ref_cid = por_cid.get(MUNICIPIO_REF, [])
print(f'  Municípios: {len(por_cid)}')
if ref_cid:
    print('  Top 3 CIDs:')
    for c in ref_cid[:3]:
        print(f'    {c["cid"]} {c["nome"][:35]:35s} | '
              f'{c["internacoes_local"]:>7,} int | '
              f'{c["tx_mortalidade_local"]}% mort | '
              f'{c["permanencia_media"]}d perm | '
              f'R$ {c["custo_medio"]:>10,.0f}')
    cap05 = next((c for c in ref_cid if c['cid'] == 'Cap 05'), None)
    if cap05:
        print(f'  Cap 05 (Mental) permanência: {cap05["permanencia_media"]} dias')

# ─────────────────────────────────────────────────────────────────────────────
# JSON 3 — sih_serie_mensal.json
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 3/8 sih_serie_mensal.json ===')

# Identificar colunas de mês válidas (2022-2025, excluir 2021 e 2026)
mes_cols = []
for col in df_a1.columns[1:]:
    m = re.match(r'^(\d{4})/(\w{3})$', col.strip())
    if m and m.group(1) in ('2022', '2023', '2024', '2025') and m.group(2) in MES_ORD:
        mes_cols.append((col, m.group(1), m.group(2)))

serie_mensal: dict = {}

for _, row in df_a1.iterrows():
    ibge = get_ibge(row.iloc[0])
    if not ibge:
        continue

    por_mes = []
    acu: dict[str, float] = defaultdict(float)

    for (col, ano, mes) in mes_cols:
        val = float(row[col]) if col in row.index else 0.0
        por_mes.append({'mes': f'{ano}/{mes}', 'internacoes': round(val)})
        acu[ano] += val

    def var_pct(a, b):
        return round((b - a) / a * 100, 2) if a else None

    acu22, acu23, acu24, acu25 = (
        acu.get('2022', 0), acu.get('2023', 0),
        acu.get('2024', 0), acu.get('2025', 0),
    )

    non_zero = [pm for pm in por_mes if pm['internacoes'] > 0]
    pico = max(non_zero, key=lambda x: x['internacoes'])['mes'] if non_zero else ''
    vale = min(non_zero, key=lambda x: x['internacoes'])['mes'] if non_zero else ''

    meses_2025  = [pm['internacoes'] for pm in por_mes if pm['mes'].startswith('2025')]
    media_2025  = round(sum(meses_2025) / len(meses_2025)) if meses_2025 else 0

    serie_mensal[ibge] = {
        'por_mes':          por_mes,
        'acumulado_2022':   round(acu22),
        'acumulado_2023':   round(acu23),
        'acumulado_2024':   round(acu24),
        'acumulado_2025':   round(acu25),
        'var_2223_pct':     var_pct(acu22, acu23),
        'var_2324_pct':     var_pct(acu23, acu24),
        'var_2425_pct':     var_pct(acu24, acu25),
        'media_mensal_2025': media_2025,
        'pico_mes':         pico,
        'vale_mes':         vale,
    }

with open(os.path.join(OUT_DIR, 'sih_serie_mensal.json'), 'w', encoding='utf-8') as f:
    json.dump(serie_mensal, f, ensure_ascii=False, separators=(',', ':'))

ref_s = serie_mensal.get(MUNICIPIO_REF, {})
print(f'  Municípios: {len(serie_mensal)}  |  Meses (2022-2025): {len(mes_cols)}')
print(f'  [{MUNICIPIO_REF}]')
print(f'    acumulado_2022: {ref_s.get("acumulado_2022"):,}')
print(f'    acumulado_2023: {ref_s.get("acumulado_2023"):,}')
print(f'    acumulado_2024: {ref_s.get("acumulado_2024"):,}')
print(f'    acumulado_2025: {ref_s.get("acumulado_2025"):,}')
print(f'    var_2425_pct:   {ref_s.get("var_2425_pct")}%')
print(f'    pico_mes:       {ref_s.get("pico_mes")}')
print(f'    media_2025:     {ref_s.get("media_mensal_2025"):,}/mês')

# ─────────────────────────────────────────────────────────────────────────────
# JSON 4 — sih_faixa_etaria.json
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 4/8 sih_faixa_etaria.json ===')

faixas_a6 = [f for f in FAIXAS if f in df_a6.columns]
faixas_b3 = [f for f in FAIXAS if f in df_b3.columns]

def df_to_faixa(df, faixas) -> dict:
    result = {}
    for _, row in df.iterrows():
        ibge = get_ibge(row.iloc[0])
        if not ibge:
            continue
        total = sum(float(row[f]) for f in faixas if f in row.index)
        lista = [
            {'faixa': f,
             'qtd':   round(float(row[f]) if f in row.index else 0),
             'pct':   round(safe_div(float(row[f]) if f in row.index else 0, total) * 100, 1)}
            for f in faixas
        ]
        result[ibge] = lista
    return result

a6_faixa = df_to_faixa(df_a6, faixas_a6)
b3_faixa = df_to_faixa(df_b3, faixas_b3)

faixa_etaria: dict = {
    ibge: {
        'local_internacao': a6_faixa.get(ibge, []),
        'residencia':       b3_faixa.get(ibge, []),
    }
    for ibge in set(a6_faixa) | set(b3_faixa)
}

with open(os.path.join(OUT_DIR, 'sih_faixa_etaria.json'), 'w', encoding='utf-8') as f:
    json.dump(faixa_etaria, f, ensure_ascii=False, separators=(',', ':'))

ref_fe = faixa_etaria.get(MUNICIPIO_REF, {})
print(f'  Municípios: {len(faixa_etaria)}')
if ref_fe.get('local_internacao'):
    top_f = max(ref_fe['local_internacao'], key=lambda x: x['qtd'])
    idosos = sum(f['qtd'] for f in ref_fe['local_internacao']
                 if f['faixa'] in ('60 a 69 anos', '70 a 79 anos', '80 anos e mais'))
    total_f = sum(f['qtd'] for f in ref_fe['local_internacao'])
    pct_id = safe_div(idosos, total_f) * 100
    print(f'  Faixa etária local: maior={top_f["faixa"]} ({top_f["pct"]}%)')
    print(f'  Idosos (>=60 anos): {idosos:,} ({pct_id:.1f}%)')

# ─────────────────────────────────────────────────────────────────────────────
# JSON 5 — sih_carater.json
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 5/8 sih_carater.json ===')

# Detecta colunas reais (encoding pode variar no nome "Urgência")
cols_a7 = df_a7.columns.tolist()
eletivo_col  = next((c for c in cols_a7 if 'Eletivo' in c), None)
urgencia_col = next((c for c in cols_a7 if 'rg' in c and 'ncia' in c.lower().replace('ê','e').replace('é','e')), None)
acid_cols    = [c for c in cols_a7 if any(x in c for x in ('Acid', 'caus', 'ac trab'))]

carater: dict = {}
for _, row in df_a7.iterrows():
    ibge = get_ibge(row.iloc[0])
    if not ibge:
        continue
    eletivo  = float(row[eletivo_col])  if eletivo_col  else 0.0
    urgencia = float(row[urgencia_col]) if urgencia_col else 0.0
    acidente = sum(float(row[c]) for c in acid_cols if c in row.index)
    total    = eletivo + urgencia + acidente

    carater[ibge] = {
        'eletivo':  {'qtd': round(eletivo),  'pct': round(safe_div(eletivo,  total) * 100, 1)},
        'urgencia': {'qtd': round(urgencia), 'pct': round(safe_div(urgencia, total) * 100, 1)},
        'acidente': {'qtd': round(acidente), 'pct': round(safe_div(acidente, total) * 100, 1)},
        'total':    round(total),
    }

with open(os.path.join(OUT_DIR, 'sih_carater.json'), 'w', encoding='utf-8') as f:
    json.dump(carater, f, ensure_ascii=False, separators=(',', ':'))

ref_ca = carater.get(MUNICIPIO_REF, {})
print(f'  Municípios: {len(carater)}')
print(f'  [{MUNICIPIO_REF}] eletivo={ref_ca.get("eletivo")} '
      f'urgencia={ref_ca.get("urgencia")} acidente={ref_ca.get("acidente")}')

# ─────────────────────────────────────────────────────────────────────────────
# JSON 6 — sih_fluxo.json
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 6/8 sih_fluxo.json ===')

fluxo: dict = {}

for ibge in a2_dict:
    int_c = a2_dict[ibge]
    res_c = b1_dict.get(ibge, {})

    total_local = sum(int_c.values())
    total_res   = sum(res_c.values())
    pac_ext     = total_local - total_res
    pct_ext     = safe_div(pac_ext, total_local) * 100

    por_cid_fl = []
    for cap in available_caps:
        n_loc = int_c.get(cap, 0)
        n_res = res_c.get(cap, 0)
        n_ext = n_loc - n_res
        p_ext = safe_div(n_ext, n_loc) * 100 if n_loc > 0 else 0.0
        por_cid_fl.append({
            'cid':                   cap,
            'nome':                  CAP_NOMES.get(cap, cap),
            'internacoes_local':     round(n_loc),
            'internacoes_residentes': round(n_res),
            'pacientes_externos':    round(n_ext),
            'pct_externos':          round(p_ext, 2),
        })

    por_cid_fl.sort(key=lambda x: x['pacientes_externos'], reverse=True)

    fluxo[ibge] = {
        'total_internacoes_local':       round(total_local),
        'total_internacoes_residentes':  round(total_res),
        'pacientes_externos_abs':        round(pac_ext),
        'pct_externos':                  round(pct_ext, 2),
        'eh_polo_receptor':              pct_ext > 15,
        'por_cid':                       por_cid_fl,
    }

with open(os.path.join(OUT_DIR, 'sih_fluxo.json'), 'w', encoding='utf-8') as f:
    json.dump(fluxo, f, ensure_ascii=False, separators=(',', ':'))

ref_fl = fluxo.get(MUNICIPIO_REF, {})
print(f'  Municípios: {len(fluxo)}')
print(f'  [{MUNICIPIO_REF}]')
print(f'    total_local:            {ref_fl.get("total_internacoes_local"):,}')
print(f'    total_residentes:       {ref_fl.get("total_internacoes_residentes"):,}')
print(f'    pacientes_externos_abs: {ref_fl.get("pacientes_externos_abs"):,}')
print(f'    pct_externos:           {ref_fl.get("pct_externos")}%')
print(f'    eh_polo_receptor:       {ref_fl.get("eh_polo_receptor")}')
polos = sum(1 for p in fluxo.values() if p['eh_polo_receptor'])
print(f'  Polos receptores (>15%): {polos}')

# ─────────────────────────────────────────────────────────────────────────────
# JSON 7 — sih_cir_evolucao.json
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 7/8 sih_cir_evolucao.json ===')

with open(os.path.join(OUT_DIR, 'sih_cir_evolucao.json'), 'w', encoding='utf-8') as f:
    json.dump(cirs_list, f, ensure_ascii=False, separators=(',', ':'))

print(f'  CIRs: {len(cirs_list)}')
ref_cir_code = perfil_mun.get(MUNICIPIO_REF, {}).get('codigo_cir')
if ref_cir_code:
    cir_entry = next((c for c in cirs_list if c['codigo_cir'] == ref_cir_code), None)
    if cir_entry:
        print(f'  CIR de {MUNICIPIO_REF}: {cir_entry["codigo_cir"]} {cir_entry["nome_cir"]}')
        print(f'    internacoes_por_ano: {cir_entry["internacoes_por_ano"]}')
else:
    print('  ⚠️  CIR não mapeada para município de referência (nome sem correspondência exata)')

# ─────────────────────────────────────────────────────────────────────────────
# JSON 8 — sih_benchmarks.json
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== 8/8 sih_benchmarks.json ===')

analise = [p for p in perfil_mun.values() if p['total_internacoes'] >= 500]

benchmarks = {
    'tx_mortalidade':    bench_stats([p['tx_mortalidade_geral']    for p in analise if p['tx_mortalidade_geral']    > 0]),
    'custo_medio':       bench_stats([p['custo_medio_geral']       for p in analise if p['custo_medio_geral']       > 0]),
    'permanencia_media': bench_stats([p['permanencia_media_geral'] for p in analise if p['permanencia_media_geral'] > 0]),
    'pct_externos':      bench_stats([p['pct_externos']            for p in analise if p['eh_polo_receptor']]),
    'total_municipios_analisados': len(analise),
}

with open(os.path.join(OUT_DIR, 'sih_benchmarks.json'), 'w', encoding='utf-8') as f:
    json.dump(benchmarks, f, ensure_ascii=False, separators=(',', ':'))

print(f'  Municipios analisados (>=500 intern.): {len(analise)}')
print(f'  tx_mortalidade:    {benchmarks["tx_mortalidade"]}')
print(f'  custo_medio:       {benchmarks["custo_medio"]}')
print(f'  permanencia_media: {benchmarks["permanencia_media"]}')

# ─────────────────────────────────────────────────────────────────────────────
# VALIDAÇÕES FINAIS
# ─────────────────────────────────────────────────────────────────────────────
print('\n=== VALIDAÇÕES ===')

# 1. Soma de internações em perfil deve bater com A2
total_a2 = df_a2[[c for c in available_caps if c in df_a2.columns]].values.sum()
total_perf = sum(p['total_internacoes'] for p in perfil_mun.values())
diff_pct = abs(total_perf - total_a2) / total_a2 * 100 if total_a2 else 0
status1 = 'OK' if diff_pct < 0.1 else 'ALERTA'
print(f'  A2 total internacoes: {total_a2:,.0f}')
print(f'  Perfil total:         {total_perf:,}')
print(f'  Diferenca:            {diff_pct:.4f}% [{status1}]')

# 2. tx_mortalidade nunca fora de [0, 100]
invalid_tx = [ibge for ibge, p in perfil_mun.items()
              if not (0.0 <= p['tx_mortalidade_geral'] <= 100.0)]
status2 = 'OK' if not invalid_tx else 'ALERTA: ' + str(invalid_tx[:3])
print(f'  tx_mortalidade fora de [0,100]: {len(invalid_tx)} [{status2}]')

# 3. Cap 05 permanência muito superior aos demais
cap05_perm = [c['permanencia_media'] for lst in por_cid.values()
              for c in lst if c['cid'] == 'Cap 05' and c['permanencia_media'] > 0]
outros_perm = [c['permanencia_media'] for lst in por_cid.values()
               for c in lst if c['cid'] != 'Cap 05' and c['permanencia_media'] > 0]
if cap05_perm and outros_perm:
    med05  = sum(cap05_perm)  / len(cap05_perm)
    med_ot = sum(outros_perm) / len(outros_perm)
    flag5  = 'OK (longa permanencia psiquiatrica)' if med05 > med_ot * 3 else 'verificar'
    print(f'  Permanencia media Cap 05: {med05:.1f}d vs outros: {med_ot:.1f}d [{flag5}]')

print(f'\nTodos os 8 JSONs gerados em:\n  {OUT_DIR}')
