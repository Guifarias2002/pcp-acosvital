'use client';
import { useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getToken } from '@/lib/auth';

const SCRIPTS = [
  {
    id: 'divergencias',
    label: 'Tabela de Divergências',
    desc: 'Cria a tabela producao_divergencia para registrar problemas em entregas',
    icon: 'bi-exclamation-triangle-fill',
    color: '#dc2626',
    url: '/api/setup/divergencias',
  },
  {
    id: 'excluidos',
    label: 'Log de Pedidos Excluídos',
    desc: 'Cria tabela e trigger para registrar pedidos deletados',
    icon: 'bi-trash3-fill',
    color: '#6b7280',
    url: '/api/setup/excluidos',
  },
  {
    id: 'inativar-item',
    label: 'Inativação de Itens',
    desc: 'Adiciona as colunas de inativação em producao_itempedido (inativo, quem/quando, motivo)',
    icon: 'bi-eye-slash-fill',
    color: '#b45309',
    url: '/api/setup/inativar-item',
  },
  {
    id: 'hardening',
    label: 'Hardening do Banco',
    desc: 'Adiciona constraints, índices, FKs e triggers de integridade em todas as tabelas',
    icon: 'bi-shield-lock-fill',
    color: '#1a3a5c',
    url: '/api/setup/hardening',
  },
  {
    id: 'rls',
    label: 'Proteger Acesso Público (RLS)',
    desc: 'Bloqueia acesso direto ao banco via Supabase API — tabelas só acessíveis pelo sistema',
    icon: 'bi-lock-fill',
    color: '#7c3aed',
    url: '/api/setup/rls',
  },
  {
    id: 'observacoes-item',
    label: 'Observações por Item',
    desc: 'Cria a tabela producao_item_observacao para o histórico de observações por setor',
    icon: 'bi-chat-left-text-fill',
    color: '#0d6efd',
    url: '/api/setup/observacoes-item',
  },
  {
    id: 'rastreio',
    label: 'Status "Recebido" em Parciais',
    desc: 'Permite que uma parcial fique como "Recebido" (sem iniciar produção) até o usuário clicar em Iniciar',
    icon: 'bi-box-seam-fill',
    color: '#d97706',
    url: '/api/setup/rastreio',
  },
  {
    id: 'anexos-producao',
    label: 'Anexos de Pedido de Venda / OP',
    desc: 'Adiciona as colunas pedido_venda_url e ordem_producao_url em producao_pedido',
    icon: 'bi-file-earmark-text-fill',
    color: '#b45309',
    url: '/api/setup/anexos-producao',
  },
];

export default function SetupPage() {
  const [resultados, setResultados] = useState<Record<string, { ok: boolean; msg: string; log?: string[] }>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function rodar(script: typeof SCRIPTS[0]) {
    setLoading(script.id);
    try {
      const res = await fetch(script.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken() || ''}` },
      });
      const data = await res.json();
      setResultados(r => ({
        ...r,
        [script.id]: {
          ok: data.ok !== false,
          msg: data.mensagem || (data.ok ? 'Executado com sucesso!' : 'Erro ao executar'),
          log: data.log,
        },
      }));
    } catch (e) {
      setResultados(r => ({ ...r, [script.id]: { ok: false, msg: String(e) } }));
    } finally {
      setLoading(null);
    }
  }

  return (
    <AuthGuard adminOnly>
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 20 }}>
          <i className="bi bi-database-gear" style={{ marginRight: 8 }} />
          Configurar Banco de Dados
        </h4>
        <small style={{ color: '#888' }}>Execute os scripts de setup uma única vez para preparar o banco</small>
      </div>

      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#92400e' }}>
        <i className="bi bi-info-circle-fill" style={{ marginRight: 8 }} />
        Todos os scripts são <strong>idempotentes</strong> — podem ser executados mais de uma vez sem problema.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {SCRIPTS.map(s => {
          const res = resultados[s.id];
          const isLoading = loading === s.id;
          return (
            <div key={s.id} className="card" style={{ padding: '18px 20px', border: res ? `2px solid ${res.ok ? '#bbf7d0' : '#fecaca'}` : '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: s.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`bi ${s.icon}`} style={{ fontSize: 22, color: s.color }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#1a3a5c', fontSize: 15, marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{s.desc}</div>
                </div>
                <button onClick={() => rodar(s)} disabled={isLoading}
                  style={{ background: s.color, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: isLoading ? 'wait' : 'pointer', opacity: isLoading ? .7 : 1, flexShrink: 0 }}>
                  {isLoading ? <><i className="bi bi-hourglass-split" style={{ marginRight: 6 }} />Executando...</> : <><i className="bi bi-play-fill" style={{ marginRight: 6 }} />Executar</>}
                </button>
              </div>

              {res && (
                <div style={{ marginTop: 14, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                  <div style={{ fontSize: 13, color: res.ok ? '#16a34a' : '#dc2626', fontWeight: 600, marginBottom: 6 }}>
                    <i className={`bi ${res.ok ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}`} style={{ marginRight: 6 }} />
                    {res.msg}
                  </div>
                  {res.log && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, maxHeight: 200, overflowY: 'auto' }}>
                      {res.log.map((l, i) => (
                        <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: l.startsWith('✗') ? '#dc2626' : l.startsWith('⟳') ? '#888' : '#16a34a', marginBottom: 2 }}>
                          {l}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AuthGuard>
  );
}
