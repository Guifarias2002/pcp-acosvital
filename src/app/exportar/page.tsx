'use client';
import { useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { api } from '@/lib/api';

function hoje() { return new Date().toISOString().slice(0, 10); }
function mesPassado() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function escapeCsv(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function baixarCsv(nomeArquivo: string, linhas: string[][]) {
  const bom = '﻿';
  const csv = bom + linhas.map(l => l.map(escapeCsv).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_PT: Record<string, string> = {
  emitido: 'Emitido', em_producao: 'Em Produção', entregue: 'Entregue',
  bloqueado: 'Bloqueado', cancelado: 'Cancelado',
};
const PRIO_PT: Record<string, string> = {
  baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente',
};

export default function ExportarPage() {
  const [de, setDe] = useState(mesPassado());
  const [ate, setAte] = useState(hoje());
  const [status, setStatus] = useState('');
  const [prioridade, setPrioridade] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingItens, setLoadingItens] = useState(false);
  const [erro, setErro] = useState('');
  const [exportado, setExportado] = useState<{ pedidos: number; itens: number } | null>(null);

  async function buscarPedidos() {
    const params: Record<string, string> = { entregue: '1' };
    if (status) params.status = status;
    if (prioridade) params.prioridade = prioridade;
    const r = await api.get('/api/pedidos', { params });
    const todos = r.data as Record<string, unknown>[];
    return todos.filter(p => {
      const prazo = (p.prazo_entrega || p.criado_em || '') as string;
      if (!prazo) return true;
      const data = prazo.slice(0, 10);
      if (de && data < de) return false;
      if (ate && data > ate) return false;
      return true;
    });
  }

  async function exportarPedidos() {
    setLoading(true);
    setErro('');
    setExportado(null);
    try {
      const pedidos = await buscarPedidos();
      const cabecalho = ['Nº Pedido', 'OP', 'Cliente', 'Vendedor', 'Status', 'Prioridade', 'Prazo', 'Setor Atual', 'Valor (R$)', 'Criado em'];
      const linhas: string[][] = [cabecalho];
      for (const p of pedidos) {
        linhas.push([
          p.numero_pedido_venda as string,
          (p.numero_op as string) || '',
          p.cliente as string,
          (p.vendedor as string) || '',
          STATUS_PT[p.status as string] || (p.status as string),
          PRIO_PT[p.prioridade as string] || (p.prioridade as string),
          p.prazo_entrega as string,
          (p.setor_atual as string) || '',
          p.valor_calculado ? String(Number(p.valor_calculado).toFixed(2)).replace('.', ',') : '',
          new Date(p.criado_em as string).toLocaleDateString('pt-BR'),
        ]);
      }
      const nome = `pedidos_${de}_${ate}.csv`;
      baixarCsv(nome, linhas);
      setExportado({ pedidos: pedidos.length, itens: 0 });
    } catch (e: unknown) {
      setErro((e as Error).message || 'Erro ao exportar pedidos');
    } finally {
      setLoading(false);
    }
  }

  async function exportarItens() {
    setLoadingItens(true);
    setErro('');
    setExportado(null);
    try {
      const pedidos = await buscarPedidos();
      const cabecalho = ['Nº Pedido', 'OP', 'Cliente', 'Prioridade', 'Prazo', 'Status Pedido', 'Cód. Item', 'Descrição', 'Qtd', 'Unid', 'Status Item', 'Setor Atual', 'Qtd Entregue'];
      const linhas: string[][] = [cabecalho];
      let totalItens = 0;
      for (const p of pedidos) {
        const itens = (p.itens as Record<string, unknown>[]) || [];
        for (const i of itens) {
          totalItens++;
          linhas.push([
            p.numero_pedido_venda as string,
            (p.numero_op as string) || '',
            p.cliente as string,
            PRIO_PT[p.prioridade as string] || (p.prioridade as string),
            p.prazo_entrega as string,
            STATUS_PT[p.status as string] || (p.status as string),
            i.codigo as string,
            (i.descricao as string) || '',
            String(i.quantidade_pendente ?? i.quantidade ?? ''),
            (i.unidade as string) || '',
            (i.status as string) || '',
            (i.setor_atual as string) || '',
            String(i.quantidade_entregue ?? '0'),
          ]);
        }
      }
      const nome = `itens_${de}_${ate}.csv`;
      baixarCsv(nome, linhas);
      setExportado({ pedidos: pedidos.length, itens: totalItens });
    } catch (e: unknown) {
      setErro((e as Error).message || 'Erro ao exportar itens');
    } finally {
      setLoadingItens(false);
    }
  }

  return (
    <AuthGuard>
      <div style={{ maxWidth: 700 }}>
        {/* Cabeçalho */}
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 20 }}>
            <i className="bi bi-file-earmark-spreadsheet" style={{ marginRight: 8 }}></i>
            Exportar Dados
          </h4>
          <small style={{ color: '#888' }}>Exporta pedidos ou itens como CSV (compatível com Excel)</small>
        </div>

        {/* Filtros */}
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <i className="bi bi-funnel" style={{ marginRight: 6 }}></i>Filtros
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Prazo de — </label>
              <input type="date" value={de} onChange={e => setDe(e.target.value)}
                style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 5, padding: '7px 10px', fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Prazo até</label>
              <input type="date" value={ate} onChange={e => setAte(e.target.value)}
                style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 5, padding: '7px 10px', fontSize: 13 }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 5, padding: '7px 8px', fontSize: 13 }}>
                <option value="">Todos</option>
                <option value="emitido">Emitido</option>
                <option value="em_producao">Em Produção</option>
                <option value="entregue">Entregue</option>
                <option value="bloqueado">Bloqueado</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Prioridade</label>
              <select value={prioridade} onChange={e => setPrioridade(e.target.value)}
                style={{ width: '100%', border: '1px solid #dee2e6', borderRadius: 5, padding: '7px 8px', fontSize: 13 }}>
                <option value="">Todas</option>
                <option value="urgente">Urgente</option>
                <option value="alta">Alta</option>
                <option value="normal">Normal</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>
          </div>
        </div>

        {/* Botões de export */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={exportarPedidos} disabled={loading || loadingItens}
            style={{
              background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 7,
              padding: '12px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, opacity: loading ? 0.7 : 1,
            }}>
            <i className="bi bi-file-earmark-arrow-down"></i>
            {loading ? 'Exportando...' : 'Exportar Pedidos (.csv)'}
          </button>
          <button onClick={exportarItens} disabled={loading || loadingItens}
            style={{
              background: '#198754', color: '#fff', border: 'none', borderRadius: 7,
              padding: '12px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, opacity: loadingItens ? 0.7 : 1,
            }}>
            <i className="bi bi-file-earmark-arrow-down"></i>
            {loadingItens ? 'Exportando...' : 'Exportar Itens detalhados (.csv)'}
          </button>
        </div>

        {/* Feedback */}
        {erro && (
          <div style={{ marginTop: 16, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', color: '#991b1b', fontSize: 13 }}>
            <i className="bi bi-exclamation-circle" style={{ marginRight: 6 }}></i>{erro}
          </div>
        )}
        {exportado && (
          <div style={{ marginTop: 16, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, padding: '10px 14px', color: '#166534', fontSize: 13 }}>
            <i className="bi bi-check-circle-fill" style={{ marginRight: 6 }}></i>
            Exportado com sucesso — {exportado.pedidos} pedido(s)
            {exportado.itens > 0 && `, ${exportado.itens} item(ns)`}.
            O arquivo foi baixado automaticamente.
          </div>
        )}

        {/* Instruções */}
        <div style={{ marginTop: 24, background: '#f8f9fa', borderRadius: 8, padding: '14px 16px', fontSize: 12, color: '#666' }}>
          <p style={{ fontWeight: 700, marginBottom: 6, color: '#555' }}>Como abrir no Excel:</p>
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Abra o Excel → <strong>Dados</strong> → <strong>De Texto/CSV</strong></li>
            <li>Selecione o arquivo baixado</li>
            <li>Codificação: <strong>UTF-8</strong>, Delimitador: <strong>Vírgula</strong></li>
          </ol>
        </div>
      </div>
    </AuthGuard>
  );
}
