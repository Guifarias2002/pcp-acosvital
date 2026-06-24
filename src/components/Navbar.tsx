'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/lib/auth';
import { SETOR_CHOICES } from '@/lib/types';
import { useState } from 'react';

export default function Navbar() {
  const path = usePathname();
  const [setoresOpen, setSetoresOpen] = useState(false);

  const link = (href: string, label: string) => (
    <Link href={href} className={`px-3 py-2 rounded text-sm font-medium transition-colors ${path === href ? 'bg-blue-800 text-white' : 'text-blue-100 hover:bg-blue-800'}`}>
      {label}
    </Link>
  );

  return (
    <nav className="bg-[#1a3a5c] shadow-lg">
      <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
        <Link href="/" className="text-white font-bold text-lg mr-4">AcosVital PCP</Link>
        {link('/', 'Dashboard')}
        {link('/pedidos', 'Pedidos')}
        {link('/pedidos/novo', 'Nova Ordem')}
        {link('/emitidos', 'Em Producao')}
        {link('/entregues', 'OPs Realizadas')}
        {link('/kanban', 'Kanban')}
        {link('/relatorios', 'Relatorios')}
        {link('/relatorio/geral', 'Rel. Geral')}

        {/* Setores dropdown */}
        <div className="relative">
          <button
            onClick={() => setSetoresOpen(v => !v)}
            className="px-3 py-2 rounded text-sm font-medium text-blue-100 hover:bg-blue-800 transition-colors flex items-center gap-1"
          >
            Setores ▾
          </button>
          {setoresOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white shadow-xl rounded-lg z-50 min-w-48 py-1">
              {SETOR_CHOICES.map(([cod, nome]) => (
                <Link key={cod} href={`/setor/${cod}`}
                  onClick={() => setSetoresOpen(false)}
                  className={`block px-4 py-2 text-sm hover:bg-blue-50 ${path === `/setor/${cod}` ? 'text-blue-700 font-semibold' : 'text-gray-700'}`}>
                  {nome}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto">
          <button onClick={logout} className="px-3 py-2 rounded text-sm text-blue-200 hover:text-white hover:bg-blue-800 transition-colors">
            Sair
          </button>
        </div>
      </div>
    </nav>
  );
}
