#!/usr/bin/env python3
"""
scripts/processar_ambulatorial.py
Processa os 9 CSVs de produção ambulatorial (SIASUS) e gera 6 JSONs analíticos.
Destino: dados_ambulatorial/processados/
"""

import re
import json
import os
from collections import defaultdict

import pandas as pd
import numpy as np

# ── constantes ────────────────────────────────────────────────────────────────

BASE_DIR  = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dados_ambulatorial')
OUT_DIR   = os.path.join(BASE_DIR, 'processados')
ARACATUBA = '350280'

MES_ORD = {'Jan':1,'Fev':2,'Mar':3,'Abr':4,'Mai':5,'Jun':6,
            'Jul':7,'Ago':8,'Set':9,'Out':10,'Nov':11,'Dez':12}

GRUPOS_FORM_ORG = {
    '01': 'Promoção e Prevenção',
    '02': 'Diagnose',
    '03': 'Terapia',
    '04': 'Tratamento Clínico',
    '05': 'Cirurgia',
    '06': 'Obstétrica e Neonatal',
    '07': 'Ações Integradas',
    '08': 'Transplante de Órgãos',
    '09': 'Cuidados Integrados',
}

# ── parser universal ──────────────────────────────────────────────────────────

def parse_tabnet(filepath: str):
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

    return df, mun_col

# ── helpers ───────────────────────────────────────────────────────────────────

def mes_to_order(mes: str) -> int:
    """'2025/Dez' → ordenação numérica 202512"""
    try:
        ano, mmm = mes.split('/')
        return int(ano) * 100 + MES_ORD.get(mmm, 0)
    except Exception:
        return 0

def extrair_ibge_nome(s: str):
    """'350280 ARACATUBA' → ('350280', 'Araçatuba')"""
    m = re.match(r'^(\d{6,7})\s*(.*)', s.strip())
    if not m:
        return None, None
    ibge = m.group(1)[:6]
    nome = m.group(2).strip().title()
    return ibge, nome

def colunas_temporais(df: pd.DataFrame, mun_col: str):
    """Retorna colunas mensais (exclui mun_col e 'Total'), ordenadas cronologicamente."""
    excluir = {mun_col, 'Total'}
    cols = [c for c in df.columns if c not in excluir and re.match(r'^\d{4}/', c)]
    return sorted(cols, key=mes_to_order)

def safe_div(a, b):
    if b == 0:
        return None
    v = a / b
    if v < 0 or v > 100:
        return 0.0
    return round(float(v), 4)

def clamp_pct(v):
    if v is None:
        return None
    return max(0.0, min(100.0, round(float(v), 4)))

def taxa_glosa(apres, aprov):
    if apres <= 0:
        return 0.0
    t = max(0, apres - aprov) / apres * 100
    return clamp_pct(t)

def quartil(valor, todos):
    arr = sorted([v for v in todos if v is not None and not np.isnan(v)])
    if not arr:
        return 2
    p25 = np.percentile(arr, 25)
    p50 = np.percentile(arr, 50)
    p75 = np.percentile(arr, 75)
    if valor <= p25:
        return 1
    elif valor <= p50:
        return 2
    elif valor <= p75:
        return 3
    else:
        return 4

# ── carregamento dos CSVs ─────────────────────────────────────────────────────

print("Carregando CSVs…")

df_aprov,  mc_aprov  = parse_tabnet(os.path.join(BASE_DIR, 'quantidade_aprovada_sp.csv'))
df_apres,  mc_apres  = parse_tabnet(os.path.join(BASE_DIR, 'quantidade_apresentada_sp.csv'))
df_vaprov, mc_vaprov = parse_tabnet(os.path.join(BASE_DIR, 'valor_aprovado_sp.csv'))
df_vapres, mc_vapres = parse_tabnet(os.path.join(BASE_DIR, 'valor_apresentado_sp.csv'))
df_ab,     mc_ab     = parse_tabnet(os.path.join(BASE_DIR, 'mensal_ab_sp.csv'))
df_mc,     mc_mc     = parse_tabnet(os.path.join(BASE_DIR, 'mensal_mc_sp.csv'))
df_ac,     mc_ac     = parse_tabnet(os.path.join(BASE_DIR, 'mensal_ac_sp.csv'))
df_carat,  mc_carat  = parse_tabnet(os.path.join(BASE_DIR, 'quantidade_aprovada_sp_carater_atendimento.csv'))
df_forma,  mc_forma  = parse_tabnet(os.path.join(BASE_DIR, 'quantidade_aprovada_sp_forma_organizacao.csv'))

