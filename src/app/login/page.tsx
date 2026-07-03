'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      const user = await login(username, password);
      // Operadores e líderes vão para tela de descanso do setor
      if (user?.setor && !user?.is_staff) {
        router.replace('/tela');
      } else if (user?.perfil === 'lider' && user?.setor) {
        router.replace('/tela');
      } else {
        router.replace('/');
      }
    } catch {
      setErro('Usuario ou senha invalidos.');
    } finally {
      setLoading(false);
    }
  }

  const RECURSOS = [
    { icon: 'bi-speedometer2', texto: 'Painel de produção com visão geral de todos os pedidos e etapas em tempo real' },
    { icon: 'bi-kanban', texto: 'Kanban e acompanhamento por setor — da emissão até a entrega' },
    { icon: 'bi-diagram-3', texto: 'Rastreabilidade completa: histórico de movimentações e divergências de cada item' },
    { icon: 'bi-file-earmark-excel', texto: 'Relatórios, backup diário e exportação para Excel' },
    { icon: 'bi-people', texto: 'Acesso por perfil — Administrador, PCP, Líder e Operador' },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#1a3a5c]">
      {/* Painel institucional — o que é o sistema */}
      <div className="lg:flex-1 flex flex-col justify-center px-8 py-10 lg:px-16 text-white lg:min-h-screen bg-gradient-to-br from-[#1a3a5c] to-[#0f2338]">
        <div className="max-w-md mx-auto lg:mx-0">
          <div className="flex items-center gap-2 mb-4">
            <i className="bi bi-gear-wide-connected text-3xl text-blue-300"></i>
            <span className="text-xl font-bold tracking-wide">AÇOSVITAL</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold leading-snug mb-3">
            Sistema de Planejamento<br className="hidden lg:block" /> e Controle da Produção
          </h1>
          <p className="text-blue-100 text-sm lg:text-base mb-6">
            Acompanhe pedidos, ordens de produção e o fluxo entre setores em tempo real —
            da emissão até a entrega ao cliente.
          </p>
          <ul className="space-y-3">
            {RECURSOS.map(r => (
              <li key={r.icon} className="flex items-start gap-3">
                <i className={`bi ${r.icon} text-blue-300 text-lg mt-0.5 shrink-0`}></i>
                <span className="text-blue-50 text-sm">{r.texto}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Formulário de login */}
      <div className="flex items-center justify-center px-6 py-10 lg:flex-1">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-[#1a3a5c]">AcosVital PCP</h1>
            <p className="text-gray-500 text-sm mt-1">Planejamento e Controle da Producao</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <div className="relative">
                <input type={mostrarSenha ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required />
                <button type="button" onClick={() => setMostrarSenha(v => !v)}
                  tabIndex={-1}
                  title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600">
                  <i className={`bi ${mostrarSenha ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                </button>
              </div>
            </div>
            {erro && <p className="text-red-600 text-sm">{erro}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-[#1a3a5c] hover:bg-blue-800 text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-60">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
