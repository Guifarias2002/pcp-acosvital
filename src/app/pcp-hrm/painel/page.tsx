'use client';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { useRealtime } from '@/hooks/useRealtime';
import { api } from '@/lib/api';
import { NOMES, PRIORIDADE_COR, PROCESSO_CALDEIRARIA } from '@/lib/types';

interface PedidoPainel {
  id: number;
  numero: string;
  numero_op: string;
  cliente: string;
  prioridade: string;
  status: string;
  roteiro: string[];
  setores_atuais: string[];
  setor_atual: string;
  prazo_iso: string | null;
  previsao_iso: string | null;
  entrega_contratual_iso: string | null;
  numero_pedido_cliente: string | null;
}

// Hoje em BRT como 'AAAA-MM-DD' — compara direto com as datas ISO (texto).
const hojeBRT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
// Formata ISO 'AAAA-MM-DD' pra pt-BR sem new Date() (evita o -1 dia de fuso).
const fmtBR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

// Trilha do pedido: onde ele está no roteiro. `atuais` = setores com peça agora;
// `atualIdx` = 1ª posição ocupada (etapas antes já venceram). Espelha a lógica
// do detalhe do pedido (setores em produção + mínimo da posição).
function trilha(p: PedidoPainel) {
  const roteiro = p.roteiro || [];
  const base = p.setores_atuais.length ? p.setores_atuais : (p.setor_atual ? [p.setor_atual] : []);
  const atuais = new Set(base);
  const entregue = p.status === 'entregue';
  const posicoes = Array.from(atuais).map(s => roteiro.indexOf(s)).filter(i => i >= 0);
  const atualIdx = entregue
    ? roteiro.length
    : (posicoes.length ? Math.min(...posicoes) : Math.max(0, roteiro.indexOf(p.setor_atual)));
  return { roteiro, atuais, atualIdx, entregue };
}

// Ordena setores pela sequência da Caldeiraria (o resto vai pro fim, em ordem).
const posSetor = (cod: string) => {
  const i = PROCESSO_CALDEIRARIA.indexOf(cod);
  return i >= 0 ? i : 900 + cod.charCodeAt(0);
};

