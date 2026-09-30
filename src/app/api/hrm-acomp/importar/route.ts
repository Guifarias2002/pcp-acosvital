import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { podeEditarAcompHrm } from '@/lib/auth';
import { isoValida } from '@/lib/caldPlano';
import {
  CAMPOS_EDITAVEIS_HRM, CAMPOS_SO_SE_VAZIO_HRM, CODIGOS_ETAPA_HRM, NOME_CAMPO_HRM, mapearSituacao, txtHrm, type EtapaHrm,
} from '@/lib/hrmAcomp';
import { registrarHistHrm } from '@/lib/hrmAcompServer';
import { runMigrations } from '@/lib/migrations';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Subir a planilha do Alan. O navegador lê o .xlsx e manda as linhas já
// separadas por campo (ver acompanhamento/importar.ts).
// modo 'previa' → só calcula o que vai mudar (nada é gravado).
// modo 'gravar' → aplica. Regras (combinadas com o usuário, 30/09):
//  • linha nova → cria a linha no acompanhamento (não cria OP em produção);
//  • linha que sumiu da planilha → NÃO apaga nada;
//  • célula vazia → NÃO apaga o que o sistema tem;
//  • PO+item / vendedor / destino e identificação → só preenche se vazio;
//  • expedite / ocorrência mudou → novo registro datado no histórico;
//  • etapa com "ok" → marca (origem planilha); nunca desmarca;
//  • a linha original inteira fica em planilha_raw.

const IDENT = ['op_hrm', 'item', 'pedido_omie', 'ns', 'material', 'descricao', 'quantidade'] as const;
const HISTO = ['expedite', 'ocorrencia'] as const;

interface LinhaIn { chave: string; ordem: number; campos: Record<string, unknown>; etapas: string[]; raw: Record<string, unknown> }
interface ExtraIn { tipo: 'reprogramacao' | 'reuniao'; po: string; item: string; texto: string; material?: string | null; descricao?: string | null }
interface Mudanca { campo: string; nome: string; antes: string | null; depois: string | null }

