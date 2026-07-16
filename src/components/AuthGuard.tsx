'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser, podeEditar } from '@/lib/auth';
import Sidebar, { TopBar } from '@/components/Sidebar';
import NotificacoesLive from '@/components/NotificacoesLive';

interface Props {
  children: React.ReactNode;
  adminOnly?: boolean;
}

export default function AuthGuard({ children, adminOnly }: Props) {
  const router = useRouter();

  const [ok, setOk] = useState(false);

  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [sidebarColapsada, setSidebarColapsada] = useState(false);
  const [somenteLeitura, setSomenteLeitura] = useState(false);
  // Alerta de movimentação em tela cheia: só para perfis ADM e PCP.
  const [mostraAvisos, setMostraAvisos] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    if (adminOnly) {
      const user = getUser();
      const isSuperAdmin = user?.perfil === 'administrador' || (user?.is_staff && user?.perfil !== 'pcp' && user?.perfil !== 'lider');
      if (!isSuperAdmin) { router.replace('/'); return; }
    }
    const u = getUser();
    setMostraAvisos(u?.perfil === 'administrador' || u?.perfil === 'pcp');
    setSomenteLeitura(!podeEditar());
    setOk(true);
  }, [router, adminOnly]);

  if (!ok) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#999', fontSize: 14 }}>Carregando...</span>
    </div>
  );

  return (
    <>
      <Sidebar aberto={sidebarAberta} fechar={() => setSidebarAberta(false)} colapsada={sidebarColapsada} onColapsar={() => setSidebarColapsada(v => !v)} />
      <div id="main" className={sidebarColapsada ? 'main-colapsado' : ''}>
        <TopBar onHamburger={() => setSidebarAberta(a => !a)} colapsada={sidebarColapsada} onExpandir={() => setSidebarColapsada(false)} />
        {somenteLeitura && (
          <div style={{
            background: '#fff3cd', color: '#7a5b00', borderBottom: '1px solid #ffe08a',
            padding: '7px 16px', fontSize: 13, fontWeight: 600, display: 'flex',
            alignItems: 'center', gap: 8, justifyContent: 'center',
          }}>
            <i className="bi bi-eye"></i>
            Acesso somente leitura — você pode visualizar tudo, mas não pode fazer alterações.
          </div>
        )}
        <div className="content">
          {children}
        </div>
      </div>
      {/* Alerta de movimentação em tela cheia — global, só ADM/PCP.
          Aparece 1x por movimentação (mostra a mais recente por 5s) e some, voltando ao normal. */}
      {mostraAvisos && <NotificacoesLive modo="tela" />}
    </>
  );
}