export default function PainelCaldeirariaPage() {
  const [pedidos, setPedidos] = useState<PedidoPainel[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [ultimaAtt, setUltimaAtt] = useState('');
  const [busca, setBusca] = useState('');
  const [entregues, setEntregues] = useState(false);
  const [filtroSetor, setFiltroSetor] = useState<string>('');

  const carregar = useCallback(() => {
    api.get(`/api/caldeiraria/painel${entregues ? '?entregues=1' : ''}`)
      .then(r => {
        setPedidos(r.data.pedidos || []);
        setErro('');
        setUltimaAtt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      })
      .catch(() => setErro('Não consegui carregar o painel. Tente atualizar.'))
      .finally(() => setLoading(false));
  }, [entregues]);

  useEffect(() => {
    setLoading(true);
    carregar();
    const t = setInterval(carregar, 30_000);
    return () => clearInterval(t);
  }, [carregar]);

  const carregarRef = useRef<() => void>(() => {});
  carregarRef.current = carregar;
  const carregarCallback = useCallback(() => carregarRef.current(), []);
  useRealtime(['producao_itemparcial', 'producao_itempedido', 'producao_movimentacaoitem', 'producao_pedido'], carregarCallback);

  // Distribuição por setor — quantas OPs têm peça em cada setor AGORA (uma OP
  // dividida conta em cada setor que ocupa). Vira filtro por clique.
  const distribuicao = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pedidos) {
      const { atuais } = trilha(p);
      const setores = atuais.size ? Array.from(atuais) : (p.setor_atual ? [p.setor_atual] : []);
      for (const s of setores) m.set(s, (m.get(s) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => posSetor(a[0]) - posSetor(b[0]));
  }, [pedidos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pedidos.filter(p => {
      if (filtroSetor) {
        const { atuais } = trilha(p);
        const setores = atuais.size ? atuais : new Set(p.setor_atual ? [p.setor_atual] : []);
        if (!setores.has(filtroSetor)) return false;
      }
      if (!q) return true;
      return [p.numero, p.numero_op, p.cliente, p.numero_pedido_cliente]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    });
  }, [pedidos, busca, filtroSetor]);

  const hoje = hojeBRT();

  return (
    <AuthGuard>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <i className="bi bi-signpost-split" style={{ color: '#1a3a5c' }} />
            Onde está cada OP — Caldeiraria
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {filtrados.length} de {pedidos.length} OP{pedidos.length !== 1 ? 's' : ''}
            {filtroSetor && <span className="ml-1">· em <b>{NOMES[filtroSetor] || filtroSetor}</b></span>}
            {ultimaAtt && <span className="ml-3 text-green-600">· ✓ atualizado às {ultimaAtt}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/kanban?fabrica=caldeiraria" className="btn btn-outline btn-sm">
            <i className="bi bi-kanban" /> Kanban
          </Link>
          <button onClick={() => { setLoading(true); carregar(); }} className="btn btn-outline btn-sm">
            <i className="bi bi-arrow-clockwise" /> Atualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <i className="bi bi-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13 }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por OP, cliente ou nº do pedido…"
            style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 6, padding: '7px 10px 7px 30px', fontSize: 13 }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#495057', cursor: 'pointer', fontWeight: 600 }}>
          <input type="checkbox" checked={entregues} onChange={e => setEntregues(e.target.checked)} />
          Mostrar entregues
        </label>
      </div>

      {/* Distribuição por setor — clique pra filtrar */}
      {distribuicao.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {filtroSetor && (
            <button onClick={() => setFiltroSetor('')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 20, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              <i className="bi bi-x-lg" style={{ fontSize: 11 }} /> Limpar filtro
            </button>
          )}
          {distribuicao.map(([cod, n]) => {
            const ativo = filtroSetor === cod;
            return (
              <button key={cod} onClick={() => setFiltroSetor(ativo ? '' : cod)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 20, padding: '5px 12px',
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer', transition: 'all .12s',
                  border: `1px solid ${ativo ? '#1a3a5c' : '#cfe0f2'}`,
                  background: ativo ? '#1a3a5c' : '#fff', color: ativo ? '#fff' : '#1a3a5c',
                }}>
                {NOMES[cod] || cod}
                <span style={{
                  minWidth: 18, height: 18, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, background: ativo ? '#fff' : '#eef4fb', color: '#1a3a5c',
                }}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {loading && <p className="text-gray-400 text-sm">Carregando…</p>}
      {erro && !loading && (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{erro}</div>
      )}

      {!loading && !erro && filtrados.length === 0 && (
        <div className="text-center py-16 text-gray-300">
          <i className="bi bi-inbox text-5xl" />
          <p className="mt-3 text-sm">Nenhuma OP da Caldeiraria {busca || filtroSetor ? 'com esse filtro' : 'em produção'}</p>
        </div>
      )}

      {/* Lista por OP com a trilha */}
      <div className="flex flex-col gap-2.5">
        {filtrados.map(p => {
          const { roteiro, atuais, atualIdx, entregue } = trilha(p);
          const setorAtualNome = entregue
            ? 'Entregue'
            : (Array.from(atuais).sort((a, b) => roteiro.indexOf(a) - roteiro.indexOf(b))
                .map(s => NOMES[s] || s).join(' · ') || (NOMES[p.setor_atual] || p.setor_atual || '—'));
          const prev = p.previsao_iso;
          const atrasado = !entregue && !!prev && prev < hoje;
          const totalEtapas = roteiro.length;
          const feitas = Math.min(atualIdx, totalEtapas);
          return (
            <Link key={p.id} href={`/pedidos/${p.id}`}
              className="block bg-white rounded-xl border shadow-sm p-4 hover:border-blue-300 hover:shadow transition-all">
              {/* Linha 1: identificação + situação */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-800">{p.numero}</span>
                    {p.numero_op && p.numero_op !== p.numero && (
                      <span className="text-xs text-gray-400">OP {p.numero_op}</span>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORIDADE_COR[p.prioridade] || PRIORIDADE_COR.normal}`}>
                      {p.prioridade?.charAt(0).toUpperCase() + p.prioridade?.slice(1)}
                    </span>
                    {p.numero_pedido_cliente && (
                      <span className="text-xs text-gray-400">· pedido cliente {p.numero_pedido_cliente}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate mt-0.5">{p.cliente}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Está em</div>
                  <div className={`text-sm font-bold ${entregue ? 'text-emerald-600' : 'text-orange-600'}`}>
                    {entregue && <i className="bi bi-check-circle-fill mr-1" />}{setorAtualNome}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{feitas}/{totalEtapas} etapas</div>
                </div>
              </div>

              {/* Trilha do roteiro */}
              <div className="flex items-center gap-1 flex-wrap mt-3">
                {roteiro.map((setor, i) => {
                  const done = i < atualIdx;
                  const current = atuais.has(setor);
                  return (
                    <span key={`${setor}-${i}`}
                      className={`text-xs px-2 py-1 rounded flex items-center gap-1 font-medium border ${current ? 'bg-orange-500 text-white border-orange-500' : done ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-400 border-gray-200'}`}>
                      {done && '✓ '}{NOMES[setor] || setor}
                    </span>
                  );
                })}
              </div>

              {/* Linha final: prazos */}
              <div className="flex items-center gap-x-5 gap-y-1 flex-wrap mt-3 text-xs">
                {p.previsao_iso ? (
                  <span className={atrasado ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                    <i className="bi bi-flag mr-1" />Conclusão {fmtBR(p.previsao_iso)}
                    {atrasado && ' · atrasado'}
                  </span>
                ) : (
                  <span className="text-gray-300"><i className="bi bi-flag mr-1" />Sem previsão de conclusão</span>
                )}
                {p.entrega_contratual_iso && (
                  <span className="text-gray-500"><i className="bi bi-calendar-check mr-1" />Contratual {fmtBR(p.entrega_contratual_iso)}</span>
                )}
                {p.prazo_iso && (
                  <span className="text-gray-400"><i className="bi bi-cash-coin mr-1" />Faturamento {fmtBR(p.prazo_iso)}</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </AuthGuard>
  );
}
