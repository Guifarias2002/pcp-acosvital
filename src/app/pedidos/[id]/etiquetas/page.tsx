'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getToken } from '@/lib/auth';

// Etiqueta de chão de fábrica — UMA por pedido, 98 x 27 mm (2,7 x 9,8 cm),
// pensada pra DYMO LabelWriter 450 (térmica preto-e-branco). Ao abrir, o
// operador escolhe a SITUAÇÃO (a cor da etiqueta segue a escolha) e digita
// quantas PEÇAS estão no PALLET; então imprime. Status colorido na tela e
// distinto em P&B (claro / hachurado / preenchido). Etiqueta enxuta: só
// SITUAÇÃO · PV · OP · Quantidade · Pallet. Ver memória project_etiqueta_chao_fabrica.

interface Item { status?: string; fabrica?: string; descricao?: string; codigo?: string; quantidade?: string; unidade?: string }
interface Pedido {
  numero_pedido_venda?: string; numero_op?: string; cliente?: string;
  prazo_entrega?: string; prioridade?: string; status?: string;
  atrasado?: boolean; dias_prazo?: number; envolve_caldeiraria?: boolean;
  itens?: Item[];
}

const SITU = [
  { key: 'aguardar', word: 'NA FILA', ico: '⏳' },
  { key: 'processo', word: 'EM PROCESSO', ico: '⚙️' },
  { key: 'pronto', word: 'PRONTO', ico: '✅' },
] as const;

// Situação sugerida a partir dos itens (o operador pode trocar).
function situacaoSugerida(p: Pedido): string {
  const itens = p.itens || [];
  if (p.status === 'entregue' || (itens.length > 0 && itens.every(i => i.status === 'entregue'))) return 'pronto';
  if (itens.some(i => i.status && !['aguardando', 'entregue'].includes(i.status))) return 'processo';
  return 'aguardar';
}