# extrai ibge e nome de cada df
def add_ibge_nome(df, mun_col):
    df[['ibge', 'nome']] = df[mun_col].apply(
        lambda x: pd.Series(extrair_ibge_nome(x))
    )
    df = df[df['ibge'].notna()].copy()
    df = df.drop(columns=[mun_col])  # remove coluna original de município
    df = df.set_index('ibge')
    return df

df_aprov  = add_ibge_nome(df_aprov,  mc_aprov)
df_apres  = add_ibge_nome(df_apres,  mc_apres)
df_vaprov = add_ibge_nome(df_vaprov, mc_vaprov)
df_vapres = add_ibge_nome(df_vapres, mc_vapres)
df_ab     = add_ibge_nome(df_ab,     mc_ab)
df_mc     = add_ibge_nome(df_mc,     mc_mc)
df_ac     = add_ibge_nome(df_ac,     mc_ac)
df_carat  = add_ibge_nome(df_carat,  mc_carat)
df_forma  = add_ibge_nome(df_forma,  mc_forma)

cols_aprov  = colunas_temporais(df_aprov,  mc_aprov)
cols_apres  = colunas_temporais(df_apres,  mc_apres)
cols_vaprov = colunas_temporais(df_vaprov, mc_vaprov)
cols_vapres = colunas_temporais(df_vapres, mc_vapres)
cols_ab     = colunas_temporais(df_ab,     mc_ab)
cols_mc     = colunas_temporais(df_mc,     mc_mc)
cols_ac     = colunas_temporais(df_ac,     mc_ac)

# penúltimo mês fechado = 2025/Dez (Jan/2026 pode estar incompleto)
todos_meses = sorted(set(cols_aprov) | set(cols_vaprov), key=mes_to_order)
MES_RECENTE = '2025/Dez'
print(f"Mês mais recente fechado: {MES_RECENTE}")

all_ibge = sorted(set(df_aprov.index) | set(df_ab.index) | set(df_mc.index) | set(df_ac.index))
print(f"Total municípios únicos: {len(all_ibge)}")

os.makedirs(OUT_DIR, exist_ok=True)

# ═══════════════════════════════════════════════════════════════════════════════
# JSON 1 — serie_temporal.json
# ═══════════════════════════════════════════════════════════════════════════════

print("\n[1/6] Gerando serie_temporal.json…")

serie_temporal = {}

# meses comuns para ticker médio (Out/2023 em diante — quando valor existe)
meses_valor = set(cols_vaprov)

