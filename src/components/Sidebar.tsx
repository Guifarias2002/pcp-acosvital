'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout, getUser, vendedorRestrito } from '@/lib/auth';
import { SETOR_CHOICES, NOMES } from '@/lib/types';
import { useEffect, useState } from 'react';
import { JWTPayload } from '@/lib/auth';

const SETOR_ICONS: Record<string, string> = {
  emissao: 'bi-file-earmark-plus',
  compras: 'bi-cart3',
  recebimento: 'bi-box-arrow-in-down',
  estoque: 'bi-box-seam',
  plasma: 'bi-lightning-charge',
  'maçarico': 'bi-fire',
  laser: 'bi-scissors',
  usinagem: 'bi-tools',
  beneficiadores: 'bi-gear-wide',
  caldeiraria: 'bi-hammer',
  qualidade: 'bi-patch-check',
  furacao: 'bi-circle',
  acabamento: 'bi-brush',
  embalagem: 'bi-box',
  logistica: 'bi-truck',
};

function NavItem({ href, label, icon, onNav }: { href: string; label: string; icon?: string; onNav?: () => void }) {
  const rawPath = usePathname();
  // usePathname() não decodifica segmentos com acentos (ex: "ma%C3%A7arico")
  let path = rawPath;
  try { path = decodeURIComponent(rawPath); } catch { /* já decodificado */ }
  const active = path === href || (href !== '/' && path.startsWith(href));
  return (
    <Link href={href} className={`nav-link${active ? ' ativo' : ''}`} onClick={onNav}>
      {icon && <i className={`bi ${icon}`}></i>}
      <span>{label}</span>
    </Link>
  );
}

function NavGroup({ label, defaultOpen = true, alwaysOpen = false, children }: { label: string; defaultOpen?: boolean; alwaysOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = alwaysOpen || open;
  return (
    <>
      <button
        className="sec sec-toggle"
        onClick={() => { if (!alwaysOpen) setOpen(v => !v); }}
        aria-expanded={isOpen}
        style={{ cursor: alwaysOpen ? 'default' : 'pointer' }}
      >
        <span>{label}</span>
        {!alwaysOpen && <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 10, opacity: 0.7 }} />}
      </button>
      {isOpen && children}
    </>
  );
}

interface SidebarProps {
  aberto: boolean;
  fechar: () => void;
  colapsada?: boolean;
  onColapsar?: () => void;
}

