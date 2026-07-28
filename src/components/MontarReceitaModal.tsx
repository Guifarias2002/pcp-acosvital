'use client';
import { useState } from 'react';
import { editarPedido } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { FABRICAS } from '@/lib/types';

interface Anexo { id: number; tipo: string; nome_arquivo: string; }
interface Componente {
  id: number;
  codigo: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  fabrica: string;
  anexos: Anexo[];
}

const UNIDADES = ['un', 'kg', 'm', 'pc', 'jg', 'cx', 'lt'];
const TIPOS_ANEXO: { val: string; label: string }[] = [
  { val: 'desenho', label: 'Desenho técnico' },
  { val: 'op', label: 'Ordem de Produção' },
  { val: 'outro', label: 'Outro arquivo' },
];

// Monta a "receita" de um item composto (ex: um Tê de Redução = 3 flanges + 1
// tubo) um componente de cada vez: cada "Adicionar" já salva o componente como
// item de verdade (vinculado ao pai via item_pai_id) e libera anexar arquivos
// nele na hora (desenho, OP, outro) — sem bloqueio automático entre pai e
// filhos, é só rastreio (ver plano/memória do projeto).
export default function MontarReceitaModal({ pedidoId, itemPaiId, itemPaiCodigo, onClose, onSucesso }: {
  pedidoId: number;
  itemPaiId: number;
  itemPaiCodigo: string;
  onClose: () => void;
  onSucesso: () => void;
}) {
  const [componentes, setComponentes] = useState<Componente[]>([]);
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [unidade, setUnidade] = useState('un');
  const [fabrica, setFabrica] = useState('flange');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [tipoAnexo, setTipoAnexo] = useState<Record<number, string>>({});
  const [enviandoAnexo, setEnviandoAnexo] = useState<number | null>(null);

  function erroMsg(e: unknown) {
    const ax = e as { response?: { data?: { erro?: string } } };
    return ax?.response?.data?.erro || 'Erro ao salvar componente';
  }

  async function adicionarComponente() {
    if (!codigo.trim()) { setErro('Informe o código do componente.'); return; }
    setErro('');
    setSalvando(true);
    try {
      const fab = FABRICAS.find(f => f.cod === fabrica) ?? FABRICAS[0];
      const idsConhecidos = new Set(componentes.map(c => c.id));
      const pedidoAtualizado = await editarPedido(pedidoId, {
        itens: [{
          codigo: codigo.trim(),
          descricao: descricao.trim(),
          quantidade: Number(quantidade) || 1,
          unidade,
          roteiro_proprio: fab.setores,
          fabrica: fab.cod,
          item_pai_id: itemPaiId,
        }],
      });
      const itensDoPai = (pedidoAtualizado.itens || []).filter((i: { item_pai_id?: number | null }) => i.item_pai_id === itemPaiId);
      const novo = itensDoPai.find((i: { id: number }) => !idsConhecidos.has(i.id));
      if (!novo) { setErro('Componente salvo, mas não encontrado na resposta — atualize a tela.'); return; }
      setComponentes(prev => [...prev, {
        id: novo.id, codigo: novo.codigo, descricao: novo.descricao,
        quantidade: novo.quantidade, unidade: novo.unidade, fabrica: novo.fabrica || fab.cod,
        anexos: [],
      }]);
      setCodigo(''); setDescricao(''); setQuantidade('1'); setUnidade('un');
    } catch (e: unknown) {
      setErro(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  }

  async function anexarArquivo(componenteId: number, arquivo: File) {
    setEnviandoAnexo(componenteId);
    try {
      const token = getToken();
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      fd.append('tipo', tipoAnexo[componenteId] || 'desenho');
      const res = await fetch(`/api/item/${componenteId}/anexo`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (data.ok) {
        setComponentes(prev => prev.map(c => c.id === componenteId ? { ...c, anexos: [...c.anexos, data.anexo] } : c));
      } else {
        setErro(data.erro || 'Erro ao anexar arquivo');
      }
    } catch {
      setErro('Erro ao anexar arquivo');
    } finally {
      setEnviandoAnexo(null);
    }
  }

  async function removerAnexo(componenteId: number, anexoId: number) {
    const token = getToken();
    await fetch(`/api/item/${componenteId}/anexo`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ anexoId }),
    });
    setComponentes(prev => prev.map(c => c.id === componenteId ? { ...c, anexos: c.anexos.filter(a => a.id !== anexoId) } : c));
  }

  function fechar() {
    if (componentes.length > 0) onSucesso();
    else onClose();
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
            <button className="btn btn-ghost btn-sm" onClick={fechar} disabled={salvando}>
              <i className="bi bi-x-lg" />
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
            Componentes que fazem parte de <strong>{itemPaiCodigo}</strong>. Cada um vira um item
            rastreado na hora — pode anexar desenho, OP ou outro arquivo assim que salvar.
          </p>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Componentes já criados */}
          {componentes.map(c => (
            <div key={c.id} style={{ border: '1px solid #c7d2fe', background: '#eef2ff', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#1a3a5c' }}>{c.codigo}</span>
                  {c.descricao && <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>{c.descricao}</span>}
                </div>
                <span style={{ fontSize: 11, color: '#4338ca', fontWeight: 700 }}>
                  <i className="bi bi-check-circle-fill" style={{ marginRight: 4 }} />Salvo
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>{c.quantidade} {c.unidade} · {FABRICAS.find(f => f.cod === c.fabrica)?.nome || c.fabrica}</div>

              {c.anexos.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {c.anexos.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #e0e7ff', borderRadius: 6, padding: '5px 10px' }}>
                      <a href={`/api/item/${c.id}/anexo?anexoId=${a.id}&token=${getToken()}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#1d4ed8', textDecoration: 'none' }}>
                        <i className="bi bi-paperclip" style={{ marginRight: 5 }} />
                        {TIPOS_ANEXO.find(t => t.val === a.tipo)?.label || a.tipo}: {a.nome_arquivo}
                      </a>
                      <button type="button" onClick={() => removerAnexo(c.id, a.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>
                        <i className="bi bi-trash" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={tipoAnexo[c.id] || 'desenho'} onChange={e => setTipoAnexo(prev => ({ ...prev, [c.id]: e.target.value }))}
                  style={{ fontSize: 11, padding: '5px 6px', border: '1px solid #c7d2fe', borderRadius: 5 }}>
                  {TIPOS_ANEXO.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}
                </select>
                <label style={{ fontSize: 11, color: '#4338ca', border: '1px dashed #a5b4fc', borderRadius: 5, padding: '5px 10px', cursor: 'pointer' }}>
                  {enviandoAnexo === c.id ? '⏳ Enviando...' : <><i className="bi bi-paperclip" /> Anexar arquivo</>}
                  <input type="file" style={{ display: 'none' }} disabled={enviandoAnexo === c.id}
                    onChange={e => { const f = e.target.files?.[0]; if (f) anexarArquivo(c.id, f); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          ))}

          {/* Formulário do próximo componente */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>
              Novo componente
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                  Código <span style={{ color: '#dc3545' }}>*</span>
                </label>
                <input className="form-control" style={{ fontSize: 13, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                  value={codigo} onChange={e => setCodigo(e.target.value)} disabled={salvando} placeholder="Ex: FLANGE-4POL" />
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Descrição</label>
                <input className="form-control" style={{ fontSize: 13, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                  value={descricao} onChange={e => setDescricao(e.target.value)} disabled={salvando} placeholder="Ex: Flange liso 4 polegadas" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Quantidade</label>
                <input type="number" min={1} className="form-control" style={{ fontSize: 13, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                  value={quantidade} onChange={e => setQuantidade(e.target.value)} disabled={salvando} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Unidade</label>
                <select className="form-control" style={{ fontSize: 13, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                  value={unidade} onChange={e => setUnidade(e.target.value)} disabled={salvando}>
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Fábrica / Roteiro</label>
                <select className="form-control" style={{ fontSize: 13, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                  value={fabrica} onChange={e => setFabrica(e.target.value)} disabled={salvando}>
                  {FABRICAS.map(f => <option key={f.cod} value={f.cod}>{f.nome}</option>)}
                </select>
              </div>
            </div>
            <button type="button" onClick={adicionarComponente} disabled={salvando}
              style={{ width: '100%', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: salvando ? 0.6 : 1 }}>
              {salvando ? <><i className="bi bi-hourglass-split" /> Salvando...</> : <><i className="bi bi-plus-lg" /> Adicionar componente</>}
            </button>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {erro && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 14 }}>
              <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />{erro}
            </div>
          )}
          <button className="btn" style={{ width: '100%', background: '#1a3a5c', color: '#fff', border: 'none' }} onClick={fechar} disabled={salvando}>
            {componentes.length > 0 ? <><i className="bi bi-check-lg" /> Concluir ({componentes.length} componente{componentes.length > 1 ? 's' : ''})</> : 'Fechar'}
          </button>
        </div>
      </div>
    </div>
  );
}
