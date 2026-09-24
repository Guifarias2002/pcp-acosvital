import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';
import { b2GetUploadUrl, B2_CONFIGURADO } from '@/lib/b2';
import { podeMexerNoDesenho, nomeArquivoDesenho } from '@/lib/desenhoAcesso';

export const dynamic = 'force-dynamic';

// Envio DIRETO do desenho (qualquer tamanho): o arquivo vai do navegador pro
// Backblaze sem passar pela Vercel (que limita a 4,5 MB por requisição).
//   { acao: 'iniciar', nome, tipo } → { uploadUrl, authorizationToken, fileName }
//   { acao: 'confirmar', fileName }  → grava "b2:<fileName>" nos desenhos do pedido
// Precisa de regra de CORS no bucket liberando os domínios do sistema.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  const pedidoId = Number(params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 });
  if (!(await podeMexerNoDesenho(user, pedidoId))) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });
  if (!B2_CONFIGURADO) return NextResponse.json({ erro: 'Armazenamento de anexos não configurado.' }, { status: 500 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 }); }

  if (b.acao === 'iniciar') {
    const nome = typeof b.nome === 'string' ? b.nome : 'desenho';
    const tipo = typeof b.tipo === 'string' ? b.tipo : 'application/octet-stream';
    try {
      const up = await b2GetUploadUrl();
      return NextResponse.json({ ...up, fileName: nomeArquivoDesenho(pedidoId, nome, tipo) });
    } catch (e) {
      console.error('[desenho/direto iniciar]', e);
      return NextResponse.json({ erro: 'Não foi possível autorizar o envio no armazenamento.' }, { status: 502 });
    }
  }

  if (b.acao === 'confirmar') {
    const fileName = typeof b.fileName === 'string' ? b.fileName : '';
    // Só aceita nome gerado por nós PRA ESTE pedido.
    if (!fileName.startsWith(`pedido_${pedidoId}_desenho_`) || fileName.includes('/') || fileName.length > 200)
      return NextResponse.json({ erro: 'Arquivo inválido' }, { status: 400 });
    const path = `b2:${fileName}`;
    await sql`
      UPDATE producao_pedido
      SET desenhos = CASE WHEN ${path} = ANY(COALESCE(desenhos, '{}')) THEN desenhos ELSE array_append(COALESCE(desenhos, '{}'), ${path}) END
      WHERE id = ${pedidoId}
    `;
    return NextResponse.json({ ok: true, path });
  }

  return NextResponse.json({ erro: 'Ação inválida' }, { status: 400 });
}
