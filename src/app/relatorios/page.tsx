'use client';
import { useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getToken } from '@/lib/auth';

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function BackupPage() {
  const [data, setData] = useState(hoje());
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{
    salvoNaRede: boolean;
    caminho: string;
    resumo: Record<string, number>;
  } | null>(null);
  const [erro, setErro] = useState('');
  const [loadingSistema, setLoadingSistema] = useState(false);
  const [resultadoSistema, setResultadoSistema] = useState<{ caminho: string; nome: string; tamanho_mb: string } | null>(null);
  const [erroSistema, setErroSistema] = useState('');

  async function salvarSistema() {
    setLoadingSistema(true);
    setErroSistema('');
    setResultadoSistema(null);
    try {
      const res = await fetch('/api/backup/sistema', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken() || ''}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.erro || 'Erro ao salvar sistema');
      setResultadoSistema(d);
    } catch (e: unknown) {
      setErroSistema((e as Error).message || 'Erro desconhecido');
    } finally {
      setLoadingSistema(false);
    }
  }

  async function gerarBackup() {
    setLoading(true);
    setErro('');
    setResultado(null);
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify({ data }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.erro || 'Erro ao gerar backup');
      }

      const salvoNaRede = res.headers.get('X-Salvo-Na-Rede') === 'true';
      const caminho = res.headers.get('X-Caminho') || '';
      const resumoRaw = res.headers.get('X-Resumo') || '{}';
      const resumo = JSON.parse(resumoRaw);

      // Download automático no navegador
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_${data}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      setResultado({ salvoNaRede, caminho, resumo });
    } catch (e: unknown) {
      setErro((e as Error).message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  const RESUMO_LABELS: Record<string, { label: string; icon: string; color: string }> = {
    pedidos_criados:   { label: 'Pedidos Criados',   icon: 'bi-plus-circle-fill',    color: '#2563eb' },
    pedidos_entregues: { label: 'Pedidos Entregues', icon: 'bi-check-circle-fill',   color: '#16a34a' },
    movimentacoes:     { label: 'Movimentações',     icon: 'bi-arrow-left-right',    color: '#d97706' },
    em_aberto:         { label: 'Em Aberto',         icon: 'bi-hourglass-split',     color: '#7c3aed' },
    divergencias:      { label: 'Divergências',      icon: 'bi-exclamation-triangle-fill', color: '#dc2626' },
  };

  return (
    <AuthGuard>
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 20 }}>
          <i className="bi bi-cloud-arrow-down-fill" style={{ marginRight: 8, color: '#1a3a5c' }} />
          Backup Diário
        </h4>
        <small style={{ color: '#888' }}>
          Salva um Excel com todos os dados do dia em{' '}
          <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>
            Z:\Ordens de Serviço - IAPP\NOSSO SISTEMA
          </code>
        </small>
      </div>

      {/* Card principal */}
      <div className="card" style={{ padding: 28, maxWidth: 600 }}>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 8 }}>
            Data do backup
          </label>
          <input
            type="date"
            value={data}
            onChange={e => setData(e.target.value)}
            style={{ border: '2px solid #e2e8f0', borderRadius: 8, padding: '9px 14px', fontSize: 15, fontWeight: 600, color: '#1a3a5c', width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {/* O que será salvo */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            O arquivo Excel terá as abas:
          </div>
          {[
            { icon: 'bi-plus-circle',    color: '#2563eb', label: 'Pedidos Criados',   desc: 'Novos pedidos emitidos na data' },
            { icon: 'bi-check-circle',   color: '#16a34a', label: 'Pedidos Entregues', desc: 'Ordens concluídas e entregues' },
            { icon: 'bi-arrow-left-right', color: '#d97706', label: 'Movimentações',   desc: 'Tudo que foi feito: receber, iniciar, entregar...' },
            { icon: 'bi-hourglass',      color: '#7c3aed', label: 'Em Aberto',         desc: 'Snapshot de todos os pedidos ativos' },
            { icon: 'bi-exclamation-triangle', color: '#dc2626', label: 'Divergências', desc: 'Problemas abertos ou em análise' },
          ].map(a => (
            <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <i className={`bi ${a.icon}`} style={{ color: a.color, fontSize: 14, width: 18, textAlign: 'center' }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: '#334155', minWidth: 140 }}>{a.label}</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{a.desc}</span>
            </div>
          ))}
        </div>

        <button
          onClick={gerarBackup}
          disabled={loading}
          style={{
            width: '100%', background: loading ? '#94a3b8' : '#1a3a5c', color: '#fff',
            border: 'none', borderRadius: 10, padding: '14px 0', fontSize: 15,
            fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading
            ? <><i className="bi bi-hourglass-split" style={{ marginRight: 8 }} />Gerando backup...</>
            : <><i className="bi bi-cloud-arrow-down-fill" style={{ marginRight: 8 }} />Gerar Backup — {data}</>}
        </button>
      </div>

      {/* Erro */}
      {erro && (
        <div style={{ marginTop: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px', color: '#dc2626', fontSize: 13, maxWidth: 600 }}>
          <i className="bi bi-x-circle-fill" style={{ marginRight: 8 }} />{erro}
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div style={{ marginTop: 16, maxWidth: 600 }}>
          {/* Status de salvamento */}
          <div style={{
            background: resultado.salvoNaRede ? '#f0fdf4' : '#fffbeb',
            border: `1px solid ${resultado.salvoNaRede ? '#bbf7d0' : '#fde68a'}`,
            borderRadius: 10, padding: '14px 18px', marginBottom: 12,
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: resultado.salvoNaRede ? '#16a34a' : '#d97706', marginBottom: 4 }}>
              <i className={`bi ${resultado.salvoNaRede ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`} style={{ marginRight: 8 }} />
              {resultado.salvoNaRede ? 'Salvo na rede com sucesso!' : 'Download feito — pasta da rede não acessível'}
            </div>
            {resultado.caminho && (
              <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                {resultado.caminho}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              <i className="bi bi-download" style={{ marginRight: 6 }} />
              O arquivo também foi baixado automaticamente no seu navegador.
            </div>
          </div>

          {/* Resumo do conteúdo */}
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
              Conteúdo do backup — {data}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {Object.entries(resultado.resumo).map(([k, v]) => {
                const info = RESUMO_LABELS[k] || { label: k, icon: 'bi-table', color: '#64748b' };
                return (
                  <div key={k} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className={`bi ${info.icon}`} style={{ color: info.color, fontSize: 18 }} />
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: info.color, lineHeight: 1 }}>{v}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{info.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Card: Backup do Sistema ──────────────────────────────────────── */}
      <div style={{ marginTop: 32, marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c', fontSize: 18 }}>
          <i className="bi bi-folder-symlink-fill" style={{ marginRight: 8, color: '#7c3aed' }} />
          Backup do Sistema
        </h4>
        <small style={{ color: '#888' }}>
          Salva uma cópia do código fonte do sistema (.zip) na mesma pasta da rede
        </small>
      </div>

      <div className="card" style={{ padding: 24, maxWidth: 600 }}>
        <div style={{ background: '#f5f3ff', border: '1px solid #ede9fe', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#5b21b6' }}>
          <i className="bi bi-info-circle" style={{ marginRight: 8 }} />
          Salva a pasta <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>src</code>, arquivos de configuração e <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>package.json</code> — sem node_modules (muito pesado). O TI consegue restaurar com <code style={{ background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>npm install</code>.
        </div>

        <button
          onClick={salvarSistema}
          disabled={loadingSistema}
          style={{
            width: '100%', background: loadingSistema ? '#94a3b8' : '#7c3aed', color: '#fff',
            border: 'none', borderRadius: 10, padding: '14px 0', fontSize: 15,
            fontWeight: 700, cursor: loadingSistema ? 'wait' : 'pointer',
          }}
        >
          {loadingSistema
            ? <><i className="bi bi-hourglass-split" style={{ marginRight: 8 }} />Salvando código...</>
            : <><i className="bi bi-folder-symlink-fill" style={{ marginRight: 8 }} />Salvar Código Fonte Agora</>}
        </button>

        {erroSistema && (
          <div style={{ marginTop: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>
            <i className="bi bi-x-circle-fill" style={{ marginRight: 8 }} />{erroSistema}
          </div>
        )}

        {resultadoSistema && (
          <div style={{ marginTop: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#16a34a', marginBottom: 6 }}>
              <i className="bi bi-check-circle-fill" style={{ marginRight: 8 }} />
              Sistema salvo com sucesso!
            </div>
            <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', marginBottom: 4 }}>
              {resultadoSistema.caminho}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              <i className="bi bi-file-zip" style={{ marginRight: 6 }} />
              {resultadoSistema.nome} — <strong>{resultadoSistema.tamanho_mb} MB</strong>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
