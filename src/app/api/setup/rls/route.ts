import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const log: string[] = [];
  const erros: string[] = [];

  async function run(descricao: string, query: string) {
    try {
      await sql.unsafe(query);
      log.push(`✓ ${descricao}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('already exists')) {
        log.push(`⟳ ${descricao} (já existia)`);
      } else {
        erros.push(`✗ ${descricao}: ${msg}`);
      }
    }
  }

  const tabelas = [
    'producao_pedido',
    'producao_itempedido',
    'producao_movimentacaoitem',
    'producao_entrega',
    'producao_loteitem',
    'producao_setor',
    'producao_pedido_excluido',
    'producao_divergencia',
    'producao_item_observacao',
    'producao_catalogo_material',
    'usuarios_usuario',
    'auditoria_login',
  ];

  // 1. Habilita RLS em todas as tabelas
  for (const t of tabelas) {
    await run(
      `RLS habilitado em ${t}`,
      `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`
    );
  }

  // 2. Remove políticas antigas para recriar limpas (idempotente)
  for (const t of tabelas) {
    try {
      const policies = await sql<{ policyname: string }[]>`
        SELECT policyname FROM pg_policies WHERE tablename = ${t} AND schemaname = 'public'
      `;
      for (const p of policies) {
        await sql.unsafe(`DROP POLICY IF EXISTS "${p.policyname}" ON ${t}`);
      }
    } catch { /* ignore */ }
  }

  // 3. Cria política que bloqueia acesso via PostgREST (anon/authenticated do Supabase)
  //    O sistema usa conexão direta ao PostgreSQL (não PostgREST), então isso não afeta nada
  for (const t of tabelas) {
    await run(
      `Política de bloqueio público em ${t}`,
      `CREATE POLICY "bloquear_acesso_publico" ON ${t}
       AS RESTRICTIVE
       FOR ALL
       TO anon, authenticated
       USING (false)
       WITH CHECK (false)`
    );
  }

  // 4. Views: revogar acesso público (não têm RLS, mas podemos revogar grants)
  for (const v of ['vw_pedidos_resumo', 'vw_itens_producao']) {
    await run(
      `Revogar acesso público à view ${v}`,
      `REVOKE ALL ON ${v} FROM anon, authenticated`
    );
  }

  const ok = erros.length === 0;
  return NextResponse.json({
    ok,
    mensagem: ok
      ? `RLS habilitado em ${tabelas.length} tabelas. Acesso público bloqueado.`
      : `Concluído com ${erros.length} erro(s)`,
    log: [...log, ...erros],
  });
}
