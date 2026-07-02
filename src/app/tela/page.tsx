'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, getToken } from '@/lib/auth';

const FRASES = [
  'Qualidade começa na produção.',
  'Cada peça conta. Cada detalhe importa.',
  'Segurança em primeiro lugar.',
  'Precisão é o nosso padrão.',
  'Flanges · Chapas · Tubos · Conexões · Laminados · Válvulas',
  'Excelência forjada a cada turno.',
  'Seu trabalho move a indústria.',
  'Comprometimento é a base do resultado.',
  'A qualidade de hoje é o cliente de amanhã.',
  'Produzir bem é respeitar quem confia em nós.',
];

export default function TelaDescanso() {
  const router = useRouter();
  const [fraseIdx, setFraseIdx] = useState(0);
  const [visivel, setVisivel] = useState(true);
  const [hora, setHora] = useState('');
  const [setor, setSetor] = useState<string | null>(null);
  const [nome, setNome] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace('/login'); return; }
    const user = getUser();
    if (!user) { router.replace('/login'); return; }
    // Admin vai para o dashboard, não para tela de descanso
    if (user.is_staff && user.perfil !== 'lider') { router.replace('/'); return; }
    setSetor(user.setor || null);
    setNome(user.nome || user.username || '');
  }, [router]);

  // Atualiza hora a cada segundo
  useEffect(() => {
    function tick() {
      setHora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Troca frase a cada 5s com fade
  useEffect(() => {
    const t = setInterval(() => {
      setVisivel(false);
      setTimeout(() => {
        setFraseIdx(i => (i + 1) % FRASES.length);
        setVisivel(true);
      }, 600);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const entrar = useCallback(() => {
    if (setor) router.push(`/setor/${setor}`);
    else router.push('/');
  }, [setor, router]);

  // Toca qualquer tecla ou clique para entrar
  useEffect(() => {
    const handler = () => entrar();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [entrar]);

  return (
    <div
      onClick={entrar}
      style={{
        minHeight: '100vh',
        width: '100%',
        background: 'linear-gradient(135deg, #0a1628 0%, #1a3a5c 50%, #0f2240 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        userSelect: 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Fundo decorativo */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)',
        backgroundSize: '20px 20px',
      }} />

      {/* Hora */}
      <div style={{
        position: 'absolute', top: 32, right: 40,
        fontSize: 48, fontWeight: 800, color: 'rgba(255,255,255,0.15)',
        fontFamily: 'monospace', letterSpacing: 2,
      }}>
        {hora}
      </div>

      {/* Logo / Nome empresa */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{
          width: 100, height: 100, borderRadius: '50%',
          background: 'linear-gradient(135deg, #c0c0c0, #e8e8e8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
          boxShadow: '0 0 40px rgba(192,192,192,0.3), 0 0 80px rgba(192,192,192,0.1)',
        }}>
          <span style={{ fontSize: 52, fontWeight: 900, color: '#1a3a5c', fontFamily: 'serif' }}>A</span>
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', letterSpacing: 4, textTransform: 'uppercase' }}>
          AÇOSVITAL
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 3, marginTop: 6, textTransform: 'uppercase' }}>
          Flanges · Chapas · Tubos · Conexões · Laminados · Válvulas
        </div>
      </div>

      {/* Frase rotativa */}
      <div style={{
        height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 64, padding: '0 32px', textAlign: 'center',
      }}>
        <p style={{
          fontSize: 20, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic',
          fontWeight: 300, letterSpacing: 0.5, margin: 0,
          opacity: visivel ? 1 : 0,
          transition: 'opacity 0.6s ease',
          maxWidth: 480,
        }}>
          "{FRASES[fraseIdx]}"
        </p>
      </div>

      {/* Setor + instrução */}
      <div style={{ textAlign: 'center' }}>
        {setor && (
          <div style={{
            fontSize: 13, fontWeight: 700, color: '#f59e0b',
            textTransform: 'uppercase', letterSpacing: 3, marginBottom: 20,
          }}>
            Setor: {setor.replace(/_/g, ' ')}
          </div>
        )}

        {/* Botão pulsar */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <div style={{
            position: 'absolute', inset: -12,
            borderRadius: '50%', background: 'rgba(245,158,11,0.15)',
            animation: 'pulse 2s ease-in-out infinite',
          }} />
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(245,158,11,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 30px rgba(245,158,11,0.4)',
          }}>
            <i className="bi bi-hand-index-thumb" style={{ fontSize: 32, color: '#fff' }} />
          </div>
        </div>

        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 20, letterSpacing: 1 }}>
          Toque para entrar
        </p>
        {nome && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
            Olá, {nome}
          </p>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.3); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