for ibge in all_ibge:
    por_mes = []
    vals_aprov_2024, vals_aprov_2025 = [], []
    vals_vaprov_2024, vals_vaprov_2025 = [], []
    glosa_qtd_2024, glosa_qtd_2025 = [], []
    glosa_fin_2024, glosa_fin_2025 = [], []
    ticket_2024, ticket_2025 = [], []

    prev_qtd = None

    for mes in todos_meses:
        ano = int(mes.split('/')[0])

        qtd_aprov  = float(df_aprov.loc[ibge, mes])  if (ibge in df_aprov.index  and mes in df_aprov.columns)  else 0.0
        qtd_apres  = float(df_apres.loc[ibge, mes])  if (ibge in df_apres.index  and mes in df_apres.columns)  else 0.0
        val_aprov  = float(df_vaprov.loc[ibge, mes]) if (ibge in df_vaprov.index and mes in df_vaprov.columns) else None
        val_apres  = float(df_vapres.loc[ibge, mes]) if (ibge in df_vapres.index and mes in df_vapres.columns) else None

        # ajusta None quando mes não está nas colunas de valor
        if mes not in meses_valor:
            val_aprov = None
            val_apres = None

        glosa_abs     = max(0.0, qtd_apres - qtd_aprov)
        taxa_glosa_q  = taxa_glosa(qtd_apres, qtd_aprov)

        if val_aprov is not None and val_apres is not None:
            glosa_fin_abs  = max(0.0, val_apres - val_aprov)
            taxa_glosa_f   = taxa_glosa(val_apres, val_aprov)
        else:
            glosa_fin_abs = None
            taxa_glosa_f  = None

        ticket = round(val_aprov / qtd_aprov, 4) if (val_aprov is not None and qtd_aprov > 0) else None

        var_mom = None
        if prev_qtd is not None and prev_qtd > 0:
            var_mom = round((qtd_aprov - prev_qtd) / prev_qtd * 100, 2)
        prev_qtd = qtd_aprov

        por_mes.append({
            'mes': mes,
            'qtd_aprovada': int(qtd_aprov),
            'qtd_apresentada': int(qtd_apres),
            'glosa_qtd_abs': int(glosa_abs),
            'taxa_glosa_qtd': round(taxa_glosa_q, 4),
            'valor_aprovado': round(val_aprov, 2) if val_aprov is not None else None,
            'valor_apresentado': round(val_apres, 2) if val_apres is not None else None,
            'glosa_financeira_abs': round(glosa_fin_abs, 2) if glosa_fin_abs is not None else None,
            'taxa_glosa_financeira': round(taxa_glosa_f, 4) if taxa_glosa_f is not None else None,
            'ticket_medio': round(ticket, 4) if ticket is not None else None,
            'var_mom_pct': var_mom,
        })

        if ano == 2024:
            vals_aprov_2024.append(qtd_aprov)
            if val_aprov is not None: vals_vaprov_2024.append(val_aprov)
            glosa_qtd_2024.append(taxa_glosa_q)
            if taxa_glosa_f is not None: glosa_fin_2024.append(taxa_glosa_f)
            if ticket is not None: ticket_2024.append(ticket)
        elif ano == 2025:
            vals_aprov_2025.append(qtd_aprov)
            if val_aprov is not None: vals_vaprov_2025.append(val_aprov)
            glosa_qtd_2025.append(taxa_glosa_q)
            if taxa_glosa_f is not None: glosa_fin_2025.append(taxa_glosa_f)
            if ticket is not None: ticket_2025.append(ticket)

    def resumo(aprov, vaprov, glosa_q, glosa_f, tickets):
        if not aprov:
            return None
        return {
            'qtd_aprovada': int(sum(aprov)),
            'valor_aprovado': round(sum(vaprov), 2) if vaprov else None,
            'ticket_medio_medio': round(float(np.mean(tickets)), 4) if tickets else None,
            'taxa_glosa_qtd_media': round(float(np.mean(glosa_q)), 4) if glosa_q else None,
            'taxa_glosa_financeira_media': round(float(np.mean(glosa_f)), 4) if glosa_f else None,
        }

    r2024 = resumo(vals_aprov_2024, vals_vaprov_2024, glosa_qtd_2024, glosa_fin_2024, ticket_2024)
    r2025 = resumo(vals_aprov_2025, vals_vaprov_2025, glosa_qtd_2025, glosa_fin_2025, ticket_2025)

    var_2425 = None
    if r2024 and r2025 and r2024['qtd_aprovada'] > 0:
        var_2425 = round((r2025['qtd_aprovada'] - r2024['qtd_aprovada']) / r2024['qtd_aprovada'] * 100, 2)

    serie_temporal[ibge] = {
        'nome': df_aprov.loc[ibge, 'nome'] if ibge in df_aprov.index else '',
        'por_mes': por_mes,
        'resumo_2024': r2024,
        'resumo_2025': r2025,
        'var_total_2425_pct': var_2425,
        'mes_mais_recente_fechado': MES_RECENTE,
    }

# validação Araçatuba
if ARACATUBA in serie_temporal:
    r = serie_temporal[ARACATUBA]
    print(f"  Araçatuba resumo_2025: {r.get('resumo_2025')}")
    print(f"  Araçatuba var_2425: {r.get('var_total_2425_pct')}%")