function fmtQt(q?: string) {
  const n = Number(q);
  if (isNaN(n)) return q || '';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

const CSS = `
  @page { size: 98mm 27mm; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #e5e5e5; font-family: Arial, Helvetica, sans-serif; }
  .toolbar { padding: 16px 18px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
             background: #fff; border-bottom: 1px solid #ddd; }
  .toolbar .grp { display: flex; align-items: center; gap: 8px; }
  .toolbar label { font-size: 13px; font-weight: 800; color: #1a3a5c; }
  .toolbar .situ { display: flex; gap: 6px; }
  .toolbar .situ button { border: 2px solid #cbd5e1; background: #fff; color: #334155; border-radius: 8px;
                          padding: 6px 12px; font-size: 12px; font-weight: 800; cursor: pointer; }
  .toolbar .situ button.on.aguardar { border-color: #475569; background: #e2e8f0; color: #1f2937; }
  .toolbar .situ button.on.processo { border-color: #b45309; background: #fde3b3; color: #7c3d00; }
  .toolbar .situ button.on.pronto { border-color: #15803d; background: #dcfce7; color: #14532d; }
  .toolbar input[type=number] { font-family: monospace; font-weight: 700; font-size: 15px; width: 90px;
                                text-align: center; border: 2px solid #b45309; border-radius: 8px; padding: 6px 8px; }
  .toolbar .print { background: #0d6efd; color: #fff; border: none; border-radius: 8px; padding: 9px 18px;
                    font-size: 14px; font-weight: 800; cursor: pointer; }
  .stage { display: flex; justify-content: center; padding: 28px 16px; }

  .lp { width: 98mm; height: 27mm; display: flex; background: #fff; color: #000; overflow: hidden;
        border-radius: 1.5mm; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
  .lp .st { width: 26mm; flex: none; display: flex; flex-direction: column; align-items: center;
            justify-content: center; gap: .4mm; padding: 1mm; text-align: center; }
  .lp.aguardar .st { background: #e2e8f0; color: #1f2937; }
  .lp.processo .st { background: #f59e0b; color: #3d2600;
                     background-image: repeating-linear-gradient(45deg, rgba(0,0,0,.18) 0 1.1mm, transparent 1.1mm 2.6mm); }
  .lp.pronto .st { background: #15803d; color: #fff; }
  .lp .st .ico { font-size: 5mm; line-height: 1; }
  .lp .st .w { font-size: 3.6mm; font-weight: 900; line-height: 1; letter-spacing: -.01em; }
  .lp .bd { flex: 1; min-width: 0; padding: 1.3mm 2.6mm; display: flex; flex-direction: column; justify-content: center; gap: .7mm; }
  .lp .l1 { display: flex; align-items: center; gap: 1.8mm; line-height: 1; }
  .lp .l1 .pv { font-size: 4.3mm; font-weight: 900; letter-spacing: -.02em; }
  .lp .l1 .pv small { font-size: 2.1mm; font-weight: 800; color: #666; margin-right: .6mm; }
  .lp .l1 .op { font-size: 2.4mm; font-weight: 700; color: #555; }
  .lp .l1 .op b { color: #000; font-weight: 900; }
  .lp .l4 { display: flex; align-items: center; gap: 3mm; font-size: 2.6mm; font-weight: 700; color: #333; margin-top: .4mm; }
  .lp .pallet, .lp .qt { font-weight: 900; color: #000; border: 1.4px solid #000; border-radius: 1mm; padding: .3mm 1.6mm; font-size: 3mm; }
  .lp .pallet b, .lp .qt b { font-size: 3.4mm; }

  @media print {
    html, body { background: #fff; }
    .no-print { display: none !important; }
    .stage { padding: 0; }
    .lp { box-shadow: none; border-radius: 0; height: 26.6mm; }
  }
`;

export default function EtiquetaPedidoPage() {
  const { id } = useParams<{ id: string }>();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState('');
  const [situacao, setSituacao] = useState<string>('processo');
  const [pallet, setPallet] = useState<string>('');

  useEffect(() => {
    fetch(`/api/pedidos/${id}`, { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(r => r.json())
      .then(d => {
        if (d.erro) { setErro(d.erro); return; }
        setPedido(d);
        document.title = `Etiqueta_${d.numero_pedido_venda || id}`;
        setSituacao(situacaoSugerida(d));
        const total = (d.itens || []).reduce((s: number, i: Item) => s + (Number(i.quantidade) || 0), 0);
        if (total > 0) setPallet(String(total));
      })
      .catch(() => setErro('Falha ao carregar o pedido.'));
  }, [id]);

  const itens = useMemo(() => pedido?.itens || [], [pedido]);

  if (erro) return <div style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>{erro}</div>;
  if (!pedido) return <div style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>Carregando etiqueta…</div>;

  const situ = SITU.find(s => s.key === situacao) || SITU[1];
  const qtdTotal = itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="toolbar no-print">
        <div className="grp">
          <label>Situação:</label>
          <div className="situ">
            {SITU.map(s => (
              <button key={s.key} className={`${s.key} ${situacao === s.key ? 'on' : ''}`} onClick={() => setSituacao(s.key)}>
                {s.ico} {s.word}
              </button>
            ))}
          </div>
        </div>
        <div className="grp">
          <label>📦 Peças no pallet:</label>
          <input type="number" min={0} value={pallet} onChange={e => setPallet(e.target.value)} />
        </div>
        <button className="print" onClick={() => window.print()}>🖨️ Imprimir etiqueta</button>
      </div>

      <div className="stage">
        <div className={`lp ${situ.key}`}>
          <div className="st">
            <span className="ico">{situ.ico}</span>
            <span className="w">{situ.word}</span>
          </div>
          <div className="bd">
            <div className="l1">
              <span className="pv"><small>PV</small>{pedido.numero_pedido_venda || '—'}</span>
              <span className="op">OP <b>{pedido.numero_op || '—'}</b></span>
            </div>
            <div className="l4">
              <span className="qt">Qtde <b>{qtdTotal ? `${fmtQt(String(qtdTotal))} pç` : '—'}</b></span>
              <span className="pallet">📦 PALLET <b>{pallet ? `${pallet} pç` : '—'}</b></span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
