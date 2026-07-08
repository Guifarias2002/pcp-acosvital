import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  try {
    // 1. Remove trigger antigo (pode ter estrutura errada do Django)
    await sql.unsafe(`DROP TRIGGER IF EXISTS trg_pedido_excluido ON producao_pedido;`);

    // 2. Remove tabela antiga (Django cria com colunas diferentes) e recria correta
    await sql.unsafe(`DROP TABLE IF EXISTS producao_pedido_excluido CASCADE;`);
    await sql.unsafe(`
      CREATE TABLE producao_pedido_excluido (
        id                   SERIAL PRIMARY KEY,
        pedido_id            INTEGER NOT NULL,
        numero_pedido_venda  VARCHAR(100),
        numero_op            VARCHAR(100),
        cliente              VARCHAR(200),
        prioridade           VARCHAR(50),
        status_pedido        VARCHAR(50),
        valor_total          NUMERIC(12,2),
        prazo_entrega        DATE,
        dados_json           JSONB,
        dados_filhos_json    JSONB,
        excluido_em          TIMESTAMPTZ DEFAULT NOW(),
        excluido_por_nome    VARCHAR(200) DEFAULT 'Sistema'
      );
    `);

    // 3. Índices
    await sql.unsafe(`CREATE INDEX idx_excluido_pedido_id ON producao_pedido_excluido(pedido_id);`);
    await sql.unsafe(`CREATE INDEX idx_excluido_em ON producao_pedido_excluido(excluido_em DESC);`);

    // 4. Função do trigger — inclui snapshot dos filhos (itens, parciais,
    //    movimentações, lotes, observações) ANTES do ON DELETE CASCADE apagá-los,
    //    para que o histórico completo do pedido sobreviva à exclusão.
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION fn_log_pedido_excluido()
      RETURNS TRIGGER AS $$
      DECLARE v_usuario text;
      DECLARE v_filhos jsonb;
      BEGIN
        v_usuario := current_setting('app.usuario_excluindo', true);
        IF v_usuario IS NULL OR v_usuario = '' THEN v_usuario := 'Sistema'; END IF;

        SELECT jsonb_build_object(
          'itens', (SELECT COALESCE(jsonb_agg(row_to_json(i)), '[]'::jsonb) FROM producao_itempedido i WHERE i.pedido_id = OLD.id),
          'parciais', (SELECT COALESCE(jsonb_agg(row_to_json(pa)), '[]'::jsonb) FROM producao_itemparcial pa WHERE pa.pedido_id = OLD.id),
          'movimentacoes', (SELECT COALESCE(jsonb_agg(row_to_json(m)), '[]'::jsonb) FROM producao_movimentacaoitem m WHERE m.pedido_id = OLD.id),
          'lotes', (SELECT COALESCE(jsonb_agg(row_to_json(l)), '[]'::jsonb) FROM producao_loteitem l WHERE l.item_pedido_id IN (SELECT id FROM producao_itempedido WHERE pedido_id = OLD.id)),
          'observacoes', (SELECT COALESCE(jsonb_agg(row_to_json(o)), '[]'::jsonb) FROM producao_item_observacao o WHERE o.item_id IN (SELECT id FROM producao_itempedido WHERE pedido_id = OLD.id))
        ) INTO v_filhos;

        INSERT INTO producao_pedido_excluido
          (pedido_id, numero_pedido_venda, numero_op, cliente, prioridade,
           status_pedido, valor_total, prazo_entrega, dados_json, dados_filhos_json, excluido_por_nome)
        VALUES (
          OLD.id, OLD.numero_pedido_venda, OLD.numero_op, OLD.cliente, OLD.prioridade,
          OLD.status, OLD.valor_total, OLD.prazo_entrega, row_to_json(OLD)::jsonb, v_filhos, v_usuario
        );
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 5. Trigger
    await sql.unsafe(`
      CREATE TRIGGER trg_pedido_excluido
        BEFORE DELETE ON producao_pedido
        FOR EACH ROW EXECUTE FUNCTION fn_log_pedido_excluido();
    `);

    return NextResponse.json({ ok: true, mensagem: 'Tabela producao_pedido_excluido recriada e trigger configurado.' });
  } catch (e) {
    console.error('[setup/excluidos]', e);
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