with open(os.path.join(OUT_DIR, 'serie_temporal.json'), 'w', encoding='utf-8') as f:
    json.dump(serie_temporal, f, ensure_ascii=False, separators=(',', ':'))
print(f"  [OK] serie_temporal.json — {len(serie_temporal)} municípios")

# ═══════════════════════════════════════════════════════════════════════════════
# JSON 2 — complexidade_mensal.json
# ═══════════════════════════════════════════════════════════════════════════════

print("\n[2/6] Gerando complexidade_mensal.json…")

# todos os meses disponíveis nos 3 arquivos de complexidade
todos_meses_complex = sorted(
    set(cols_ab) | set(cols_mc) | set(cols_ac),
    key=mes_to_order
)

complexidade_mensal = {}

for ibge in all_ibge:
    por_mes = []
    ac_serie = {}  # mes → valor (para pico/vale)

    # sazonalidade: {mes_do_ano_num → [valores]}
    sazon_ab = defaultdict(list)
    sazon_mc = defaultdict(list)
    sazon_ac = defaultdict(list)

    for mes in todos_meses_complex:
        ab = float(df_ab.loc[ibge, mes]) if (ibge in df_ab.index and mes in df_ab.columns) else 0.0
        mc = float(df_mc.loc[ibge, mes]) if (ibge in df_mc.index and mes in df_mc.columns) else 0.0
        ac = float(df_ac.loc[ibge, mes]) if (ibge in df_ac.index and mes in df_ac.columns) else 0.0

        total_c = ab + mc + ac
        por_mes.append({
            'mes': mes,
            'ab': int(ab),
            'mc': int(mc),
            'ac': int(ac),
            'total_complexidade': int(total_c),
            'pct_ab': clamp_pct(ab / total_c * 100) if total_c > 0 else 0.0,
            'pct_mc': clamp_pct(mc / total_c * 100) if total_c > 0 else 0.0,
            'pct_ac': clamp_pct(ac / total_c * 100) if total_c > 0 else 0.0,
        })

        if ac > 0:
            ac_serie[mes] = ac

        mmm = mes.split('/')[1]
        mes_num = MES_ORD.get(mmm, 0)
        if ab > 0: sazon_ab[mes_num].append(ab)
        if mc > 0: sazon_mc[mes_num].append(mc)
        if ac > 0: sazon_ac[mes_num].append(ac)

    # pico e vale de AC
    if ac_serie:
        pico_mes = max(ac_serie, key=lambda m: ac_serie[m])
        vale_mes = min(ac_serie, key=lambda m: ac_serie[m])
        pico_ac = {'mes': pico_mes, 'valor': int(ac_serie[pico_mes])}
        vale_ac = {'mes': vale_mes, 'valor': int(ac_serie[vale_mes])}
    else:
        pico_ac = None
        vale_ac = None

    # sazonalidade (média histórica por mês do ano)
    nomes_mes = {1:'Jan',2:'Fev',3:'Mar',4:'Abr',5:'Mai',6:'Jun',
                 7:'Jul',8:'Ago',9:'Set',10:'Out',11:'Nov',12:'Dez'}
    sazonalidade = []
    for m in range(1, 13):
        sazonalidade.append({
            'mes_do_ano': nomes_mes[m],
            'media_ab': round(float(np.mean(sazon_ab[m])), 1) if sazon_ab[m] else 0.0,
            'media_mc': round(float(np.mean(sazon_mc[m])), 1) if sazon_mc[m] else 0.0,
            'media_ac': round(float(np.mean(sazon_ac[m])), 1) if sazon_ac[m] else 0.0,
        })

    complexidade_mensal[ibge] = {
        'nome': df_aprov.loc[ibge, 'nome'] if ibge in df_aprov.index else '',
        'por_mes': por_mes,
        'pico_ac_historico': pico_ac,
        'vale_ac_historico': vale_ac,
        'sazonalidade': sazonalidade,
    }

