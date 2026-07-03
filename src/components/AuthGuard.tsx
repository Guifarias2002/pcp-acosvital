'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser } from '@/lib/auth';
import Sidebar, { TopBar } from '@/components/Sidebar';

interface Props {
  children: React.ReactNode;
  adminOnly?: boolean;
}

export default function AuthGuard({ children, adminOnly }: Props) {
  const router = useRouter();

  const [ok, setOk] = useState(false);

  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [sidebarColapsada, setSidebarColapsada] = useState(false);

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
        <div className="content">
          {children}
        </div>
      </div>
    </>
  );
}