export default function Sidebar({ aberto, fechar, colapsada, onColapsar }: SidebarProps) {
  const [user, setUser] = useState<JWTPayload | null>(null);
  useEffect(() => { setUser(getUser()); }, []);

  const isAdmin = user?.is_staff;
  const isSuperAdmin = user?.perfil === 'administrador' || (user?.is_staff && user?.perfil !== 'pcp' && user?.perfil !== 'lider');
  const isVendedor = !isAdmin && user?.perfil === 'vendedor';
  const meuSetor = user?.setor;
  // Setores que o operador pode acessar (múltiplos). Fallback pro setor único.
  const meusSetores = (user?.setores && user.setores.length > 0)
    ? user.setores
    : (meuSetor ? [meuSetor] : []);

  return (
    <>
      {/* Overlay mobile */}
      <div id="sidebar-overlay" className={aberto ? 'ativo' : ''} onClick={fechar} />
      <div id="sidebar" className={`${aberto ? 'aberto' : ''} ${colapsada ? 'colapsada' : ''}`}>
        <div className="brand">
          <div className="brand-header">
            <div>
              <h5>PCP ACOSVITAL</h5>
              <small>Planejamento e Controle</small>
            </div>
            <button className="btn-colapsar" onClick={onColapsar} title={colapsada ? 'Expandir menu' : 'Recolher menu'}>
              <i className={`bi ${colapsada ? 'bi-chevron-right' : 'bi-chevron-left'}`}></i>
            </button>
          </div>
        </div>
        <nav>
          <NavGroup label="Geral">
            {!isVendedor && <NavItem href="/" label="Dashboard" icon="bi-speedometer2" onNav={fechar} />}
            <NavItem href="/pedidos" label={vendedorRestrito(user) ? 'Meus Pedidos' : 'Todos os Pedidos'} icon="bi-list-ul" onNav={fechar} />
            {isAdmin && (
              <>
                <NavItem href="/kanban" label="Kanban" icon="bi-kanban" onNav={fechar} />
                <NavItem href="/por-lider" label="Por Líder" icon="bi-people-fill" onNav={fechar} />
                <NavItem href="/emitidos" label="Em Produção" icon="bi-send-fill" onNav={fechar} />
                <NavItem href="/entregues" label="Entregues" icon="bi-check-circle" onNav={fechar} />
                <NavItem href="/divergencias" label="Divergências" icon="bi-exclamation-triangle" onNav={fechar} />
                <a href="/tv/movimentacoes" target="_blank" rel="noopener noreferrer" className="nav-link" title="Abre em nova aba — pra deixar ligado numa TV/monitor">
                  <i className="bi bi-tv-fill"></i>
                  <span>TV Movimentação</span>
                </a>
              </>
            )}
            {/* Responsável pela Logística também acessa Entregues, sem o resto das telas admin. */}
            {!isAdmin && meusSetores.includes('logistica') && (
              <NavItem href="/entregues" label="Entregues" icon="bi-check-circle" onNav={fechar} />
            )}
          </NavGroup>

          {isAdmin ? (
            <NavGroup label="🔩 Flanges" defaultOpen={true}>
              {SETOR_CHOICES.filter(([cod]) => cod !== 'caldeiraria').map(([cod, nome]) => (
                <NavItem key={cod} href={`/setor/${cod}`} label={nome} icon={SETOR_ICONS[cod]} onNav={fechar} />
              ))}
            </NavGroup>
          ) : meusSetores.filter(cod => cod !== 'caldeiraria').length > 0 ? (
            <NavGroup label="🔩 Flanges">
              {meusSetores.filter(cod => cod !== 'caldeiraria').map(cod => (
                <NavItem
                  key={cod}
                  href={`/setor/${cod}`}
                  label={NOMES[cod] || cod}
                  icon={SETOR_ICONS[cod]}
                  onNav={fechar}
                />
              ))}
            </NavGroup>
          ) : null}

          {/* Caldeiraria — linha própria, separada dos Flanges */}
          {(isAdmin || meusSetores.includes('caldeiraria')) && (
            <NavGroup label="🏗 Caldeiraria" defaultOpen={true}>
              <NavItem href="/setor/caldeiraria" label="Caldeiraria" icon={SETOR_ICONS.caldeiraria} onNav={fechar} />
            </NavGroup>
          )}

          {/* Futuras linhas de produto */}
          {isAdmin && (
            <>
              <NavGroup label="🔧 Serralheria" defaultOpen={false}>
                <span style={{ fontSize: 11, color: '#666', padding: '4px 16px', display: 'block', fontStyle: 'italic' }}>Em breve</span>
              </NavGroup>
              <NavGroup label="🏠 Prod. de Telhas" defaultOpen={false}>
                <span style={{ fontSize: 11, color: '#666', padding: '4px 16px', display: 'block', fontStyle: 'italic' }}>Em breve</span>
              </NavGroup>
            </>
          )}

          {isSuperAdmin && (
            <NavGroup label="Sistema" defaultOpen={false}>
              <NavItem href="/usuarios" label="Usuários" icon="bi-people" onNav={fechar} />
              <NavItem href="/relatorios" label="Backup Diário" icon="bi-cloud-arrow-down-fill" onNav={fechar} />
              <NavItem href="/exportar" label="Exportar Excel" icon="bi-file-earmark-excel" onNav={fechar} />
              <NavItem href="/excluidos" label="Pedidos Excluídos" icon="bi-trash3" onNav={fechar} />
              <NavItem href="/setup" label="Configurar Banco" icon="bi-database-gear" onNav={fechar} />
            </NavGroup>
          )}
        </nav>
      </div>
    </>
  );
}

interface TopBarProps {
  onHamburger: () => void;
  colapsada?: boolean;
  onExpandir?: () => void;
}