# validação
if ARACATUBA in complexidade_mensal:
    r = complexidade_mensal[ARACATUBA]
    meses_2025 = [m for m in r['por_mes'] if m['mes'].startswith('2025')]
    total_ab = sum(m['ab'] for m in meses_2025)
    total_mc = sum(m['mc'] for m in meses_2025)
    total_ac = sum(m['ac'] for m in meses_2025)
    print(f"  Araçatuba 2025 AB={total_ab:,}  MC={total_mc:,}  AC={total_ac:,}  Total={total_ab+total_mc+total_ac:,}")
    print(f"  Araçatuba pico_ac: {r['pico_ac_historico']}")

with open(os.path.join(OUT_DIR, 'complexidade_mensal.json'), 'w', encoding='utf-8') as f:
    json.dump(complexidade_mensal, f, ensure_ascii=False, separators=(',', ':'))
print(f"  [OK] complexidade_mensal.json — {len(complexidade_mensal)} municípios")

# ═══════════════════════════════════════════════════════════════════════════════
# JSON 3 — perfil_municipio.json
# ═══════════════════════════════════════════════════════════════════════════════

print("\n[3/6] Gerando perfil_municipio.json…")

def total_ano(df_cols_dict, ibge, ano):
    """Soma todas as colunas do ano para o município."""
    total = 0.0
    for df, cols in df_cols_dict:
        for mes in cols:
            if not mes.startswith(str(ano)):
                continue
            if ibge in df.index and mes in df.columns:
                total += float(df.loc[ibge, mes])
    return total

# coleta totais 2024 e 2025 por complexidade
perfil_municipio = {}

for ibge in all_ibge:
    nome = df_aprov.loc[ibge, 'nome'] if ibge in df_aprov.index else (
           df_ab.loc[ibge, 'nome'] if ibge in df_ab.index else '')

    def soma_ano_df(df, cols, ano):
        meses = [m for m in cols if m.startswith(str(ano))]
        if ibge not in df.index:
            return 0.0
        return sum(float(df.loc[ibge, m]) for m in meses if m in df.columns)

    ab_2024 = soma_ano_df(df_ab, cols_ab, 2024)
    mc_2024 = soma_ano_df(df_mc, cols_mc, 2024)
    ac_2024 = soma_ano_df(df_ac, cols_ac, 2024)
    total_2024 = soma_ano_df(df_aprov, cols_aprov, 2024)
    na_2024 = max(0.0, total_2024 - ab_2024 - mc_2024 - ac_2024)

    ab_2025 = soma_ano_df(df_ab, cols_ab, 2025)
    mc_2025 = soma_ano_df(df_mc, cols_mc, 2025)
    ac_2025 = soma_ano_df(df_ac, cols_ac, 2025)
    total_2025 = soma_ano_df(df_aprov, cols_aprov, 2025)
    na_2025 = max(0.0, total_2025 - ab_2025 - mc_2025 - ac_2025)

    # Perfil 2025
    denom = ab_2025 + mc_2025 + ac_2025 + na_2025
    pct_ac = clamp_pct(ac_2025 / denom * 100) if denom > 0 else 0.0
    pct_mc = clamp_pct(mc_2025 / denom * 100) if denom > 0 else 0.0
    pct_ab = clamp_pct(ab_2025 / denom * 100) if denom > 0 else 0.0

    if pct_ac > 60:
        perfil = 'POLO_AC'
    elif pct_mc > 50 and pct_ac < 30:
        perfil = 'POLO_MC'
    elif pct_ab > 50:
        perfil = 'AB_DOMINANTE'
    else:
        perfil = 'EQUILIBRADO'

    # variações
    def var_pct(novo, antigo):
        if antigo == 0:
            return None
        return round((novo - antigo) / antigo * 100, 2)

    perfil_municipio[ibge] = {
        'nome': nome,
        'ibge': ibge,
        'perfil_2025': perfil,
        'ab_2024': int(ab_2024), 'mc_2024': int(mc_2024),
        'ac_2024': int(ac_2024), 'na_2024': int(na_2024), 'total_2024': int(total_2024),
        'ab_2025': int(ab_2025), 'mc_2025': int(mc_2025),
        'ac_2025': int(ac_2025), 'na_2025': int(na_2025), 'total_2025': int(total_2025),
        'pct_ac_2025': pct_ac,
        'pct_mc_2025': pct_mc,
        'pct_ab_2025': pct_ab,
        'var_total_2425_pct': var_pct(total_2025, total_2024),
        'var_ac_2425_pct': var_pct(ac_2025, ac_2024),
        'var_ab_2425_pct': var_pct(ab_2025, ab_2024),
        'var_mc_2425_pct': var_pct(mc_2025, mc_2024),
        # rankings calculados depois
        'ranking_total_sp': None,
        'ranking_ac_sp': None,
        'quartil_volume': None,
    }

