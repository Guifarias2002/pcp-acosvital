'use client';
import { useState } from 'react';
import { editarPedido } from '@/lib/api';
import { FABRICAS } from '@/lib/types';

interface LinhaComponente {
  codigo: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  fabrica: string;
}

const UNIDADES = ['un', 'kg', 'm', 'pc', 'jg', 'cx', 'lt'];

function linhaVazia(): LinhaComponente {
  return { codigo: '', descricao: '', quantidade: '1', unidade: 'un', fabrica: 'flange' };
}

// Monta a "receita" de um item composto (ex: um Tê de Redução = 3 flanges + 1
// tubo): cada linha vira um item novo de verdade, vinculado ao item pai via
// item_pai_id, seguindo o roteiro padrão completo da fábrica escolhida — sem
// bloqueio automático entre pai e filhos, é só rastreio visual (ver plano).
export default function MontarReceitaModal({ pedidoId, itemPaiId, itemPaiCodigo, onClose, onSucesso }: {
  pedidoId: number;
  itemPaiId: number;
  itemPaiCodigo: string;
  onClose: () => void;
  onSucesso: () => void;
}) {
  const [linhas, setLinhas] = useState<LinhaComponente[]>([linhaVazia()]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  function atualizarLinha(idx: number, campo: keyof LinhaComponente, valor: string) {
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, [campo]: valor } : l));
  }

  function adicionarLinha() {
    setLinhas(prev => [...prev, linhaVazia()]);
  }

  function removerLinha(idx: number) {
    setLinhas(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));
  }

  function erroMsg(e: unknown) {
    const ax = e as { response?: { data?: { erro?: string } } };
    return ax?.response?.data?.erro || 'Erro ao montar receita';
  }

  async function confirmar() {
    const validas = linhas.filter(l => l.codigo.trim());
    if (validas.length === 0) {
      setErro('Informe o código de pelo menos um componente.');
      return;
    }
    setErro('');
    setLoading(true);
    try {
      await editarPedido(pedidoId, {
        itens: validas.map(l => {
          const fabrica = FABRICAS.find(f => f.cod === l.fabrica) ?? FABRICAS[0];
          return {
            codigo: l.codigo.trim(),
            descricao: l.descricao.trim(),
            quantidade: Number(l.quantidade) || 1,
            unidade: l.unidade,
            roteiro_proprio: fabrica.setores,
            fabrica: fabrica.cod,
            item_pai_id: itemPaiId,
          };
        }),
      });
      onSucesso();
    } catch (e: unknown) {
      setErro(erroMsg(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 24, paddingBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <h5 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}>
              <i className="bi bi-puzzle" style={{ marginRight: 8, color: '#0d6efd' }} />
              Montar Receita
            </h5>
            <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={loading}>
              <i className="bi bi-x-lg" />
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
            Componentes que fazem parte de <strong>{itemPaiCodigo}</strong>. Cada um vira um item
            rastreado separadamente, seguindo o roteiro padrão da fábrica escolhida.
          </p>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {linhas.map((l, idx) => (
            <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, position: 'relative' }}>
              {linhas.length > 1 && (
                <button type="button" onClick={() => removerLinha(idx)} disabled={loading}
                  title="Remover componente"
                  style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14 }}>
                  <i className="bi bi-trash" />
                </button>
              )}
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                    Código <span style={{ color: '#dc3545' }}>*</span>
                  </label>
                  <input className="form-control" style={{ fontSize: 13, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                    value={l.codigo} onChange={e => atualizarLinha(idx, 'codigo', e.target.value)} disabled={loading} placeholder="Ex: FLANGE-4POL" />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Descrição</label>
                  <input className="form-control" style={{ fontSize: 13, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                    value={l.descricao} onChange={e => atualizarLinha(idx, 'descricao', e.target.value)} disabled={loading} placeholder="Ex: Flange liso 4 polegadas" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Quantidade</label>
                  <input type="number" min={1} className="form-control" style={{ fontSize: 13, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                    value={l.quantidade} onChange={e => atualizarLinha(idx, 'quantidade', e.target.value)} disabled={loading} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Unidade</label>
                  <select className="form-control" style={{ fontSize: 13, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                    value={l.unidade} onChange={e => atualizarLinha(idx, 'unidade', e.target.value)} disabled={loading}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Fábrica / Roteiro</label>
                  <select className="form-control" style={{ fontSize: 13, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                    value={l.fabrica} onChange={e => atualizarLinha(idx, 'fabrica', e.target.value)} disabled={loading}>
                    {FABRICAS.map(f => <option key={f.cod} value={f.cod}>{f.nome}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}

          <button type="button" onClick={adicionarLinha} disabled={loading}
            style={{ alignSelf: 'flex-start', background: '#eff6ff', color: '#1d4ed8', border: '1px dashed #93c5fd', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <i className="bi bi-plus-lg" style={{ marginRight: 6 }} />Adicionar componente
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {erro && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 14 }}>
              <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />{erro}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose} disabled={loading}>Cancelar</button>
            <button className="btn" style={{ flex: 2, background: '#0d6efd', color: '#fff', border: 'none' }} onClick={confirmar} disabled={loading}>
              {loading ? <><i className="bi bi-hourglass-split" /> Montando...</> : <><i className="bi bi-puzzle" /> Montar Receita</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