const str = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v));
function valorCampo(campo: string, v: unknown): string | null {
  const tipo = CAMPOS_EDITAVEIS_HRM[campo];
  return tipo === 'd' ? isoValida(v) : txtHrm(v);
}

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!podeEditarAcompHrm(user)) return NextResponse.json({ erro: 'Somente o PCP HRM pode subir a planilha' }, { status: 403 });
  const quem = user.nome || user.username;

  let body: { modo?: string; linhas?: LinhaIn[]; extras?: ExtraIn[] };
  try { body = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }
  const gravar = body.modo === 'gravar';
  const linhas = Array.isArray(body.linhas) ? body.linhas.filter(l => l && typeof l.chave === 'string' && l.chave) : [];
  const extras = Array.isArray(body.extras) ? body.extras : [];
  if (!linhas.length) return NextResponse.json({ erro: 'Nenhuma linha encontrada na planilha' }, { status: 400 });
  if (linhas.length > 3000) return NextResponse.json({ erro: 'Planilha grande demais (máx. 3000 linhas)' }, { status: 400 });

  await runMigrations();

  try {
    const resumo = await sql.begin(async (tx) => {
      const existentes = await tx`SELECT * FROM producao_hrm_acomp WHERE chave = ANY(${linhas.map(l => l.chave)})`;
      const porChave = new Map(existentes.map(r => [r.chave as string, r]));
      const novos: { chave: string; rotulo: string }[] = [];
      const alterados: { chave: string; rotulo: string; mudancas: Mudanca[] }[] = [];
      let iguais = 0;
      const idPorChave = new Map<string, number>();

      for (const l of linhas) {
        const c = l.campos || {};
        const rotulo = [c.op_hrm ? `OP ${c.op_hrm}` : c.pedido_omie ? `Pedido ${c.pedido_omie}` : '', c.item ? `item ${c.item}` : '', txtHrm(c.material, 60) || '']
          .filter(Boolean).join(' · ');
        const etapasPlan: Record<string, EtapaHrm> = {};
        for (const e of l.etapas || []) if (CODIGOS_ETAPA_HRM.includes(e)) etapasPlan[e] = { ok: true, origem: 'planilha' };
        const detalhe = txtHrm(c.situacao_detalhe);
        const atual = porChave.get(l.chave);

        if (!atual) {
          novos.push({ chave: l.chave, rotulo });
          if (!gravar) continue;
          const v: Record<string, string | null> = {};
          for (const k of IDENT) v[k] = txtHrm(c[k], 500);
          for (const k of Object.keys(CAMPOS_EDITAVEIS_HRM)) v[k] = valorCampo(k, c[k]);
          for (const k of HISTO) v[k] = txtHrm(c[k]);
          v.situacao = mapearSituacao(detalhe) || null;
          const [row] = await tx`
            INSERT INTO producao_hrm_acomp ${tx({
              chave: l.chave, ...v, etapas: tx.json(etapasPlan as never) as never, planilha_raw: tx.json((l.raw || {}) as never) as never,
              ordem_planilha: Number.isFinite(l.ordem) ? l.ordem : null, atualizado_por_nome: quem,
            } as never)}
            RETURNING id`;
          idPorChave.set(l.chave, row.id as number);
          await registrarHistHrm(tx, row.id as number, { tipo: 'importacao', texto: 'Linha importada da planilha', origem: 'planilha', usuario: quem });
          for (const k of HISTO) if (v[k]) await registrarHistHrm(tx, row.id as number, { tipo: k, texto: v[k], origem: 'planilha', usuario: quem });
          continue;
        }

        idPorChave.set(l.chave, atual.id as number);
        const mud: Mudanca[] = [];
        const set: Record<string, string | null> = {};
        // Identificação: só completa o que estiver vazio.
        for (const k of IDENT) {
          const nv = txtHrm(c[k], 500);
          if (nv && !atual[k]) { set[k] = nv; mud.push({ campo: k, nome: NOME_CAMPO_HRM[k] || k, antes: null, depois: nv }); }
        }
        for (const k of Object.keys(CAMPOS_EDITAVEIS_HRM)) {
          if (k === 'situacao') continue;
          const nv = valorCampo(k, c[k]);
          if (nv == null) continue;                               // vazio não apaga
          const av = str(atual[k]);
          if (CAMPOS_SO_SE_VAZIO_HRM.has(k) && av) continue;      // identificação: não sobrescreve
          if (av !== nv) { set[k] = nv; mud.push({ campo: k, nome: NOME_CAMPO_HRM[k] || k, antes: av, depois: nv }); }
        }
        if (set.situacao_detalhe) {
          const sit = mapearSituacao(set.situacao_detalhe);
          if (sit && sit !== atual.situacao) { set.situacao = sit; mud.push({ campo: 'situacao', nome: 'Situação', antes: str(atual.situacao), depois: sit }); }
        }
        const histNovos: { tipo: string; texto: string }[] = [];
        for (const k of HISTO) {
          const nv = txtHrm(c[k]);
          if (nv && nv !== atual[k]) { set[k] = nv; histNovos.push({ tipo: k, texto: nv }); mud.push({ campo: k, nome: NOME_CAMPO_HRM[k], antes: str(atual[k]), depois: nv }); }
        }
        const etAtual = { ...(atual.etapas || {}) } as Record<string, EtapaHrm>;
        let etMudou = false;
        for (const [k, e] of Object.entries(etapasPlan)) {
          if (!etAtual[k]?.ok) { etAtual[k] = e; etMudou = true; mud.push({ campo: `etapa:${k}`, nome: `Etapa ${k}`, antes: null, depois: 'ok' }); }
        }

        if (!mud.length) { iguais++; }
        else alterados.push({ chave: l.chave, rotulo, mudancas: mud });
        if (!gravar) continue;

        const upd: Record<string, unknown> = { ...set, planilha_raw: tx.json((l.raw || {}) as never), atualizado_em: new Date(), ordem_planilha: Number.isFinite(l.ordem) ? l.ordem : atual.ordem_planilha };
        if (etMudou) upd.etapas = tx.json(etAtual as never);
        if (mud.length) upd.atualizado_por_nome = quem;
        await tx`UPDATE producao_hrm_acomp SET ${tx(upd as never, ...Object.keys(upd))} WHERE id = ${atual.id}`;
        for (const m of mud) {
          if ((HISTO as readonly string[]).includes(m.campo)) continue;
          await registrarHistHrm(tx, atual.id as number, { tipo: 'alteracao', campo: m.campo, antes: m.antes, depois: m.depois, origem: 'planilha', usuario: quem,
            texto: `${m.nome}: ${m.antes ?? '—'} → ${m.depois ?? '—'}` });
        }
        for (const h of histNovos) await registrarHistHrm(tx, atual.id as number, { tipo: h.tipo, texto: h.texto, origem: 'planilha', usuario: quem });
      }

      // Abas de reprogramação (Planilha2) e reunião (Planilha1): viram registros
      // no histórico da linha do mesmo PO + item. Texto igual já registrado = pula.
      // PO/item que só existe nas abas extras (não está na aba principal) → vira
      // uma linha própria (nada se perde), marcada no detalhe da situação.
      let extrasNovos = 0; const extrasSemLinha: string[] = []; const itensSoExtras: { chave: string; rotulo: string }[] = [];
      if (extras.length) {
        const todas: { id: number | null; po_item: unknown; pedido_omie: unknown }[] =
          (await tx`SELECT id, po_item, pedido_omie FROM producao_hrm_acomp`).map(r => ({ id: r.id as number, po_item: r.po_item, pedido_omie: r.pedido_omie }));
        // Na PRÉVIA as linhas novas ainda não estão no banco (no gravar já foram
        // inseridas acima, nesta mesma transação) → casa também com elas.
        if (!gravar) for (const l of linhas) if (!porChave.has(l.chave)) todas.push({ id: null, po_item: txtHrm(l.campos?.po_item), pedido_omie: txtHrm(l.campos?.pedido_omie) });
        for (const x of extras.slice(0, 2000)) {
          const alvo = `${String(x.po).trim()}-${String(x.item).trim()}`;
          const texto = txtHrm(x.texto);
          if (!texto || !['reprogramacao', 'reuniao'].includes(x.tipo)) continue;
          let linha = todas.find(r => r.pedido_omie === alvo || (typeof r.po_item === 'string' && (r.po_item === alvo || r.po_item.startsWith(alvo + '-'))));
          if (!linha) {
            const chave = `po:${alvo.toUpperCase()}`;
            const material = txtHrm(x.material, 200), descricao = txtHrm(x.descricao, 500);
            itensSoExtras.push({ chave, rotulo: [`PO ${alvo}`, material, descricao].filter(Boolean).join(' · ') });
            let id: number | null = null;
            if (gravar) {
              const [row] = await tx`
                INSERT INTO producao_hrm_acomp (chave, pedido_omie, item, material, descricao, situacao_detalhe, atualizado_por_nome)
                VALUES (${chave}, ${alvo}, ${String(x.item).trim()}, ${material}, ${descricao}, 'Só nas abas de reprogramação/reunião da planilha', ${quem})
                ON CONFLICT (chave) DO UPDATE SET atualizado_em = NOW()
                RETURNING id`;
              id = row.id as number;
              await registrarHistHrm(tx, id, { tipo: 'importacao', texto: 'Item criado a partir das abas de reprogramação/reunião (não está na aba principal)', origem: 'planilha', usuario: quem });
            }
            linha = { id, po_item: null, pedido_omie: alvo };
            todas.push(linha);
          }
          if (linha.id != null) {
            const [ja] = await tx`SELECT 1 FROM producao_hrm_acomp_hist WHERE acomp_id = ${linha.id} AND tipo = ${x.tipo} AND texto = ${texto} LIMIT 1`;
            if (ja) continue;
          }
          extrasNovos++;
          if (gravar) await registrarHistHrm(tx, linha.id as number, { tipo: x.tipo, texto, origem: 'planilha', usuario: quem });
        }
      }

      const r = { novos, alterados: alterados.slice(0, 1000), total_alterados: alterados.length, iguais, total: linhas.length, extras_novos: extrasNovos, extras_sem_linha: extrasSemLinha.slice(0, 200), itens_so_extras: itensSoExtras.filter((v, i, a) => a.findIndex(z => z.chave === v.chave) === i) };
      // Prévia: desfaz tudo que a transação possa ter tocado (não grava nada).
      if (!gravar) throw Object.assign(new Error('previa'), { previa: r });
      return r;
    }).catch(e => { if ((e as { previa?: unknown }).previa) return (e as { previa: unknown }).previa; throw e; });
    return NextResponse.json({ ok: true, gravado: gravar, ...(resumo as object) });
  } catch (e) {
    console.error('[hrm-acomp importar]', e);
    return NextResponse.json({ erro: 'Erro ao processar a planilha' }, { status: 500 });
  }
}