# Rankings
sorted_total = sorted(perfil_municipio.keys(), key=lambda i: perfil_municipio[i]['total_2025'], reverse=True)
sorted_ac    = sorted(perfil_municipio.keys(), key=lambda i: perfil_municipio[i]['ac_2025'], reverse=True)

for rank, ibge in enumerate(sorted_total, 1):
    perfil_municipio[ibge]['ranking_total_sp'] = rank
for rank, ibge in enumerate(sorted_ac, 1):
    perfil_municipio[ibge]['ranking_ac_sp'] = rank

todos_totais = [perfil_municipio[i]['total_2025'] for i in perfil_municipio]
for ibge in perfil_municipio:
    perfil_municipio[ibge]['quartil_volume'] = quartil(perfil_municipio[ibge]['total_2025'], todos_totais)

# validação
if ARACATUBA in perfil_municipio:
    p = perfil_municipio[ARACATUBA]
    print(f"  Araçatuba: total_2025={p['total_2025']:,}  perfil={p['perfil_2025']}  ranking={p['ranking_total_sp']}  quartil={p['quartil_volume']}")
    print(f"  Araçatuba: pct_ac={p['pct_ac_2025']}%  pct_mc={p['pct_mc_2025']}%  pct_ab={p['pct_ab_2025']}%")

with open(os.path.join(OUT_DIR, 'perfil_municipio.json'), 'w', encoding='utf-8') as f:
    json.dump(perfil_municipio, f, ensure_ascii=False, separators=(',', ':'))
print(f"  [OK] perfil_municipio.json — {len(perfil_municipio)} municípios")

# ═══════════════════════════════════════════════════════════════════════════════
# JSON 4 — carater_atendimento.json
# ═══════════════════════════════════════════════════════════════════════════════

print("\n[4/6] Gerando carater_atendimento.json…")

# mapeamento por posição (colunas chegam corrompidas pelo encoding)
# Posição 1: Eletivo
# Posição 2: Urgência
# Posição 3: Acidente trabalho
# Posição 4: Acidente trajeto
# Posição 5: Outros acidentes trânsito
# Posição 6: Outros lesões
# Posição 7: BPA-C (Informação inexistente)
# Posição 8: Total (ignorar)
carat_cols_orig = [c for c in df_carat.columns if c not in ['nome', 'Total']]

carater_atendimento = {}

for ibge in df_carat.index:
    row = df_carat.loc[ibge]
    cols = carat_cols_orig  # exclui mun_col e Total

    def get_pos(pos):
        if pos < len(cols) and cols[pos] in df_carat.columns:
            return float(row.get(cols[pos], 0) or 0)
        return 0.0

    eletivo  = get_pos(0)
    urgencia = get_pos(1)
    acid1    = get_pos(2)  # trabalho
    acid2    = get_pos(3)  # trajeto
    acid3    = get_pos(4)  # outros trânsito
    acid4    = get_pos(5)  # outros lesões
    bpa      = get_pos(6)

    acidentes = acid1 + acid2 + acid3 + acid4
    total = eletivo + urgencia + acidentes + bpa

    def pct(v):
        return clamp_pct(v / total * 100) if total > 0 else 0.0

    carater_atendimento[ibge] = {
        'eletivo':        {'qtd': int(eletivo),  'pct': pct(eletivo)},
        'urgencia':       {'qtd': int(urgencia), 'pct': pct(urgencia)},
        'acidentes':      {'qtd': int(acidentes),'pct': pct(acidentes)},
        'bpa_consolidado':{'qtd': int(bpa),      'pct': pct(bpa)},
        'total': int(total),
    }

