'use client';
import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';

interface Material {
  id: number;
  nome: string;
  descricao: string;
  categoria: string;
  nome_arquivo: string;
  tamanho: number | null;
  mime_type: string | null;
  criado_por_nome: string;
  criado_por_id: number | null;
  criado_em: string;
}

function iconePorTipo(mime: string | null, nomeArquivo: string): string {
  const ext = nomeArquivo.split('.').pop()?.toLowerCase() || '';
  if (mime?.includes('pdf') || ext === 'pdf') return 'bi-file-earmark-pdf-fill';
  if (mime?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'bi-file-earmark-image-fill';
  if (['xls', 'xlsx'].includes(ext)) return 'bi-file-earmark-excel-fill';
  if (['doc', 'docx'].includes(ext)) return 'bi-file-earmark-word-fill';
  return 'bi-file-earmark-fill';
}

function fmtTamanho(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CatalogoPage() {
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const user = getUser();
  const podeEnviar = !!user?.is_staff || user?.perfil === 'lider';

  function carregar(q?: string) {
    setLoading(true);
    api.get('/api/catalogo', { params: q ? { q } : undefined })
      .then(r => setMateriais(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { carregar(); }, []);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    carregar(busca.trim() || undefined);
  }

  async function enviarMaterial() {
    if (!arquivo || !nome.trim()) { setErro('Nome e arquivo são obrigatórios'); return; }
    setEnviando(true);
    setErro('');
    try {
      // 1. Pede URL assinada — arquivos grandes não podem passar pelo nosso
      //    servidor (Vercel rejeita corpos acima de 4.5MB antes do código rodar).
      const { data: urlData } = await api.post('/api/catalogo/upload-url', {
        nomeArquivo: arquivo.name,
        contentType: arquivo.type,
      });

      // 2. Envia o arquivo direto para o Storage do Supabase.
      const upRes = await fetch(urlData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': arquivo.type || 'application/octet-stream' },
        body: arquivo,
      });
      if (!upRes.ok) throw new Error(`Falha ao enviar arquivo (${upRes.status})`);

      // 3. Registra os metadados no catálogo.
      await api.post('/api/catalogo', {
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        categoria: categoria.trim() || undefined,
        storagePath: urlData.storagePath,
        nomeArquivo: arquivo.name,
        tamanho: arquivo.size,
        mimeType: arquivo.type,
      });
      setShowUpload(false);
      setNome(''); setDescricao(''); setCategoria(''); setArquivo(null);
      carregar();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { erro?: string } }; message?: string };
      setErro(ax?.response?.data?.erro || ax?.message || 'Erro ao enviar material');
    } finally {
      setEnviando(false);
    }
  }

  async function excluirMaterial(id: number) {
    if (!confirm('Excluir este material do catálogo?')) return;
    try { await api.delete(`/api/catalogo/${id}`); carregar(busca.trim() || undefined); }
    catch { alert('Erro ao excluir material'); }
  }

  return (
    <AuthGuard>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Catálogo de Materiais</h1>
          <p className="text-sm text-gray-400 mt-0.5">Biblioteca central de arquivos e materiais de referência</p>
        </div>
        {podeEnviar && (
          <button onClick={() => setShowUpload(v => !v)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-blue-700">
            <i className="bi bi-cloud-upload-fill mr-1" /> Enviar material
          </button>
        )}
      </div>

      <form onSubmit={buscar} className="flex gap-2 mb-4">
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome ou categoria..."
          className="border rounded-lg px-3 py-2 text-sm flex-1 max-w-md" />
        <button type="submit" className="border rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <i className="bi bi-search" />
        </button>
      </form>

      {showUpload && podeEnviar && (
        <div className="bg-white rounded-xl border shadow-sm p-4 mb-4">
          <p className="text-sm font-bold text-gray-700 mb-3">Novo material</p>
          {erro && <p className="text-xs text-red-600 mb-2">{erro}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do material *"
              className="border rounded px-3 py-2 text-sm" />
            <input value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Categoria (opcional)"
              className="border rounded px-3 py-2 text-sm" />
          </div>
          <textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição (opcional)"
            rows={2} className="border rounded px-3 py-2 text-sm w-full mb-3 resize-none" />
          <label className="block cursor-pointer rounded border-2 border-dashed border-gray-300 p-4 text-center text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 mb-3">
            {arquivo ? `📎 ${arquivo.name}` : '➕ Selecionar arquivo'}
            <input type="file" className="hidden"
              onChange={e => setArquivo(e.target.files?.[0] || null)} />
          </label>
          <div className="flex gap-2">
            <button onClick={enviarMaterial} disabled={enviando}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
              {enviando ? 'Enviando...' : 'Salvar no catálogo'}
            </button>
            <button onClick={() => setShowUpload(false)}
              className="border rounded px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading && <p className="text-gray-400 text-center py-20">Carregando...</p>}

      {!loading && materiais.length === 0 && (
        <div className="text-center py-20">
          <div className="text-4xl text-gray-200 mb-2">📚</div>
          <p className="text-gray-400 text-sm">Nenhum material no catálogo ainda.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {materiais.map(m => (
          <div key={m.id} className="bg-white rounded-xl border shadow-sm p-4 flex flex-col">
            <div className="flex items-start gap-3 mb-2">
              <i className={`bi ${iconePorTipo(m.mime_type, m.nome_arquivo)} text-2xl text-blue-600`} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800 text-sm truncate">{m.nome}</p>
                {m.categoria && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{m.categoria}</span>}
              </div>
            </div>
            {m.descricao && <p className="text-xs text-gray-500 mb-2 line-clamp-2">{m.descricao}</p>}
            <p className="text-xs text-gray-400 mb-3">
              {m.criado_por_nome} · {new Date(m.criado_em).toLocaleDateString('pt-BR')} {fmtTamanho(m.tamanho) && `· ${fmtTamanho(m.tamanho)}`}
            </p>
            <div className="mt-auto flex gap-2">
              <a href={`/api/catalogo/${m.id}`} target="_blank" rel="noopener noreferrer"
                className="flex-1 text-center border border-blue-300 text-blue-700 rounded px-3 py-1.5 text-xs font-semibold hover:bg-blue-50">
                <i className="bi bi-download mr-1" />Baixar
              </a>
              {(user?.is_staff || m.criado_por_id === user?.id) && (
                <button onClick={() => excluirMaterial(m.id)}
                  className="border border-red-300 text-red-600 rounded px-3 py-1.5 text-xs font-semibold hover:bg-red-50">
                  <i className="bi bi-trash" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </AuthGuard>
  );
}
