'use client';
import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getUser, getToken, podeEditar } from '@/lib/auth';
import { SETOR_CHOICES, NOMES } from '@/lib/types';

interface Usuario {
  id: number;
  username: string;
  nome: string;
  is_staff: boolean;
  is_active: boolean;
  perfil: string;
  setor: string | null;
  setor_nome: string | null;
  setores: string[];
  setores_nomes: string[];
  somente_leitura: boolean;
}

const PERFIL_BADGE: Record<string, { bg: string; cor: string }> = {
  administrador: { bg: '#dc3545', cor: '#fff' },
  pcp:           { bg: '#6f42c1', cor: '#fff' },
  lider:         { bg: '#0d6efd', cor: '#fff' },
  operador:      { bg: '#6c757d', cor: '#fff' },
};

const PERFIS = ['administrador', 'pcp', 'lider', 'operador'];

// Seletor de múltiplos setores (checkboxes). Usado no criar e no editar.
function SetoresSelector({ valor, onChange }: { valor: string[]; onChange: (s: string[]) => void }) {
  function toggle(cod: string) {
    onChange(valor.includes(cod) ? valor.filter(s => s !== cod) : [...valor, cod]);
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 200, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, padding: 10 }}>
      {SETOR_CHOICES.map(([cod, nome]) => {
        const marcado = valor.includes(cod);
        return (
          <label key={cod} style={{
            display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer',
            padding: '5px 8px', borderRadius: 5, background: marcado ? '#eff6ff' : 'transparent',
            border: `1px solid ${marcado ? '#bfdbfe' : 'transparent'}`,
          }}>
            <input type="checkbox" checked={marcado} onChange={() => toggle(cod)} style={{ cursor: 'pointer' }} />
            <span style={{ color: marcado ? '#1d4ed8' : '#444', fontWeight: marcado ? 600 : 400 }}>{nome}</span>
          </label>
        );
      })}
    </div>
  );
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiadoId, setCopiadoId] = useState<number | null>(null);
  const [copiadoLogin, setCopiadoLogin] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', nome: '', senha: '', perfil: 'operador', setores: [] as string[], somente_leitura: false });
  const [salvando, setSalvando] = useState(false);
  const [formMsg, setFormMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  // Edição de usuário existente
  const [editUser, setEditUser] = useState<Usuario | null>(null);
  const [editForm, setEditForm] = useState({ nome: '', perfil: 'operador', setores: [] as string[], is_active: true, senha: '', somente_leitura: false });
  const [editMsg, setEditMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [editSalvando, setEditSalvando] = useState(false);
  const isAdmin = getUser()?.is_staff;

  function carregarUsuarios() {
    fetch('/api/usuarios', { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(r => r.json())
      .then(setUsuarios)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    carregarUsuarios();
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

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setFormMsg(null);
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify({ ...form, setores: form.setores }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormMsg({ tipo: 'erro', texto: data.erro || 'Erro ao criar usuário.' });
      } else {
        setFormMsg({ tipo: 'ok', texto: 'Usuário criado com sucesso!' });
        setForm({ username: '', nome: '', senha: '', perfil: 'operador', setores: [], somente_leitura: false });
        setShowForm(false);
        carregarUsuarios();
      }
    } catch {
      setFormMsg({ tipo: 'erro', texto: 'Erro de conexão.' });
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(u: Usuario) {
    setEditUser(u);
    setEditForm({
      nome: u.nome,
      perfil: u.perfil,
      setores: u.setores || [],
      is_active: u.is_active,
      senha: '',
      somente_leitura: u.somente_leitura || false,
    });
    setEditMsg(null);
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setEditSalvando(true);
    setEditMsg(null);
    try {
      const body: Record<string, unknown> = {
        nome: editForm.nome,
        perfil: editForm.perfil,
        setores: editForm.setores,
        is_active: editForm.is_active,
        somente_leitura: editForm.somente_leitura,
      };
      if (editForm.senha) body.senha = editForm.senha;
      const res = await fetch(`/api/usuarios/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditMsg({ tipo: 'erro', texto: data.erro || 'Erro ao salvar.' });
      } else {
        setEditUser(null);
        carregarUsuarios();
      }
    } catch {
      setEditMsg({ tipo: 'erro', texto: 'Erro de conexão.' });
    } finally {
      setEditSalvando(false);
    }
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <h4 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}>
          <i className="bi bi-people" style={{ marginRight: 8 }}></i>Usuários do Sistema
        </h4>
        {podeEditar() && (
        <button onClick={() => { setShowForm(true); setFormMsg(null); }} style={{
          background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          <i className="bi bi-person-plus" style={{ marginRight: 6 }}></i>Novo Usuário
        </button>
        )}
      </div>

      {/* Modal criar usuário */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h5 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}>
                <i className="bi bi-person-plus" style={{ marginRight: 8 }}></i>Criar Usuário
              </h5>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            <form onSubmit={criarUsuario}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#444', display: 'block', marginBottom: 4 }}>Nome completo *</label>
                <input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: João da Silva"
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#444', display: 'block', marginBottom: 4 }}>Username *</label>
                <input
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                  placeholder="Ex: joao.silva"
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#444', display: 'block', marginBottom: 4 }}>Senha *</label>
                <input
                  type="password"
                  value={form.senha}
                  onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#444', display: 'block', marginBottom: 4 }}>Perfil *</label>
                <select
                  value={form.perfil}
                  onChange={e => setForm(f => ({ ...f, perfil: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13, boxSizing: 'border-box' }}
                >
                  {PERFIS.map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#444', display: 'block', marginBottom: 4 }}>
                  Setores {form.perfil === 'lider' || form.perfil === 'operador' ? '*' : '(opcional)'}
                  <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>— pode marcar mais de um</span>
                </label>
                <SetoresSelector valor={form.setores} onChange={s => setForm(f => ({ ...f, setores: s }))} />
              </div>

              <div style={{ marginBottom: 20, background: '#fff8e1', border: '1px solid #ffe08a', borderRadius: 6, padding: '10px 12px' }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#7a5b00', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.somente_leitura} onChange={e => setForm(f => ({ ...f, somente_leitura: e.target.checked }))} style={{ cursor: 'pointer' }} />
                  <span><i className="bi bi-eye" style={{ marginRight: 6 }}></i>Acesso somente leitura</span>
                </label>
                <div style={{ fontSize: 12, color: '#9a7b1a', marginTop: 4, paddingLeft: 24 }}>
                  Vê tudo normalmente, mas não pode fazer nenhuma alteração no sistema.
                </div>
              </div>

              {formMsg && (
                <div style={{
                  marginBottom: 14, padding: '8px 12px', borderRadius: 6, fontSize: 13,
                  background: formMsg.tipo === 'ok' ? '#d1e7dd' : '#f8d7da',
                  color: formMsg.tipo === 'ok' ? '#0a3622' : '#842029',
                }}>
                  {formMsg.texto}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowForm(false)} style={{
                  background: '#f0f0f0', color: '#333', border: 'none', borderRadius: 6,
                  padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                  Cancelar
                </button>
                <button type="submit" disabled={salvando} style={{
                  background: salvando ? '#aaa' : '#1a3a5c', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: salvando ? 'not-allowed' : 'pointer',
                }}>
                  {salvando ? 'Salvando...' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal editar usuário */}
      {editUser && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h5 style={{ margin: 0, fontWeight: 700, color: '#1a3a5c' }}>
                <i className="bi bi-pencil-square" style={{ marginRight: 8 }}></i>Editar Usuário
              </h5>
              <button onClick={() => setEditUser(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            <div style={{ fontSize: 12, color: '#888', marginBottom: 16, fontFamily: 'monospace' }}>
              <i className="bi bi-person-circle" style={{ marginRight: 6 }}></i>{editUser.username}
            </div>

            <form onSubmit={salvarEdicao}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#444', display: 'block', marginBottom: 4 }}>Nome completo *</label>
                <input
                  value={editForm.nome}
                  onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#444', display: 'block', marginBottom: 4 }}>Perfil *</label>
                <select
                  value={editForm.perfil}
                  onChange={e => setEditForm(f => ({ ...f, perfil: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13, boxSizing: 'border-box' }}
                >
                  {PERFIS.map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#444', display: 'block', marginBottom: 4 }}>
                  Setores {editForm.perfil === 'lider' || editForm.perfil === 'operador' ? '*' : '(opcional)'}
                  <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>— pode marcar mais de um</span>
                </label>
                <SetoresSelector valor={editForm.setores} onChange={s => setEditForm(f => ({ ...f, setores: s }))} />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#444', display: 'block', marginBottom: 4 }}>Nova senha (deixe em branco para manter)</label>
                <input
                  type="password"
                  value={editForm.senha}
                  onChange={e => setEditForm(f => ({ ...f, senha: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#444', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} style={{ cursor: 'pointer' }} />
                  Usuário ativo
                </label>
              </div>

              <div style={{ marginBottom: 20, background: '#fff8e1', border: '1px solid #ffe08a', borderRadius: 6, padding: '10px 12px' }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#7a5b00', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editForm.somente_leitura} onChange={e => setEditForm(f => ({ ...f, somente_leitura: e.target.checked }))} style={{ cursor: 'pointer' }} />
                  <span><i className="bi bi-eye" style={{ marginRight: 6 }}></i>Acesso somente leitura</span>
                </label>
                <div style={{ fontSize: 12, color: '#9a7b1a', marginTop: 4, paddingLeft: 24 }}>
                  Vê tudo normalmente, mas não pode fazer nenhuma alteração no sistema.
                </div>
              </div>

              {editMsg && (
                <div style={{
                  marginBottom: 14, padding: '8px 12px', borderRadius: 6, fontSize: 13,
                  background: editMsg.tipo === 'ok' ? '#d1e7dd' : '#f8d7da',
                  color: editMsg.tipo === 'ok' ? '#0a3622' : '#842029',
                }}>
                  {editMsg.texto}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditUser(null)} style={{
                  background: '#f0f0f0', color: '#333', border: 'none', borderRadius: 6,
                  padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                  Cancelar
                </button>
                <button type="submit" disabled={editSalvando} style={{
                  background: editSalvando ? '#aaa' : '#1a3a5c', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: editSalvando ? 'not-allowed' : 'pointer',
                }}>
                  {editSalvando ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                {['Nome','Username','Perfil','Setores','Situação','Link do Setor','Ações'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#999' }}>Carregando...</td></tr>
              )}
              {!loading && usuarios.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#999' }}>Nenhum usuário encontrado.</td></tr>
              )}
              {usuarios.map((u, i) => {
                const badgePerfil = PERFIL_BADGE[u.perfil] || { bg: '#6c757d', cor: '#fff' };
                const linkSetor = u.setor ? `${typeof window !== 'undefined' ? window.location.origin : ''}/setor/${u.setor}` : null;
                const copiado = copiadoId === u.id;
                const setoresNomes = (u.setores_nomes && u.setores_nomes.length > 0)
                  ? u.setores_nomes
                  : (u.setor_nome ? [u.setor_nome] : []);
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
                      {u.somente_leitura && (
                        <span title="Somente leitura" style={{ display: 'inline-block', marginLeft: 6, background: '#fff3cd', color: '#7a5b00', fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 700, border: '1px solid #ffe08a' }}>
                          <i className="bi bi-eye" style={{ marginRight: 3 }}></i>Leitura
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '9px 14px', color: '#444' }}>
                      {setoresNomes.length > 0
                        ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                            <i className="bi bi-building" style={{ color: '#888', fontSize: 12 }}></i>
                            {setoresNomes.map(nome => (
                              <span key={nome} style={{ background: '#eef2ff', color: '#3730a3', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{nome}</span>
                            ))}
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
                    <td style={{ padding: '9px 14px' }}>
                      {podeEditar() ? (
                      <button onClick={() => abrirEdicao(u)} style={{
                        background: 'none', border: '1px solid #1a3a5c', color: '#1a3a5c',
                        borderRadius: 4, padding: '3px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>
                        <i className="bi bi-pencil" style={{ marginRight: 4 }}></i>Editar
                      </button>
                      ) : <span style={{ color: '#bbb', fontSize: 12 }}>—</span>}
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
        Ele abrirá o login e ao entrar irá direto para o seu setor. Quem tem mais de um setor vê todos na barra lateral. O link de login acima pode ser salvo no celular como atalho.
      </div>
    </AuthGuard>
  );
}