# validação
if ARACATUBA in carater_atendimento:
    c = carater_atendimento[ARACATUBA]
    print(f"  Araçatuba: eletivo={c['eletivo']}, urgencia={c['urgencia']}, bpa={c['bpa_consolidado']}, total={c['total']:,}")

with open(os.path.join(OUT_DIR, 'carater_atendimento.json'), 'w', encoding='utf-8') as f:
    json.dump(carater_atendimento, f, ensure_ascii=False, separators=(',', ':'))
print(f"  [OK] carater_atendimento.json — {len(carater_atendimento)} municípios")

# ═══════════════════════════════════════════════════════════════════════════════
# JSON 5 — forma_organizacao.json
# ═══════════════════════════════════════════════════════════════════════════════

print("\n[5/6] Gerando forma_organizacao.json…")

# colunas de subgrupos (excluir nome e Total)
forma_cols = [c for c in df_forma.columns if c not in ['nome', 'Total'] and re.match(r'^\d{2}', c)]

forma_organizacao = {}

for ibge in df_forma.index:
    row = df_forma.loc[ibge]

    # agrupa por prefixo 2 dígitos
    grupos_agg = defaultdict(float)
    # também guarda subgrupos para expansão
    subgrupos_agg = defaultdict(dict)

    for col in forma_cols:
        prefix = col[:2]
        if prefix not in GRUPOS_FORM_ORG:
            continue
        val = float(row.get(col, 0) or 0)
        grupos_agg[prefix] += val
        subgrupos_agg[prefix][col] = val

    total = sum(grupos_agg.values())

    grupos = []
    for prefix, nome_grupo in GRUPOS_FORM_ORG.items():
        qtd = grupos_agg.get(prefix, 0.0)
        if qtd == 0:
            continue
        # top 5 subgrupos
        top5 = sorted(subgrupos_agg[prefix].items(), key=lambda x: x[1], reverse=True)[:5]
        subgrupos_list = []
        for col, v in top5:
            if v == 0:
                continue
            # nome sem código
            nome_sub = re.sub(r'^\d{6}\s*', '', col).strip()
            pct_sub = clamp_pct(v / qtd * 100) if qtd > 0 else 0.0
            subgrupos_list.append({
                'nome': nome_sub,
                'qtd': int(v),
                'pct_no_grupo': pct_sub,
            })

        grupos.append({
            'codigo': prefix,
            'nome': nome_grupo,
            'qtd': int(qtd),
            'pct_sobre_total': clamp_pct(qtd / total * 100) if total > 0 else 0.0,
            'subgrupos': subgrupos_list,
        })

    grupos.sort(key=lambda g: g['qtd'], reverse=True)

    forma_organizacao[ibge] = {
        'grupos': grupos,
        'total': int(total),
    }

# validação
if ARACATUBA in forma_organizacao:
    fo = forma_organizacao[ARACATUBA]
    print(f"  Araçatuba: total={fo['total']:,}, top_grupo={fo['grupos'][0] if fo['grupos'] else None}")

with open(os.path.join(OUT_DIR, 'forma_organizacao.json'), 'w', encoding='utf-8') as f:
    json.dump(forma_organizacao, f, ensure_ascii=False, separators=(',', ':'))
print(f"  [OK] forma_organizacao.json — {len(forma_organizacao)} municípios")

# ═══════════════════════════════════════════════════════════════════════════════
# JSON 6 — benchmarks_sp.json
# ═══════════════════════════════════════════════════════════════════════════════

print("\n[6/6] Gerando benchmarks_sp.json…")

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

# excluir São Paulo capital (IBGE 355030)
SP_CAPITAL = '355030'

mets = {
    'qtd_mensal_media': [],
    'ticket_medio': [],
    'taxa_glosa_qtd': [],
    'taxa_glosa_fin': [],
    'pct_ac': [],
    'pct_mc': [],
    'pct_ab': [],
    'var_total_2425': [],
}

for ibge, p in perfil_municipio.items():
    if ibge == SP_CAPITAL:
        continue
    mets['pct_ac'].append(p['pct_ac_2025'])
    mets['pct_mc'].append(p['pct_mc_2025'])
    mets['pct_ab'].append(p['pct_ab_2025'])
    if p['var_total_2425_pct'] is not None:
        mets['var_total_2425'].append(p['var_total_2425_pct'])

