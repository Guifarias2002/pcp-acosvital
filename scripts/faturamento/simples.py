# Mesmo layout da "Faturamento - Apresentacao Diretoria", com as tabelas em
# Dia 19 | Novo | Total (relatório de 19/09 × o que entrou na PRODUÇÃO SETEMBRO).
import collections, openpyxl, re
from classif import norm
PASTA = r'C:/Users/guilherme.santos/Desktop/LEVANTAMENTO PRODUÇÃO CALDEIRARIA/'
X = PASTA + 'CONTROLE GERAL DE FATURAMENTO AÇOS VITAL - ATUALIZADO.xlsx'
ORIG = PASTA + 'CONTROLE GERAL DE FATURAMENTO AÇOS VITAL.xlsx'
SAIDA = PASTA + 'Faturamento - Apresentacao Diretoria - Dia 19 x Novo.pdf'

rows = [r for r in openpyxl.load_workbook(X).worksheets[0].iter_rows(min_row=4, values_only=True) if r[0]]
N19 = sum(1 for r in openpyxl.load_workbook(ORIG, data_only=True).worksheets[0].iter_rows(min_row=4, values_only=True) if r[0])
L = [dict(p='19' if i < N19 else 'n', v=float(r[1]), fam=norm(r[4]) or '(SEM FAMÍLIA)', loc=norm(r[5]), emp=norm(r[6]), nf=str(r[3]).strip())
     for i, r in enumerate(rows)]
def soma(key, per=None):
    c = collections.Counter()
    for x in L:
        if per is None or x['p'] == per: c[key(x)] += x['v']
    return c
t19 = sum(x['v'] for x in L if x['p'] == '19'); tn = sum(x['v'] for x in L if x['p'] == 'n'); tt = t19 + tn
assert abs(tt - sum(x['v'] for x in L)) < 0.005
Lt, L19, Ln = soma(lambda x: x['loc']), soma(lambda x: x['loc'], '19'), soma(lambda x: x['loc'], 'n')
f19, fn = t19 - L19['REVENDA'], tn - Ln['REVENDA']
nf19 = max(int(x['nf']) for x in L if x['p'] == '19' and x['nf'].isdigit())
nfn = sorted(int(x['nf']) for x in L if x['p'] == 'n' and x['nf'].isdigit())

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm
brl = lambda v: ('R$ ' + f'{v:,.2f}').replace(',', 'X').replace('.', ',').replace('X', '.') if v else '—'
tit = lambda s: s.title().replace('Ç', 'ç')
nf = lambda n: f'{n:,}'.replace(',', '.')
AZ = colors.HexColor('#1A3A5C'); VD = colors.HexColor('#16794B'); LAR = colors.HexColor('#C2410C'); AZN = colors.HexColor('#1D4ED8')
st = getSampleStyleSheet()
h1 = ParagraphStyle('h1', parent=st['Title'], alignment=0, textColor=AZ, fontSize=22, spaceAfter=2)
h2 = ParagraphStyle('h2', parent=st['Heading2'], textColor=AZ, fontSize=14, spaceBefore=10)
sub = ParagraphStyle('sub', parent=st['Normal'], textColor=colors.HexColor('#64748B'), fontSize=9.5, leading=13)
small = ParagraphStyle('sm', parent=st['Normal'], textColor=colors.HexColor('#64748B'), fontSize=8.5, leading=11)
kpi = ParagraphStyle('k', parent=st['Normal'], fontSize=9.5, leading=21)
body = ParagraphStyle('b', parent=st['Normal'], fontSize=9.5, leading=13)
W = [7.2 * cm, 3.4 * cm, 3.4 * cm, 3.4 * cm]

