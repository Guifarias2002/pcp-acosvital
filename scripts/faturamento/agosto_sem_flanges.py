# Relatório de AGOSTO (CONTROLE GERAL original, apresentado no dia 19) no mesmo
# layout, SEM a família Flanges (enviada à parte).
import openpyxl
from classif import norm
from pdf_modelo import gerar, PASTA

ORIG = PASTA + 'CONTROLE GERAL DE FATURAMENTO AÇOS VITAL.xlsx'
SAIDA = PASTA + 'Faturamento - Agosto (sem Flanges).pdf'
reg = [(float(r[1] or 0), norm(r[4]) or '(SEM FAMÍLIA)', norm(r[5]), norm(r[6]), str(r[3]).strip())
       for r in openpyxl.load_workbook(ORIG, data_only=True).worksheets[0].iter_rows(min_row=4, values_only=True) if r[0]]
fl = [x for x in reg if x[1] == 'FLANGES']; sem = [x for x in reg if x[1] != 'FLANGES']
nfs = sorted(int(x[4]) for x in reg if x[4].isdigit() and int(x[4]) > 1)
f = lambda n: f'{n:,}'.replace(',', '.')
brl = lambda v: ('R$ ' + f'{v:,.2f}').replace(',', 'X').replace('.', ',').replace('X', '.')
vfab = sum(x[0] for x in fl if x[2] == 'FABRICA FLANGES'); vrev = sum(x[0] for x in fl) - vfab
print(gerar(sem, SAIDA, 'Agosto · <b>sem Flanges</b> · Por Empresa de Fabricação e Local de Produção · valores por Total da Nota Fiscal',
            f'Fonte: CONTROLE GERAL DE FATURAMENTO AÇOS VITAL.xlsx (relatório de agosto, apresentado no dia 19, NFs {f(nfs[0])} a {f(nfs[-1])}). '
            f'Família Flanges retirada (enviada à parte): {brl(vfab + vrev)} — {brl(vfab)} da Fábrica Flanges + {brl(vrev)} de revenda.'))