for ibge, s in serie_temporal.items():
    if ibge == SP_CAPITAL:
        continue
    meses_2025 = [m for m in s['por_mes'] if m['mes'].startswith('2025')]
    qtds = [m['qtd_aprovada'] for m in meses_2025 if m['qtd_aprovada'] > 0]
    if qtds:
        mets['qtd_mensal_media'].append(float(np.mean(qtds)))
    tickets = [m['ticket_medio'] for m in meses_2025 if m['ticket_medio'] is not None]
    if tickets:
        mets['ticket_medio'].append(float(np.mean(tickets)))
    glosas_q = [m['taxa_glosa_qtd'] for m in meses_2025 if m['taxa_glosa_qtd'] > 0]
    if glosas_q:
        mets['taxa_glosa_qtd'].append(float(np.mean(glosas_q)))
    glosas_f = [m['taxa_glosa_financeira'] for m in meses_2025
                if m['taxa_glosa_financeira'] is not None and m['taxa_glosa_financeira'] > 0]
    if glosas_f:
        mets['taxa_glosa_fin'].append(float(np.mean(glosas_f)))

# polos AC
polos_ac = [
    {
        'ibge': ibge,
        'nome': p['nome'],
        'ac_2025': p['ac_2025'],
        'pct_ac_2025': p['pct_ac_2025'],
        'var_ac_2425_pct': p['var_ac_2425_pct'],
        'ranking_ac_sp': p['ranking_ac_sp'],
    }
    for ibge, p in perfil_municipio.items()
    if p['perfil_2025'] == 'POLO_AC' and ibge != SP_CAPITAL
]
polos_ac.sort(key=lambda x: x['ac_2025'], reverse=True)

benchmarks_sp = {
    'metricas': {k: stats(v) for k, v in mets.items()},
    'polos_ac': polos_ac,
    'total_municipios': len([i for i in perfil_municipio if i != SP_CAPITAL]),
}

print(f"  Benchmarks qtd_mensal_media: {benchmarks_sp['metricas']['qtd_mensal_media']}")
print(f"  Benchmarks ticket_medio: {benchmarks_sp['metricas']['ticket_medio']}")
print(f"  Total POLO_AC: {len(polos_ac)}")

with open(os.path.join(OUT_DIR, 'benchmarks_sp.json'), 'w', encoding='utf-8') as f:
    json.dump(benchmarks_sp, f, ensure_ascii=False, separators=(',', ':'))
print(f"  [OK] benchmarks_sp.json")

# ── resumo final ──────────────────────────────────────────────────────────────

print("\n" + "="*60)
print("PROCESSAMENTO CONCLUÍDO — 6 JSONs gerados")
print(f"Destino: {OUT_DIR}")
print("="*60)
print(f"\nValidação Araçatuba (IBGE {ARACATUBA}):")
if ARACATUBA in serie_temporal:
    r2025 = serie_temporal[ARACATUBA].get('resumo_2025')
    if r2025:
        print(f"  serie_temporal 2025 qtd_aprovada: {r2025['qtd_aprovada']:,}")
        print(f"  serie_temporal 2025 valor_aprovado: R$ {r2025['valor_aprovado']:,.2f}" if r2025['valor_aprovado'] else "  valor_aprovado: n/a")
if ARACATUBA in complexidade_mensal:
    meses25 = [m for m in complexidade_mensal[ARACATUBA]['por_mes'] if m['mes'].startswith('2025')]
    ab_s = sum(m['ab'] for m in meses25)
    mc_s = sum(m['mc'] for m in meses25)
    ac_s = sum(m['ac'] for m in meses25)
    print(f"  complexidade 2025: AB={ab_s:,}  MC={mc_s:,}  AC={ac_s:,}  Total={ab_s+mc_s+ac_s:,}")
if ARACATUBA in perfil_municipio:
    p = perfil_municipio[ARACATUBA]
    print(f"  perfil: {p['perfil_2025']}  ranking_total={p['ranking_total_sp']}  quartil={p['quartil_volume']}")
