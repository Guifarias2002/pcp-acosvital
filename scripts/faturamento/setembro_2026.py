# Setembro/2026 (versão final): export Omie "Relatorio faturamento Setembro.xlsx" (só Pedido
# de Venda) + CALDEIRARIA do sistema (PCP Caldeiraria, mês de chegada) + FLANGES do sistema
# (pedidos de Flange emitidos no mês, valor da tela Valores por Mês). Linhas da planilha de
# pedidos que já vêm do sistema saem (não contar duas vezes). Grava Excel + PDF em 2026/9 - Setembro.
# Antes:
#   node --env-file=.env.local scripts/faturamento/sistema_caldeiraria.mjs <CALD>
#   node --env-file=.env.local scripts/faturamento/sistema_flanges.mjs 2026-09 <FLG>
# Uso: python setembro_2026.py <CALD> <FLG>
import json, os, re, sys, openpyxl
from classif import classificar, tipo_doc
from pdf_modelo import gerar
from pastas_2026 import excel, pasta

ARQ = r'C:/Users/guilherme.santos/Downloads/Relatorio faturamento Setembro.xlsx'
CALD, FLG = sys.argv[1], sys.argv[2]
MES = '2026-09'
EMP = {'acosvital': 'AÇOS VITAL', 'hrm': 'HRM'}
num = lambda s: re.sub(r'\D', '', str(s or '')).lstrip('0')
brl = lambda v: ('R$ ' + f'{v:,.2f}').replace(',', 'X').replace('.', ',').replace('X', '.')

nv = [r for r in openpyxl.load_workbook(ARQ, data_only=True).worksheets[0].iter_rows(min_row=2, values_only=True) if r[0]]
# colunas: Descrição | Total de Mercadoria | Total da Nota Fiscal | Pedido | Nota Fiscal | Local de Estoque
pv = [r for r in nv if tipo_doc(r[3]) == 'Pedido de Venda']
fora = [r for r in nv if tipo_doc(r[3]) != 'Pedido de Venda']
omie = []
for r in pv:
    (f, l, e), como = classificar(r[0])
    omie.append((str(r[0]), float(r[2] or 0), r[3], str(r[4]).strip(), f or '(SEM FAMÍLIA)', l, e, como, r[5] or ''))

cald = [c for c in json.load(open(CALD, encoding='utf-8'))
        if c['status'] != 'cancelado' and (c['chegada'] or c['criado_em'])[:7] == MES]
sis_c = [(f"PV {c['pedido']} - {c['cliente'] or ''} - {c['material']}", float(c['valor'] or 0), f"Pedido de Venda nº {c['pedido']}", '',
          'CALDEIRARIA', 'CALDEIRARIA (PLANEJAMENTO)', EMP.get(c['empresa'], 'AÇOS VITAL'),
          f"sistema — {c['status']}" + (f", finalizado {c['finalizado_em']}" if c['finalizado_em'] else ''), '') for c in cald]
flg = json.load(open(FLG, encoding='utf-8'))
sis_f = [(f"PV {p['pedido']} - {p['cliente'] or ''} - {int(p['pecas'])} peças", float(p['valor'] or 0), f"Pedido de Venda nº {p['pedido']}", '',
          'FLANGES', 'FABRICA FLANGES', 'HRM', f"sistema — emitido {p['data_emissao']} ({p['status']})", '') for p in flg]

# Caldeiraria: o pedido todo vem do sistema. Flanges: o total é SEMPRE o da tela Valores
# por Mês (sistema) → TODA linha da família FLANGES do Omie sai; a revenda do mesmo pedido fica.
ped_c = {num(c['pedido']) for c in cald if (c['valor'] or 0) > 0}
e_dup = lambda x: num(x[2]) in ped_c or x[4] == 'FLANGES'
dup = [x for x in omie if e_dup(x)]
resto = [x for x in omie if not e_dup(x)]
reg = [x[:7] for x in resto + sis_c + sis_f]
v = lambda L: sum(x[1] for x in L)
assert abs(v(reg) - (v(omie) - v(dup) + v(sis_c) + v(sis_f))) < 0.01

# abas de conferência
H = ['Descrição do Produto (completa)', 'Total da Nota Fiscal', 'Pedido', 'Nota Fiscal', 'Familia', 'Local de produção', 'Empresa de fabricação', 'Como foi classificado', 'Local de Estoque (Omie)']
class Aba:  # imita a worksheet p/ o excel() copiar
    def __init__(s, linhas): s.linhas = linhas; s.column_dimensions = {}
    def iter_rows(s, values_only=True): return iter(s.linhas)
aba = lambda L: Aba([H] + [list(x) for x in sorted(L, key=lambda x: x[0])] + [['TOTAL', v(L)]])
fora_aba = Aba([['Tipo de documento', 'Descrição do Produto (completa)', 'Total da Nota Fiscal', 'Pedido', 'Nota Fiscal', 'Local de Estoque']] +
               [[tipo_doc(r[3]), str(r[0]), float(r[2] or 0), r[3], r[4], r[5]] for r in sorted(fora, key=lambda r: str(r[0]))])

ps = pasta(9, 'Setembro')
X = os.path.join(ps, 'Faturamento - Setembro 2026.xlsx'); P = os.path.join(ps, 'Faturamento - Setembro 2026.pdf')
tot, fab = excel(reg, X, 'Faturamento por Produto — Setembro 2026',
                 extras=[('Flanges (sistema)', aba(sis_f)), ('Caldeiraria (sistema)', aba(sis_c)),
                         ('Retirados (vêm do sistema)', aba(dup)), ('Planilha Omie (classificada)', aba(omie)), ('Fora do critério', fora_aba)])
nfs = sorted(int(x[3]) for x in omie if x[3].isdigit())
fmt = lambda n: f'{n:,}'.replace(',', '.')
gerar([(x[1], x[4], x[5], x[6], str(x[3])) for x in reg], P,
      'Setembro 2026 · planilha Omie + Flanges e Caldeiraria do sistema · Por Empresa de Fabricação e Local de Produção · valores por Total da Nota Fiscal',
      f'Fonte: export Omie de setembro (só Pedido de Venda, NFs {fmt(nfs[0])} a {fmt(nfs[-1])}), mesmos critérios do CONTROLE GERAL. '
      f'Flanges = sistema PCP, tela Valores por Mês ({brl(v(sis_f))}, {len(sis_f)} pedidos emitidos em setembro); Caldeiraria (Planejamento) = sistema PCP Caldeiraria '
      f'({brl(v(sis_c))}, mês de chegada na Caldeiraria); da planilha saíram {brl(v(dup))} (todos os flanges do Omie e os pedidos da Caldeiraria que já estão no sistema) para não contar duas vezes.')
print(X); print(P)
print('omie PV', round(v(omie), 2), '| dup', round(v(dup), 2), len(dup), '| sis flange', round(v(sis_f), 2), '| sis cald', round(v(sis_c), 2))
print('TOTAL', round(tot, 2), '| fabricado', round(fab, 2))
print('flanges omie que ficaram', round(sum(x[1] for x in resto if x[4] == 'FLANGES'), 2))
print('flanges omie retiradas', round(sum(x[1] for x in dup if x[4] == 'FLANGES'), 2))
