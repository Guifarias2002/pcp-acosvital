'use client';
// Alerta GLOBAL pro Planejamento (Reginaldo): avisos de máquina dos operadores
// ainda não resolvidos (M60). Consulta leve a cada 30s (?contar=1) e mostra um
// selo fixo no canto que leva pro /planejamento. Chegou aviso novo → destaca.
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getToken } from '@/lib/auth';

export default function AlertaAvisosMaquina() {
  const router = useRouter();
  const pathname = usePathname();
  const [n, setN] = useState(0);
  const [novo, setNovo] = useState(false);
  const ultimo = useRef(0);

  useEffect(() => {
    let vivo = true;
    async function checar() {
      try {
        const r = await fetch('/api/maquinas/avisos?contar=1', { headers: { Authorization: `Bearer ${getToken() || ''}` } });
        if (!r.ok || !vivo) return;
        const qtd = Number((await r.json()).pendentes) || 0;
        if (qtd > ultimo.current) { setNovo(true); setTimeout(() => vivo && setNovo(false), 8000); }
        ultimo.current = qtd;
        setN(qtd);
      } catch { /* tenta de novo no próximo ciclo */ }
    }
    checar();
    const t = setInterval(checar, 30000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  if (!n) return null;
  const naTela = pathname === '/planejamento';
  return (
    <button onClick={() => { if (!naTela) router.push('/planejamento'); else window.scrollTo({ top: 0, behavior: 'smooth' }); }}
      title="Avisos de máquina dos operadores — clique pra ver no Planejamento"
      style={{
        position: 'fixed', left: 16, bottom: 16, zIndex: 1050, display: 'flex', alignItems: 'center', gap: 8,
        background: '#dc2626', color: '#fff', border: 'none', borderRadius: 12, padding: novo ? '12px 18px' : '9px 14px',
        fontSize: novo ? 15 : 13, fontWeight: 800, cursor: 'pointer', boxShadow: novo ? '0 0 0 6px rgba(220,38,38,.25), 0 8px 24px rgba(0,0,0,.25)' : '0 6px 18px rgba(0,0,0,.2)',
        transition: 'all .2s',
      }}>
      <i className="bi bi-tools" />{n} aviso{n > 1 ? 's' : ''} de máquina{novo ? ' — NOVO!' : ''}
    </button>
  );
}
