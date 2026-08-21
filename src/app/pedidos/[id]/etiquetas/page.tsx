'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { getToken, podeVerCliente } from '@/lib/auth';

// Etiqueta de chão de fábrica — UMA por pedido, 98 x 27 mm (2,7 x 9,8 cm),
// pensada pra DYMO LabelWriter 450 (térmica preto-e-branco). Abre já chamando
// a impressão. O status é colorido na tela e distinto em P&B (claro / hachurado
// / preenchido). Esconde o cliente pros líderes configurados (podeVerCliente).
// Ver memória project_etiqueta_chao_fabrica.

interface Item { status?: string; fabrica?: string; descricao?: string; codigo?: string }
interface Pedido {
  numero_pedido_venda?: string; numero_op?: string; cliente?: string;
  prazo_entrega?: string; prioridade?: string; status?: string;
  atrasado?: boolean; dias_prazo?: number; envolve_caldeiraria?: boolean;
  itens?: Item[];
}

function statusGeral(p: Pedido): { key: string; word: string; ico: string; sub: string } {
  const itens = p.itens || [];
  if (p.status === 'entregue' || (itens.length > 0 && itens.every(i => i.status === 'entregue')))
    return { key: 'pronto', word: 'PRONTO', ico: '✅', sub: 'concluído' };
  const emProc = itens.some(i => i.status && !['aguardando', 'entregue'].includes(i.status));
  if (emProc) return { key: 'processo', word: 'EM PROCESSO', ico: '⚙️', sub: 'em produção' };
  return { key: 'aguardar', word: 'AGUARDAR', ico: '⏳', sub: 'na fila' };
}

const CSS = `
  @page { size: 98mm 27mm; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .et { width: 98mm; height: 27mm; display: flex; background: #fff; color: #000; overflow: hidden;
        font-family: Arial, Helvetica, sans-serif; }
  .et .st { width: 27mm; flex: none; display: flex; flex-direction: column; align-items: center;
            justify-content: center; gap: .5mm; padding: 1mm; text-align: center; }
  .et.aguardar .st { background: #e2e8f0; color: #1f2937; }
  .et.processo .st { background: #f59e0b; color: #3d2600;
                     background-image: repeating-linear-gradient(45deg, rgba(0,0,0,.18) 0 1.1mm, transparent 1.1mm 2.6mm); }
  .et.pronto .st { background: #15803d; color: #fff; }
  .et .st .ico { font-size: 5.5mm; line-height: 1; }
  .et .st .w { font-size: 3.9mm; font-weight: 900; line-height: 1; letter-spacing: -.01em; }
  .et .st .nx { font-size: 2.05mm; font-weight: 700; line-height: 1.05; text-transform: uppercase; opacity: .9; }
  .et .bd { flex: 1; min-width: 0; padding: 1.5mm 3mm; display: flex; flex-direction: column;
            justify-content: center; gap: 1mm; }
  .et .l1 { display: flex; align-items: center; gap: 2mm; line-height: 1; }
  .et .l1 .pv { font-size: 5.2mm; font-weight: 900; letter-spacing: -.02em; }
  .et .l1 .pv small { font-size: 2.4mm; font-weight: 800; color: #666; margin-right: .8mm; }
  .et .chip { font-size: 2.3mm; font-weight: 900; color: #fff; background: #dc2626; padding: .4mm 1.6mm;
              border-radius: 1mm; text-transform: uppercase; letter-spacing: .03em; }
  .et .l2 { font-size: 2.9mm; font-weight: 700; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .et .l2 b { color: #000; font-weight: 900; }
  .et .l3 { font-size: 2.9mm; font-weight: 700; color: #333; display: flex; gap: 3mm; white-space: nowrap;
            overflow: hidden; text-overflow: ellipsis; }
  .et .l3 .atraso { color: #dc2626; font-weight: 900; }
  @media screen { body { background: #e5e5e5; padding: 24px; } .et { box-shadow: 0 8px 24px rgba(0,0,0,.25); } }
`;

export default function EtiquetaPedidoPage() {
  const { id } = useParams<{ id: string }>();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState('');
  const impressoRef = useRef(false);

  useEffect(() => {
    fetch(`/api/pedidos/${id}`, { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(r => r.json())
      .then(d => {
        if (d.erro) setErro(d.erro);
        else {
          setPedido(d);
          document.title = `Etiqueta_${d.numero_pedido_venda || id}`;
        }
      })
      .catch(() => setErro('Falha ao carregar o pedido.'));
  }, [id]);

  // Dispara a impressão uma vez, depois que a etiqueta renderizou.
  useEffect(() => {
    if (pedido && !impressoRef.current) {
      impressoRef.current = true;
      const t = setTimeout(() => window.print(), 350);
      return () => clearTimeout(t);
    }
  }, [pedido]);

  if (erro) return <div style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>{erro}</div>;
  if (!pedido) return <div style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>Carregando etiqueta…</div>;

  const st = statusGeral(pedido);
  const itens = pedido.itens || [];
  const verCliente = podeVerCliente();
  const fabrica = pedido.envolve_caldeiraria ? 'Caldeiraria' : 'Flanges';
  const desc = itens[0]?.descricao || itens[0]?.codigo || '';
  const maisItens = itens.length > 1 ? ` (+${itens.length - 1})` : '';
  const prio = (pedido.prioridade || '').toLowerCase();
  const chip = prio === 'urgente' ? 'Urgente' : prio === 'alta' ? 'Alta' : '';
  const prazoTxt = pedido.atrasado
    ? `Atrasado ${Math.abs(pedido.dias_prazo || 0)}d`
    : `Prazo ${pedido.prazo_entrega || '—'}`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className={`et ${st.key}`}>
        <div className="st">
          <span className="ico">{st.ico}</span>
          <span className="w">{st.word}</span>
          <span className="nx">{st.sub}</span>
        </div>
        <div className="bd">
          <div className="l1">
            <span className="pv"><small>PV</small>{pedido.numero_pedido_venda || '—'}</span>
            {chip && <span className="chip">{chip}</span>}
          </div>
          <div className="l2">
            OP <b>{pedido.numero_op || '—'}</b> · {itens.length} {itens.length === 1 ? 'item' : 'itens'} · {fabrica}
            {desc ? ` · ${desc}${maisItens}` : ''}
          </div>
          <div className="l3">
            {verCliente && pedido.cliente && <span>👤 {pedido.cliente}</span>}
            <span className={pedido.atrasado ? 'atraso' : ''}>⏰ {prazoTxt}</span>
          </div>
        </div>
      </div>
    </>
  );
}
