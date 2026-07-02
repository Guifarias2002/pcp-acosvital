'use client';
import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getToken } from '@/lib/auth';
import { fmtData } from '@/lib/format';

interface Arquivo {
  nome: string;
  data: string;
  tamanho: number;
  criado_em: string;
  url: string;
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function BackupsPage() {
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerandoBackup, setGerandoBackup] = useState(false);
  const [msg, setMsg] = useState('');

  async function carregar() {
    setLoading(true);
    try {
      const token = getToken() || '';
      const r = await fetch('/api/cron/backup/list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      setArquivos(d.arquivos || []);
    } finally {
      setLoading(false);
    }
  }

  async function gerarAgora() {
    setGerandoBackup(true);
    setMsg('');
    try {
      const token = getToken() || '';
      const r = await fetch('/api/cron/backup/trigger', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.ok) {
        setMsg(`✅ Backup de ${d.data} gerado — ${d.totais.pedidos} pedidos, ${d.totais.itens} itens`);
        carregar();
      } else {
        setMsg(`❌ Erro: ${d.erro}`);
      }
    } catch {
      setMsg('❌ Falha ao gerar backup');
    } finally {
      setGerandoBackup(false);
    }
  }

  function baixar(arquivo: Arquivo) {
    const token = getToken() || '';
    const url = `/api/cron/backup/download?arquivo=${encodeURIComponent(arquivo.nome)}&token=${encodeURIComponent(token)}`;
    window.open(url, '_blank');
  }

  useEffect(() => { carregar(); }, []);

  return (
    <AuthGuard adminOnly>
      <div className="px-6 py-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[#1a3a5c]">🗂 Backups Diários</h1>
            <p className="text-sm text-gray-500 mt-1">Snapshots automáticos gerados todo dia às 03:00</p>
          </div>
          <button onClick={gerarAgora} disabled={gerandoBackup}
            className="bg-[#1a3a5c] text-white px-4 py-2 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-60">
            {gerandoBackup ? '⏳ Gerando...' : '+ Gerar agora'}
          </button>
        </div>

        {msg && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${msg.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {msg}
          </div>
        )}

        {loading ? (
          <p className="text-gray-400 text-sm">Carregando...</p>
        ) : arquivos.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-semibold">Nenhum backup ainda</p>
            <p className="text-xs mt-1">Clique em "Gerar agora" para criar o primeiro</p>
          </div>
        ) : (
          <div className="space-y-2">
            {arquivos.map(a => (
              <div key={a.nome} className="bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[#1a3a5c] text-sm">📄 Backup {a.data}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {a.criado_em ? fmtData(a.criado_em) : '—'} · {fmtBytes(a.tamanho)}
                  </p>
                </div>
                <button onClick={() => baixar(a)}
                  className="text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100">
                  ⬇ Baixar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
