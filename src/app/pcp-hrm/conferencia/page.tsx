'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { listarConferenciaHrm, iniciarConferenciaHrm } from '@/lib/api';

// Lista das OPs aguardando Conferência (pedidos "casca" do HRM na Emissão).
export default function ConferenciaListaPage() {
  return <AuthGuard hrmOnly><Conteudo /></AuthGuard>;
}

interface Casca {
  id: number; numero_pedido_venda: string; numero_op: string | null;
  cliente: string | null; prazo_entrega: string | null; observacoes: string | null;
  criado_em: string; tem_op: boolean;
  conferencia_iniciada_em: string | null; conferencia_iniciada_por: string | null;
}

function Conteudo() {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<Casca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [iniciando, setIniciando] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try { const d = await listarConferenciaHrm(); setPedidos(d.pedidos || []); }
      catch { setErro('Não consegui carregar a lista.'); }
      finally { setCarregando(false); }
    })();
  }, []);

  // "Iniciar": marca que o PCP começou a conferir esta OP e já abre a conferência.
  async function iniciar(id: number) {
    setIniciando(id);
    try {
      const r = await iniciarConferenciaHrm(id);
      setPedidos(ps => ps.map(p => p.id === id
        ? { ...p, conferencia_iniciada_em: r.conferencia_iniciada_em, conferencia_iniciada_por: r.conferencia_iniciada_por }
        : p));
      router.push(`/pcp-hrm/conferencia/${id}`);
    } catch {
      setErro('Não consegui iniciar a conferência.');
      setIniciando(null);
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1a3a5c' }}>
          <i className="bi bi-clipboard-check" style={{ marginRight: 8 }} />PCP HRM — Conferência
        </h1>
        <a href="/pcp-hrm" style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 13, color: '#555', textDecoration: 'none', fontWeight: 600 }}>
          <i className="bi bi-file-earmark-arrow-up" style={{ marginRight: 6 }} />Anexar OP
        </a>
      </div>

      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
        OPs anexadas que caíram na Emissão e ainda não foram lançadas pra produção. Abra pra conferir os materiais/roteiro e lançar.
      </p>

      {carregando && <div style={{ padding: 30, textAlign: 'center', color: '#1a3a5c' }}><i className="bi bi-arrow-repeat" style={{ marginRight: 8 }} />Carregando…</div>}
      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>{erro}</div>}

      {!carregando && !erro && pedidos.length === 0 && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '20px', textAlign: 'center', color: '#166534', fontSize: 14 }}>
          <i className="bi bi-check2-circle" style={{ marginRight: 6 }} />Nenhuma OP aguardando conferência.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pedidos.map((p, i) => {
          const jaIniciada = !!p.conferencia_iniciada_em;
          return (
          <div key={p.id}
            style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
            <span style={{ flexShrink: 0, minWidth: 26, height: 26, borderRadius: 13, background: '#1a3a5c', color: '#fff', fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            {/* Área de info clicável → PRÉVIA só-leitura (OP, descrição, componentes,
                desenhos). Ver os detalhes sem iniciar a conferência. */}
            <a href={`/pcp-hrm/conferencia/${p.id}?preview=1`} title="Ver detalhes (prévia)"
              style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a3a5c' }}>
                {p.numero_pedido_venda}{p.cliente && p.cliente !== 'A definir' ? ` · ${p.cliente}` : ''}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {p.tem_op ? <span style={{ color: '#16a34a' }}><i className="bi bi-paperclip" /> OP anexada</span> : <span style={{ color: '#b45309' }}>sem OP</span>}
                {p.prazo_entrega ? ` · Prazo ${new Date(p.prazo_entrega).toLocaleDateString('pt-BR')}` : ''}
                {jaIniciada && (
                  <span style={{ color: '#7c3aed' }}> · <i className="bi bi-hourglass-split" /> Em conferência{p.conferencia_iniciada_por ? ` · ${p.conferencia_iniciada_por}` : ''}</span>
                )}
                <span style={{ color: '#94a3b8' }}> · <i className="bi bi-eye" /> ver detalhes</span>
              </div>
            </a>
            {jaIniciada ? (
              <a href={`/pcp-hrm/conferencia/${p.id}`}
                style={{ background: '#eef4fb', color: '#1a3a5c', border: '1px solid #c7d7ee', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', textDecoration: 'none' }}>
                Conferir <i className="bi bi-arrow-right" />
              </a>
            ) : (
              <button onClick={() => iniciar(p.id)} disabled={iniciando === p.id}
                style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', opacity: iniciando === p.id ? 0.6 : 1 }}>
                {iniciando === p.id
                  ? <><i className="bi bi-arrow-repeat" /> Iniciando…</>
                  : <><i className="bi bi-play-fill" /> Iniciar</>}
              </button>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