export function TopBar({ onHamburger, colapsada, onExpandir }: TopBarProps) {
  const [user, setUser] = useState<JWTPayload | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => { setUser(getUser()); }, []);

  const titles: Record<string, string> = {
    '/': 'Dashboard',
    '/pedidos': vendedorRestrito(user) ? 'Meus Pedidos' : 'Todos os Pedidos',
    '/kanban': 'Kanban',
    '/por-lider': 'Painel por Líder',
    '/emitidos': 'Ordens de Produção Emitidas',
    '/entregues': 'Entregues',
    '/divergencias': 'Divergências',
    '/usuarios': 'Usuários',
    '/relatorios': 'Relatórios',
    '/exportar': 'Exportar Excel',
    '/excluidos': 'Pedidos Excluídos',
  };
  // Detecta /setor/[setor] e /pedidos/[id] e /item/[id] e /parcial/[id] pela URL
  const setorMatch = pathname.match(/^\/setor\/([^/]+)/);
  const pedidoMatch = pathname.match(/^\/pedidos\/(\d+)/);
  const itemMatch = pathname.match(/^\/item\/(\d+)/);
  const parcialMatch = pathname.match(/^\/parcial\/(\d+)/);
  // usePathname() não decodifica segmentos com acentos (ex: "ma%C3%A7arico")
  let setorNome = setorMatch?.[1] || '';
  try { setorNome = decodeURIComponent(setorNome); } catch { /* já decodificado */ }
  const title = setorMatch
    ? (NOMES[setorNome] || setorNome)
    : pedidoMatch
    ? `Pedido ${pedidoMatch[1]}`
    : itemMatch
    ? `Item ${itemMatch[1]}`
    : parcialMatch
    ? `Parcial ${parcialMatch[1]}`
    : (titles[pathname] || '');

  // Páginas de sub-nível que precisam de botão voltar
  const temVoltar = !!(setorMatch || pedidoMatch || itemMatch || parcialMatch);

  return (
    <div className="topbar">
      {colapsada && (
        <button className="btn-expandir-sidebar" onClick={onExpandir} title="Abrir menu">
          <i className="bi bi-layout-sidebar"></i>
        </button>
      )}
      <button className="btn-hamburger" onClick={onHamburger} aria-label="Menu">
        <i className="bi bi-list"></i>
      </button>
      {temVoltar && (
        <button
          onClick={() => router.back()}
          style={{
            background: 'none', border: '1px solid #d1d5db', borderRadius: 6,
            padding: '4px 10px', fontSize: 13, color: '#374151', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
          }}
          aria-label="Voltar"
        >
          <i className="bi bi-arrow-left" style={{ fontSize: 14 }}></i>
          <span className="topbar-nome">Voltar</span>
        </button>
      )}
      <span className="topbar-titulo">{title}</span>
      <div className="topbar-usuario">
        {user && (
          <>
            <i className="bi bi-person-circle" style={{ color: '#555' }}></i>
            <span className="topbar-nome" style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
              {user.nome?.toUpperCase()}
            </span>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
              background: user.is_staff ? '#dc3545' : '#0d6efd', color: '#fff',
              whiteSpace: 'nowrap',
            }}>
              {user.perfil ? user.perfil.charAt(0).toUpperCase() + user.perfil.slice(1) : (user.is_staff ? 'Administrador' : 'Operador')}
            </span>
          </>
        )}
        {user?.is_staff && (
          <a href="/tv/movimentacoes" target="_blank" rel="noopener noreferrer" title="TV Movimentação — abre em nova aba"
            style={{
              fontSize: 12, border: '1px solid #0d6efd', color: '#0d6efd',
              background: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
              whiteSpace: 'nowrap', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
            }}>
            <i className="bi bi-tv-fill"></i>
            <span className="topbar-nome">TV</span>
          </a>
        )}
        <button onClick={logout} style={{
          fontSize: 12, border: '1px solid #dc3545', color: '#dc3545',
          background: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          <i className="bi bi-box-arrow-right"></i>
          <span className="topbar-nome" style={{ marginLeft: 4 }}>Sair</span>
        </button>
      </div>
    </div>
  );
}