def tabela(linhas, destaque=(), ultimo_escuro=True):
    t = Table(linhas, colWidths=W)
    sty = [('BACKGROUND', (0, 0), (-1, 0), AZ), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white), ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
           ('FONTSIZE', (0, 0), (-1, -1), 9.5), ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
           ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F1F5F9')]),
           ('TEXTCOLOR', (2, 1), (2, -1), AZN), ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]
    if ultimo_escuro:
        sty += [('BACKGROUND', (0, -1), (-1, -1), AZ), ('TEXTCOLOR', (0, -1), (-1, -1), colors.white), ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold')]
    for i, cor, bg in destaque:
        sty += [('TEXTCOLOR', (0, i), (-1, i), cor), ('FONTNAME', (0, i), (-1, i), 'Helvetica-Bold'), ('BACKGROUND', (0, i), (-1, i), bg)]
    t.setStyle(TableStyle(sty)); return t

def linhas_de(key, filtro=lambda k: True):
    t_, a, b = soma(key), soma(key, '19'), soma(key, 'n')
    return [[tit(k), brl(a[k]), brl(b[k]), brl(t_[k])] for k, _ in t_.most_common() if filtro(k)]

doc = SimpleDocTemplate(SAIDA, pagesize=A4, leftMargin=1.8 * cm, rightMargin=1.8 * cm, topMargin=1.5 * cm, bottomMargin=1.5 * cm)
S = [Paragraph('Faturamento — Apresentação à Diretoria', h1),
     Paragraph('Relatório do dia 19 × o que entrou de novo · valores por Total da Nota Fiscal', sub), Spacer(1, 10)]
k = lambda rot, val, nota, cor: Paragraph(f'<font size=8 color="#64748B">{rot}</font><br/><font size=16 color="{cor}"><b>{val}</b></font><br/><font size=7.5 color="#64748B">{nota}</font>', kpi)
kp = Table([[k('RELATÓRIO DO DIA 19', brl(t19), f'NFs até {nf(nf19)}', '#475569'),
             k('NOVO (entrou depois)', brl(tn), f'NFs {nf(nfn[0])} a {nf(nfn[-1])}', '#1D4ED8'),
             k('TOTAL', brl(tt), f'fabricado {brl(f19 + fn)}', '#16794B')]], colWidths=[5.8 * cm] * 3)
kp.setStyle(TableStyle([('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#F1F5F9')), ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#EFF6FF')),
                        ('BACKGROUND', (2, 0), (2, 0), colors.HexColor('#EAF6EF')), ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
                        ('LEFTPADDING', (0, 0), (-1, -1), 9), ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
S += [kp, Paragraph('Por Empresa de Fabricação', h2)]
S += [tabela([['Empresa de Fabricação', 'Dia 19', 'Novo', 'Total']] + linhas_de(lambda x: x['emp']) + [['TOTAL GERAL', brl(t19), brl(tn), brl(tt)]])]

S += [Paragraph('Por Local de Produção (fábricas)', h2)]
lin = [['Local de Produção', 'Dia 19', 'Novo', 'Total']] + linhas_de(lambda x: x['loc'], lambda k: k != 'REVENDA')
lin += [['TOTAL FABRICADO', brl(f19), brl(fn), brl(f19 + fn)], ['Revenda (não fabricado)', brl(L19['REVENDA']), brl(Ln['REVENDA']), brl(Lt['REVENDA'])],
        ['TOTAL GERAL FATURADO', brl(t19), brl(tn), brl(tt)]]
S += [tabela(lin, destaque=[(len(lin) - 3, VD, colors.HexColor('#EAF6EF')), (len(lin) - 2, LAR, colors.HexColor('#FDF1E8'))])]

S += [PageBreak(), Paragraph('Por Família (classificação do produto)', h2)]
S += [tabela([['Família', 'Dia 19', 'Novo', 'Total']] + linhas_de(lambda x: x['fam']) + [['TOTAL', brl(t19), brl(tn), brl(tt)]])]

S += [PageBreak(), Paragraph('Detalhe — Família dentro de cada Fábrica', h2)]
for loc, _ in Lt.most_common():
    if loc == 'REVENDA': continue
    cab = Table([[Paragraph(f'<b><font color="#1A3A5C">{tit(loc)}</font></b>', body),
                  Paragraph(f'<para alignment="right"><font color="#475569">{brl(L19[loc])}</font> + <font color="#1D4ED8">{brl(Ln[loc])}</font> = <b><font color="#16794B">{brl(Lt[loc])}</font></b></para>', body)]],
                colWidths=[7.4 * cm, 10 * cm])
    fl = [[tit(k), brl(a), brl(b), brl(a + b)] for k, a, b in
          sorted(((f, soma(lambda x: x['fam'], '19')[f] if False else sum(x['v'] for x in L if x['loc'] == loc and x['fam'] == f and x['p'] == '19'),
                   sum(x['v'] for x in L if x['loc'] == loc and x['fam'] == f and x['p'] == 'n'))
                  for f in set(x['fam'] for x in L if x['loc'] == loc)), key=lambda t: -(t[1] + t[2]))]
    S += [cab, tabela([['Família', 'Dia 19', 'Novo', 'Total']] + fl, ultimo_escuro=False), Spacer(1, 4)]
S += [Spacer(1, 8), Paragraph(f'Dia 19 = relatório já apresentado (CONTROLE GERAL, sem alteração). Novo = PRODUÇÃO SETEMBRO (Pedido de Venda, NFs {nf(nfn[0])} a {nf(nfn[-1])}), mesmos critérios. '
                              f'Nenhuma nota repetida entre os dois. “Fabricado” = todos os Locais de Produção exceto Revenda.', small)]
doc.build(S)
print(SAIDA, round(t19, 2), round(tn, 2), round(tt, 2))
