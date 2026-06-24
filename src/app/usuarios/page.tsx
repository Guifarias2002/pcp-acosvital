'use client';
import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getUser, getToken } from '@/lib/auth';

interface Usuario {
  id: number;
  username: string;
  nome: string;
  is_staff: boolean;
  is_active: boolean;
  perfil: string;
  setor: string | null;
  setor_nome: string | null;
}

const PERFIL_BADGE: Record<string, { bg: string; cor: string }> = {
  administrador: { bg: '#dc3545', cor: '#fff' },
  pcp:           { bg: '#6f42c1', cor: '#fff' },
  lider:         { bg: '#0d6efd', cor: '#fff' },
  operador:      { bg: '#6c757d', cor: '#fff' },
};

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiadoId, setCopiadoId] = useState<number | null>(null);
  const [copiadoLogin, setCopiadoLogin] = useState(false);
  const isAdmin = getUser()?.is_staff;

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    fetch('/api/usuarios', { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(r => r.json())
      .then(setUsuarios)
      .finally(() => setLoading(false));
  }, []);

  function copiarLink(u: Usuario) {
    if (!u.setor) return;
    const link = `${window.location.origin}/setor/${u.setor}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiadoId(u.id);
      setTimeout(() => setCopiadoId(null), 2000);
    });
  }

  function copiarLogin() {
    const link = `${window.location.origin}/login`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiadoLogin(true);
      setTimeout(() => setCopiadoLogin(false), 2000);
    });
  }

  if (!isAdmin) {
    return (
      <AuthGuard>
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#888' }}>
          <i className="bi bi-lock" style={{ fontSize: 40, display: 'block', marginBottom: 12, color: '#dc3545' }}></i>
          <strong>Acesso restrito a administradores.</strong>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}>
          <i className="bi bi-people" style={{ marginRight: 8 }}></i>Usuários do Sistema
        </h4>
      </div>

      {/* Card: link de login */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1a3a5c', marginBottom: 2 }}>
            <i className="bi bi-link-45deg" style={{ marginRight: 6 }}></i>
            Link de acesso ao sistema
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>Envie este link para os colaboradores acessarem o PCP:</div>
          <code style={{ fontSize: 13, color: '#0d6efd', fontWeight: 600 }}>
            {typeof window !== 'undefined' ? window.location.origin : ''}/login
          </code>
        </div>
        <button onClick={copiarLogin} style={{
          background: copiadoLogin ? '#198754' : '#1a3a5c', color: '#fff',
          border: 'none', borderRadius: 6, padding: '7px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          transition: 'background .2s',
        }}>
          <i className={`bi ${copiadoLogin ? 'bi-check-lg' : 'bi-clipboard'}`} style={{ marginRight: 6 }}></i>
          {copiadoLogin ? 'Copiado!' : 'Copiar link de login'}
        </button>
      </div>

      {/* Tabela de usuários */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-responsive">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#212529', color: '#fff' }}>
                {['Nome','Username','Perfil','Setor','Situação','Link do Setor'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#999' }}>Carregando...</td></tr>
              )}
              {!loading && usuarios.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#999' }}>Nenhum usuário encontrado.</td></tr>
              )}
              {usuarios.map((u, i) => {
                const badgePerfil = PERFIL_BADGE[u.perfil] || { bg: '#6c757d', cor: '#fff' };
                const linkSetor = u.setor ? `${typeof window !== 'undefined' ? window.location.origin : ''}/setor/${u.setor}` : null;
                const copiado = copiadoId === u.id;
                return (
                  <tr key={u.id} style={{
                    borderBottom: '1px solid #f0f0f0',
                    background: !u.is_active ? '#fafafa' : i % 2 === 0 ? '#fff' : '#fdfdfd',
                    opacity: u.is_active ? 1 : 0.55,
                  }}>
                    <td style={{ padding: '9px 14px', fontWeight: 600, color: '#1a3a5c' }}>
                      <i className="bi bi-person-circle" style={{ marginRight: 6, color: '#888' }}></i>
                      {u.nome}
                    </td>
                    <td style={{ padding: '9px 14px', color: '#555', fontFamily: 'monospace', fontSize: 12 }}>{u.username}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ background: badgePerfil.bg, color: badgePerfil.cor, fontSize: 11, padding: '2px 10px', borderRadius: 4, fontWeight: 600 }}>
                        {u.perfil.charAt(0).toUpperCase() + u.perfil.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', color: '#444' }}>
                      {u.setor_nome
                        ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="bi bi-building" style={{ color: '#888', fontSize: 12 }}></i>
                            {u.setor_nome}
                          </span>
                        : <span style={{ color: '#bbb', fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                        background: u.is_active ? '#d1e7dd' : '#e2e3e5',
                        color: u.is_active ? '#0a3622' : '#666',
                      }}>
                        {u.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      {linkSetor ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <code style={{ fontSize: 11, color: '#0d6efd' }}>…/setor/{u.setor}</code>
                          <button onClick={() => copiarLink(u)} style={{
                            background: copiado ? '#198754' : '#0d6efd', color: '#fff',
                            border: 'none', borderRadius: 4, padding: '3px 12px', fontSize: 12,
                            fontWeight: 600, cursor: 'pointer', width: 'fit-content',
                            transition: 'background .2s',
                          }}>
                            <i className={`bi ${copiado ? 'bi-check-lg' : 'bi-clipboard'}`} style={{ marginRight: 4 }}></i>
                            {copiado ? 'Copiado!' : 'Copiar link'}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#bbb', fontSize: 12 }}>Sem setor definido</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && usuarios.length > 0 && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: '#888', borderTop: '1px solid #f0f0f0' }}>
            {usuarios.filter(u => u.is_active).length} ativo{usuarios.filter(u => u.is_active).length !== 1 ? 's' : ''} · {usuarios.filter(u => !u.is_active).length} inativo{usuarios.filter(u => !u.is_active).length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Instrução */}
      <div style={{ marginTop: 16, background: '#e7f3ff', border: '1px solid #b6d4fe', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#084298' }}>
        <i className="bi bi-info-circle" style={{ marginRight: 8 }}></i>
        <strong>Como compartilhar:</strong> Copie o link do setor do colaborador, envie pelo WhatsApp ou e-mail.
        Ele abrirá o login e ao entrar irá direto para o seu setor. O link de login acima pode ser salvo no celular como atalho.
      </div>
    </AuthGuard>
  );
}
