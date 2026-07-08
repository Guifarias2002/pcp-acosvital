import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/setup/hardening  — Só staff. Idempotente: pode rodar N vezes.
// ─────────────────────────────────────────────────────────────────────────────
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
      // Ignora erros de "já existe" que o IF NOT EXISTS/OR REPLACE não cobre
      if (msg.includes('already exists') || msg.includes('ja existe')) {
        log.push(`⟳ ${descricao} (já existia)`);
      } else {
        erros.push(`✗ ${descricao}: ${msg}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. NOT NULL OBRIGATÓRIOS — garante integridade dos campos críticos
  // ═══════════════════════════════════════════════════════════════════════════
  await run('NOT NULL: producao_pedido.numero_pedido_venda', `
    ALTER TABLE producao_pedido ALTER COLUMN numero_pedido_venda SET NOT NULL;
  `);
  await run('NOT NULL: producao_pedido.cliente', `
    ALTER TABLE producao_pedido ALTER COLUMN cliente SET NOT NULL;
  `);
  await run('NOT NULL: producao_pedido.prazo_entrega', `
    ALTER TABLE producao_pedido ALTER COLUMN prazo_entrega SET NOT NULL;
  `);
  await run('NOT NULL: producao_pedido.status', `
    ALTER TABLE producao_pedido ALTER COLUMN status SET NOT NULL;
  `);
  await run('NOT NULL: producao_pedido.prioridade', `
    ALTER TABLE producao_pedido ALTER COLUMN prioridade SET NOT NULL;
  `);
  await run('NOT NULL: producao_itempedido.pedido_id', `
    ALTER TABLE producao_itempedido ALTER COLUMN pedido_id SET NOT NULL;
  `);
  await run('NOT NULL: producao_itempedido.codigo', `
    ALTER TABLE producao_itempedido ALTER COLUMN codigo SET NOT NULL;
  `);
  await run('NOT NULL: producao_itempedido.status', `
    ALTER TABLE producao_itempedido ALTER COLUMN status SET NOT NULL;
  `);
  await run('NOT NULL: producao_itempedido.setor_atual', `
    ALTER TABLE producao_itempedido ALTER COLUMN setor_atual SET NOT NULL;
  `);
  await run('NOT NULL: producao_itempedido.quantidade', `
    ALTER TABLE producao_itempedido ALTER COLUMN quantidade SET NOT NULL;
  `);
  await run('NOT NULL: producao_pedido.numero_op', `
    ALTER TABLE producao_pedido ALTER COLUMN numero_op SET NOT NULL;
  `);
  await run('NOT NULL: producao_movimentacaoitem.item_id', `
    ALTER TABLE producao_movimentacaoitem ALTER COLUMN item_id SET NOT NULL;
  `);
  await run('NOT NULL: producao_movimentacaoitem.pedido_id', `
    ALTER TABLE producao_movimentacaoitem ALTER COLUMN pedido_id SET NOT NULL;
  `);
  await run('NOT NULL: producao_movimentacaoitem.status_novo', `
    ALTER TABLE producao_movimentacaoitem ALTER COLUMN status_novo SET NOT NULL;
  `);
  await run('NOT NULL: producao_entrega.pedido_id', `
    ALTER TABLE producao_entrega ALTER COLUMN pedido_id SET NOT NULL;
  `);
  await run('NOT NULL: producao_entrega.item_id', `
    ALTER TABLE producao_entrega ALTER COLUMN item_id SET NOT NULL;
  `);
  await run('NOT NULL: producao_entrega.numero_nf', `
    ALTER TABLE producao_entrega ALTER COLUMN numero_nf SET NOT NULL;
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. DEFAULTS — garante valores padrão consistentes
  // ═══════════════════════════════════════════════════════════════════════════
  await run('DEFAULT: producao_pedido.valor_total = 0', `
    ALTER TABLE producao_pedido ALTER COLUMN valor_total SET DEFAULT 0;
    UPDATE producao_pedido SET valor_total = 0 WHERE valor_total IS NULL;
    ALTER TABLE producao_pedido ALTER COLUMN valor_total SET NOT NULL;
  `);
  await run('DEFAULT: producao_itempedido.quantidade_entregue = 0', `
    ALTER TABLE producao_itempedido ALTER COLUMN quantidade_entregue SET DEFAULT 0;
    UPDATE producao_itempedido SET quantidade_entregue = 0 WHERE quantidade_entregue IS NULL;
  `);
  await run('DEFAULT: producao_itempedido.quantidade_pendente = quantidade', `
    UPDATE producao_itempedido SET quantidade_pendente = quantidade
    WHERE quantidade_pendente IS NULL;
  `);
  await run('DEFAULT: producao_pedido.criado_em = NOW()', `
    ALTER TABLE producao_pedido ALTER COLUMN criado_em SET DEFAULT NOW();
  `);
  await run('DEFAULT: producao_pedido.atualizado_em = NOW()', `
    ALTER TABLE producao_pedido ALTER COLUMN atualizado_em SET DEFAULT NOW();
  `);
  await run('DEFAULT: producao_itempedido.criado_em = NOW()', `
    ALTER TABLE producao_itempedido ALTER COLUMN criado_em SET DEFAULT NOW();
  `);
  await run('DEFAULT: producao_itempedido.unidade = un', `
    ALTER TABLE producao_itempedido ALTER COLUMN unidade SET DEFAULT 'un';
    UPDATE producao_itempedido SET unidade = 'un' WHERE unidade IS NULL OR unidade = '';
  `);
  await run('DEFAULT: producao_entrega.criado_em = NOW()', `
    ALTER TABLE producao_entrega ALTER COLUMN criado_em SET DEFAULT NOW();
  `);
  await run('DEFAULT: producao_movimentacaoitem.criado_em = NOW()', `
    ALTER TABLE producao_movimentacaoitem ALTER COLUMN criado_em SET DEFAULT NOW();
  `);
  await run('DEFAULT: producao_loteitem.criado_em = NOW()', `
    ALTER TABLE producao_loteitem ALTER COLUMN criado_em SET DEFAULT NOW();
  `);
  await run('DEFAULT: producao_loteitem.atualizado_em = NOW()', `
    ALTER TABLE producao_loteitem ALTER COLUMN atualizado_em SET DEFAULT NOW();
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. UNIQUE — evita duplicatas nos campos de negócio
  // ═══════════════════════════════════════════════════════════════════════════
  await run('UNIQUE: producao_pedido.numero_pedido_venda', `
    ALTER TABLE producao_pedido
      ADD CONSTRAINT uq_pedido_numero_venda UNIQUE (numero_pedido_venda);
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. CHECK CONSTRAINTS — bloqueia valores inválidos direto no banco
  // ═══════════════════════════════════════════════════════════════════════════
  await run('CHECK: producao_pedido.status válido', `
    ALTER TABLE producao_pedido ADD CONSTRAINT chk_pedido_status
      CHECK (status IN ('emitido','em_producao','entregue','bloqueado'));
  `);
  await run('CHECK: producao_pedido.prioridade válida', `
    ALTER TABLE producao_pedido ADD CONSTRAINT chk_pedido_prioridade
      CHECK (prioridade IN ('baixa','normal','alta','urgente'));
  `);
  await run('CHECK: producao_pedido.numero não vazio', `
    ALTER TABLE producao_pedido ADD CONSTRAINT chk_pedido_numero_nao_vazio
      CHECK (TRIM(numero_pedido_venda) <> '');
  `);
  await run('CHECK: producao_pedido.cliente não vazio', `
    ALTER TABLE producao_pedido ADD CONSTRAINT chk_pedido_cliente_nao_vazio
      CHECK (TRIM(cliente) <> '');
  `);
  await run('CHECK: producao_itempedido.status válido', `
    ALTER TABLE producao_itempedido ADD CONSTRAINT chk_item_status
      CHECK (status IN (
        'emitido','aguardando','recebido','em_andamento','pausado',
        'finalizado_setor','em_transito','entregue','bloqueado','reprovado','aprovado'
      ));
  `);
  await run('CHECK: producao_itempedido.quantidade > 0', `
    ALTER TABLE producao_itempedido ADD CONSTRAINT chk_item_qtd_positiva
      CHECK (quantidade > 0);
  `);
  await run('CHECK: producao_itempedido.quantidade_pendente >= 0', `
    ALTER TABLE producao_itempedido ADD CONSTRAINT chk_item_qtd_pendente_nao_negativa
      CHECK (quantidade_pendente >= 0);
  `);
  await run('CHECK: producao_itempedido.quantidade_entregue >= 0', `
    ALTER TABLE producao_itempedido ADD CONSTRAINT chk_item_qtd_entregue_nao_negativa
      CHECK (quantidade_entregue >= 0);
  `);
  await run('CHECK: producao_itempedido.valor_unitario >= 0', `
    ALTER TABLE producao_itempedido ADD CONSTRAINT chk_item_valor_nao_negativo
      CHECK (valor_unitario IS NULL OR valor_unitario >= 0);
  `);
  await run('CHECK: producao_itempedido.codigo não vazio', `
    ALTER TABLE producao_itempedido ADD CONSTRAINT chk_item_codigo_nao_vazio
      CHECK (TRIM(codigo) <> '');
  `);
  await run('CHECK: producao_loteitem.quantidade > 0', `
    ALTER TABLE producao_loteitem ADD CONSTRAINT chk_lote_qtd_positiva
      CHECK (quantidade > 0);
  `);
  await run('CHECK: producao_loteitem.status válido', `
    ALTER TABLE producao_loteitem ADD CONSTRAINT chk_lote_status
      CHECK (status IN ('em_producao','em_trabalho','concluido'));
  `);
  await run('CHECK: producao_entrega.numero_nf não vazio', `
    ALTER TABLE producao_entrega ADD CONSTRAINT chk_entrega_nf_nao_vazia
      CHECK (TRIM(numero_nf) <> '');
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. FOREIGN KEYS — integridade referencial com comportamento correto
  // ═══════════════════════════════════════════════════════════════════════════

  // producao_itempedido → producao_pedido (CASCADE: deletar pedido limpa itens)
  await run('FK: producao_itempedido.pedido_id → producao_pedido (CASCADE)', `
    ALTER TABLE producao_itempedido
      DROP CONSTRAINT IF EXISTS producao_itempedido_pedido_id_fkey,
      DROP CONSTRAINT IF EXISTS fk_item_pedido;
    ALTER TABLE producao_itempedido
      ADD CONSTRAINT fk_item_pedido
        FOREIGN KEY (pedido_id) REFERENCES producao_pedido(id)
        ON DELETE CASCADE ON UPDATE CASCADE;
  `);

  // producao_movimentacaoitem → producao_itempedido (CASCADE)
  await run('FK: producao_movimentacaoitem.item_id → producao_itempedido (CASCADE)', `
    ALTER TABLE producao_movimentacaoitem
      DROP CONSTRAINT IF EXISTS producao_movimentacaoitem_item_id_fkey,
      DROP CONSTRAINT IF EXISTS fk_mov_item;
    ALTER TABLE producao_movimentacaoitem
      ADD CONSTRAINT fk_mov_item
        FOREIGN KEY (item_id) REFERENCES producao_itempedido(id)
        ON DELETE CASCADE ON UPDATE CASCADE;
  `);

  // producao_movimentacaoitem → producao_pedido (CASCADE)
  await run('FK: producao_movimentacaoitem.pedido_id → producao_pedido (CASCADE)', `
    ALTER TABLE producao_movimentacaoitem
      DROP CONSTRAINT IF EXISTS producao_movimentacaoitem_pedido_id_fkey,
      DROP CONSTRAINT IF EXISTS fk_mov_pedido;
    ALTER TABLE producao_movimentacaoitem
      ADD CONSTRAINT fk_mov_pedido
        FOREIGN KEY (pedido_id) REFERENCES producao_pedido(id)
        ON DELETE CASCADE ON UPDATE CASCADE;
  `);

  // producao_movimentacaoitem → usuarios_usuario (SET NULL: preserva histórico)
  await run('FK: producao_movimentacaoitem.usuario_id → usuarios_usuario (SET NULL)', `
    ALTER TABLE producao_movimentacaoitem
      DROP CONSTRAINT IF EXISTS producao_movimentacaoitem_usuario_id_fkey,
      DROP CONSTRAINT IF EXISTS fk_mov_usuario;
    ALTER TABLE producao_movimentacaoitem
      ADD CONSTRAINT fk_mov_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios_usuario(id)
        ON DELETE SET NULL ON UPDATE CASCADE;
  `);

  // producao_loteitem → producao_itempedido (CASCADE)
  await run('FK: producao_loteitem.item_pedido_id → producao_itempedido (CASCADE)', `
    ALTER TABLE producao_loteitem
      DROP CONSTRAINT IF EXISTS producao_loteitem_item_pedido_id_fkey,
      DROP CONSTRAINT IF EXISTS fk_lote_item;
    ALTER TABLE producao_loteitem
      ADD CONSTRAINT fk_lote_item
        FOREIGN KEY (item_pedido_id) REFERENCES producao_itempedido(id)
        ON DELETE CASCADE ON UPDATE CASCADE;
  `);

  // producao_loteitem → usuarios_usuario (SET NULL)
  await run('FK: producao_loteitem.criado_por_id → usuarios_usuario (SET NULL)', `
    ALTER TABLE producao_loteitem
      DROP CONSTRAINT IF EXISTS producao_loteitem_criado_por_id_fkey,
      DROP CONSTRAINT IF EXISTS fk_lote_criado_por;
    ALTER TABLE producao_loteitem
      ADD CONSTRAINT fk_lote_criado_por
        FOREIGN KEY (criado_por_id) REFERENCES usuarios_usuario(id)
        ON DELETE SET NULL ON UPDATE CASCADE;
  `);
  await run('FK: producao_loteitem.recebido_por_id → usuarios_usuario (SET NULL)', `
    ALTER TABLE producao_loteitem
      DROP CONSTRAINT IF EXISTS producao_loteitem_recebido_por_id_fkey,
      DROP CONSTRAINT IF EXISTS fk_lote_recebido_por;
    ALTER TABLE producao_loteitem
      ADD CONSTRAINT fk_lote_recebido_por
        FOREIGN KEY (recebido_por_id) REFERENCES usuarios_usuario(id)
        ON DELETE SET NULL ON UPDATE CASCADE;
  `);

  // producao_entrega → producao_pedido (CASCADE)
  await run('FK: producao_entrega.pedido_id → producao_pedido (CASCADE)', `
    ALTER TABLE producao_entrega
      DROP CONSTRAINT IF EXISTS producao_entrega_pedido_id_fkey,
      DROP CONSTRAINT IF EXISTS fk_entrega_pedido;
    ALTER TABLE producao_entrega
      ADD CONSTRAINT fk_entrega_pedido
        FOREIGN KEY (pedido_id) REFERENCES producao_pedido(id)
        ON DELETE CASCADE ON UPDATE CASCADE;
  `);

  // producao_entrega → producao_itempedido (CASCADE)
  await run('FK: producao_entrega.item_id → producao_itempedido (CASCADE)', `
    ALTER TABLE producao_entrega
      DROP CONSTRAINT IF EXISTS producao_entrega_item_id_fkey,
      DROP CONSTRAINT IF EXISTS fk_entrega_item;
    ALTER TABLE producao_entrega
      ADD CONSTRAINT fk_entrega_item
        FOREIGN KEY (item_id) REFERENCES producao_itempedido(id)
        ON DELETE CASCADE ON UPDATE CASCADE;
  `);

  // producao_entrega → usuarios_usuario (SET NULL)
  await run('FK: producao_entrega.usuario_id → usuarios_usuario (SET NULL)', `
    ALTER TABLE producao_entrega
      DROP CONSTRAINT IF EXISTS producao_entrega_usuario_id_fkey,
      DROP CONSTRAINT IF EXISTS fk_entrega_usuario;
    ALTER TABLE producao_entrega
      ADD CONSTRAINT fk_entrega_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios_usuario(id)
        ON DELETE SET NULL ON UPDATE CASCADE;
  `);

  // producao_pedido → usuarios_usuario (SET NULL)
  await run('FK: producao_pedido.criado_por_id → usuarios_usuario (SET NULL)', `
    ALTER TABLE producao_pedido
      DROP CONSTRAINT IF EXISTS producao_pedido_criado_por_id_fkey,
      DROP CONSTRAINT IF EXISTS fk_pedido_criado_por;
    ALTER TABLE producao_pedido
      ADD CONSTRAINT fk_pedido_criado_por
        FOREIGN KEY (criado_por_id) REFERENCES usuarios_usuario(id)
        ON DELETE SET NULL ON UPDATE CASCADE;
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. INDEXES — performance em todas as queries críticas
  // ═══════════════════════════════════════════════════════════════════════════

  // producao_pedido
  await run('INDEX: producao_pedido(status)', `
    CREATE INDEX IF NOT EXISTS idx_pedido_status ON producao_pedido(status);
  `);
  await run('INDEX: producao_pedido(setor_atual)', `
    CREATE INDEX IF NOT EXISTS idx_pedido_setor ON producao_pedido(setor_atual);
  `);
  await run('INDEX: producao_pedido(prazo_entrega)', `
    CREATE INDEX IF NOT EXISTS idx_pedido_prazo ON producao_pedido(prazo_entrega);
  `);
  await run('INDEX: producao_pedido(prioridade)', `
    CREATE INDEX IF NOT EXISTS idx_pedido_prioridade ON producao_pedido(prioridade);
  `);
  await run('INDEX: producao_pedido(cliente lower)', `
    CREATE INDEX IF NOT EXISTS idx_pedido_cliente_lower ON producao_pedido(LOWER(cliente));
  `);
  await run('INDEX: producao_pedido(status, prazo_entrega) — dashboard composto', `
    CREATE INDEX IF NOT EXISTS idx_pedido_status_prazo ON producao_pedido(status, prazo_entrega);
  `);
  await run('INDEX PARCIAL: producao_pedido onde status != entregue', `
    CREATE INDEX IF NOT EXISTS idx_pedido_ativos ON producao_pedido(status, setor_atual)
      WHERE status != 'entregue';
  `);

  // producao_itempedido
  await run('INDEX: producao_itempedido(pedido_id)', `
    CREATE INDEX IF NOT EXISTS idx_item_pedido_id ON producao_itempedido(pedido_id);
  `);
  await run('INDEX: producao_itempedido(status)', `
    CREATE INDEX IF NOT EXISTS idx_item_status ON producao_itempedido(status);
  `);
  await run('INDEX: producao_itempedido(setor_atual)', `
    CREATE INDEX IF NOT EXISTS idx_item_setor ON producao_itempedido(setor_atual);
  `);
  await run('INDEX: producao_itempedido(status, setor_atual) — kanban', `
    CREATE INDEX IF NOT EXISTS idx_item_status_setor ON producao_itempedido(status, setor_atual);
  `);
  await run('INDEX PARCIAL: producao_itempedido onde não entregue', `
    CREATE INDEX IF NOT EXISTS idx_item_ativos ON producao_itempedido(pedido_id, setor_atual, status)
      WHERE status != 'entregue';
  `);

  // producao_movimentacaoitem
  await run('INDEX: producao_movimentacaoitem(item_id)', `
    CREATE INDEX IF NOT EXISTS idx_mov_item_id ON producao_movimentacaoitem(item_id);
  `);
  await run('INDEX: producao_movimentacaoitem(pedido_id)', `
    CREATE INDEX IF NOT EXISTS idx_mov_pedido_id ON producao_movimentacaoitem(pedido_id);
  `);
  await run('INDEX: producao_movimentacaoitem(criado_em DESC) — timeline', `
    CREATE INDEX IF NOT EXISTS idx_mov_criado_em ON producao_movimentacaoitem(criado_em DESC);
  `);
  await run('INDEX: producao_movimentacaoitem(usuario_id)', `
    CREATE INDEX IF NOT EXISTS idx_mov_usuario_id ON producao_movimentacaoitem(usuario_id);
  `);

  // producao_loteitem
  await run('INDEX: producao_loteitem(item_pedido_id)', `
    CREATE INDEX IF NOT EXISTS idx_lote_item_id ON producao_loteitem(item_pedido_id);
  `);
  await run('INDEX: producao_loteitem(setor_destino, status) — kanban chegando', `
    CREATE INDEX IF NOT EXISTS idx_lote_setor_status ON producao_loteitem(setor_destino, status);
  `);
  await run('INDEX PARCIAL: producao_loteitem em_producao', `
    CREATE INDEX IF NOT EXISTS idx_lote_em_producao ON producao_loteitem(setor_destino, item_pedido_id)
      WHERE status = 'em_producao';
  `);

  // producao_entrega
  await run('INDEX: producao_entrega(item_id)', `
    CREATE INDEX IF NOT EXISTS idx_entrega_item_id ON producao_entrega(item_id);
  `);
  await run('INDEX: producao_entrega(pedido_id)', `
    CREATE INDEX IF NOT EXISTS idx_entrega_pedido_id ON producao_entrega(pedido_id);
  `);
  await run('INDEX: producao_entrega(criado_em DESC)', `
    CREATE INDEX IF NOT EXISTS idx_entrega_criado_em ON producao_entrega(criado_em DESC);
  `);

  // usuarios_usuario
  await run('INDEX: usuarios_usuario(username)', `
    CREATE INDEX IF NOT EXISTS idx_usuario_username ON usuarios_usuario(username);
  `);
  await run('INDEX: usuarios_usuario(setor)', `
    CREATE INDEX IF NOT EXISTS idx_usuario_setor ON usuarios_usuario(setor);
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. TRIGGER: auto-atualizar atualizado_em em UPDATE
  // ═══════════════════════════════════════════════════════════════════════════
  await run('FUNCTION: fn_set_atualizado_em()', `
    CREATE OR REPLACE FUNCTION fn_set_atualizado_em()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.atualizado_em := NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await run('TRIGGER: producao_pedido atualizado_em', `
    DROP TRIGGER IF EXISTS trg_pedido_atualizado_em ON producao_pedido;
    CREATE TRIGGER trg_pedido_atualizado_em
      BEFORE UPDATE ON producao_pedido
      FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();
  `);
  await run('TRIGGER: producao_itempedido atualizado_em', `
    DROP TRIGGER IF EXISTS trg_item_atualizado_em ON producao_itempedido;
    CREATE TRIGGER trg_item_atualizado_em
      BEFORE UPDATE ON producao_itempedido
      FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();
  `);
  await run('TRIGGER: producao_loteitem atualizado_em', `
    DROP TRIGGER IF EXISTS trg_lote_atualizado_em ON producao_loteitem;
    CREATE TRIGGER trg_lote_atualizado_em
      BEFORE UPDATE ON producao_loteitem
      FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. TRIGGER: recalcular valor_total do pedido automaticamente
  //    Dispara sempre que um item é inserido, atualizado (qtd/valor) ou deletado
  // ═══════════════════════════════════════════════════════════════════════════
  await run('FUNCTION: fn_recalc_valor_total()', `
    CREATE OR REPLACE FUNCTION fn_recalc_valor_total()
    RETURNS TRIGGER AS $$
    DECLARE
      v_pedido_id INTEGER;
    BEGIN
      v_pedido_id := COALESCE(NEW.pedido_id, OLD.pedido_id);
      UPDATE producao_pedido
      SET valor_total = COALESCE(
        (SELECT SUM(quantidade * COALESCE(valor_unitario, 0))
         FROM producao_itempedido
         WHERE pedido_id = v_pedido_id),
        0
      )
      WHERE id = v_pedido_id;
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `);

  await run('TRIGGER: recalc valor_total em INSERT/UPDATE/DELETE de itens', `
    DROP TRIGGER IF EXISTS trg_item_recalc_valor ON producao_itempedido;
    CREATE TRIGGER trg_item_recalc_valor
      AFTER INSERT OR UPDATE OF quantidade, valor_unitario OR DELETE
      ON producao_itempedido
      FOR EACH ROW EXECUTE FUNCTION fn_recalc_valor_total();
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. RECALCULAR valor_total em todos os pedidos existentes
  // ═══════════════════════════════════════════════════════════════════════════
  await run('RECALC: atualiza valor_total de todos os pedidos existentes', `
    UPDATE producao_pedido p
    SET valor_total = COALESCE(
      (SELECT SUM(i.quantidade * COALESCE(i.valor_unitario, 0))
       FROM producao_itempedido i
       WHERE i.pedido_id = p.id),
      0
    );
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. TRIGGER: manter consistência de quantidade_pendente
  //     Nunca deixar quantidade_pendente > quantidade nem < 0
  // ═══════════════════════════════════════════════════════════════════════════
  await run('FUNCTION: fn_valida_quantidades()', `
    CREATE OR REPLACE FUNCTION fn_valida_quantidades()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Garante que pendente não excede o total
      IF NEW.quantidade_pendente > NEW.quantidade THEN
        NEW.quantidade_pendente := NEW.quantidade;
      END IF;
      -- Garante que pendente não fica negativo
      IF NEW.quantidade_pendente < 0 THEN
        NEW.quantidade_pendente := 0;
      END IF;
      -- Garante que entregue não excede o total
      IF NEW.quantidade_entregue > NEW.quantidade THEN
        NEW.quantidade_entregue := NEW.quantidade;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await run('TRIGGER: valida quantidades em producao_itempedido', `
    DROP TRIGGER IF EXISTS trg_item_valida_qtd ON producao_itempedido;
    CREATE TRIGGER trg_item_valida_qtd
      BEFORE INSERT OR UPDATE OF quantidade, quantidade_pendente, quantidade_entregue
      ON producao_itempedido
      FOR EACH ROW EXECUTE FUNCTION fn_valida_quantidades();
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. TRIGGER: log de auditoria de mudanças de status de item
  //     Garante que toda transição de status fica registrada em movimentacao
  // ═══════════════════════════════════════════════════════════════════════════
  await run('FUNCTION: fn_audit_status_item()', `
    CREATE OR REPLACE FUNCTION fn_audit_status_item()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Só registra se o status realmente mudou
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO producao_movimentacaoitem
          (item_id, pedido_id, usuario_id, setor_origem, setor_destino,
           status_anterior, status_novo, observacao, criado_em)
        VALUES (
          NEW.id,
          NEW.pedido_id,
          NULL,   -- usuário desconhecido neste contexto; a app já registra com usuário
          OLD.setor_atual,
          NEW.setor_atual,
          OLD.status,
          NEW.status,
          '[auto] mudança de status via banco',
          NOW()
        )
        ON CONFLICT DO NOTHING;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  // Nota: não ativamos este trigger por padrão pois a aplicação já registra
  // movimentações com o usuário correto. Deixamos a função disponível caso queira ativar.
  // Para ativar: CREATE TRIGGER trg_item_audit_status AFTER UPDATE OF status ON producao_itempedido ...

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. VIEW útil: visão consolidada de pedidos com totais (para relatórios)
  // ═══════════════════════════════════════════════════════════════════════════
  await run('VIEW: vw_pedidos_resumo', `
    CREATE OR REPLACE VIEW vw_pedidos_resumo AS
    SELECT
      p.id,
      p.numero_pedido_venda,
      p.numero_op,
      p.cliente,
      p.vendedor,
      p.prazo_entrega,
      p.prioridade,
      p.status,
      p.setor_atual,
      p.roteiro_base,
      p.valor_total,
      p.criado_em,
      p.atualizado_em,
      COUNT(i.id)                                        AS total_itens,
      COUNT(i.id) FILTER (WHERE i.status = 'entregue')   AS itens_entregues,
      COUNT(i.id) FILTER (WHERE i.status != 'entregue')  AS itens_pendentes,
      ROUND(
        100.0 * COUNT(i.id) FILTER (WHERE i.status = 'entregue')
        / NULLIF(COUNT(i.id), 0), 1
      )                                                  AS pct_concluido,
      p.prazo_entrega < CURRENT_DATE AND p.status != 'entregue' AS atrasado,
      CURRENT_DATE - p.prazo_entrega AS dias_atraso
    FROM producao_pedido p
    LEFT JOIN producao_itempedido i ON i.pedido_id = p.id
    GROUP BY p.id;
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. VIEW: visão de itens em produção por setor (para kanban e dashboard)
  // ═══════════════════════════════════════════════════════════════════════════
  await run('VIEW: vw_itens_producao', `
    CREATE OR REPLACE VIEW vw_itens_producao AS
    SELECT
      i.id,
      i.pedido_id,
      p.numero_pedido_venda,
      p.cliente,
      p.prazo_entrega,
      p.prioridade,
      i.codigo,
      i.descricao,
      i.quantidade,
      i.quantidade_pendente,
      i.quantidade_entregue,
      i.unidade,
      i.valor_unitario,
      i.status,
      i.setor_atual,
      i.roteiro_proprio,
      p.roteiro_base,
      p.prazo_entrega < CURRENT_DATE AND i.status != 'entregue' AS atrasado
    FROM producao_itempedido i
    JOIN producao_pedido p ON p.id = i.pedido_id
    WHERE i.status != 'entregue';
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. AUDITORIA DE ACESSO — LGPD / TI: log estruturado de todas as ações
  // ═══════════════════════════════════════════════════════════════════════════
  await run('TABLE: auditoria_acesso (log estruturado)', `
    CREATE TABLE IF NOT EXISTS auditoria_acesso (
      id          BIGSERIAL PRIMARY KEY,
      usuario_id  INTEGER,
      username    TEXT NOT NULL,
      metodo      TEXT NOT NULL,
      rota        TEXT NOT NULL,
      acao        TEXT,
      ip          TEXT,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await run('INDEX: auditoria_acesso(usuario_id)', `
    CREATE INDEX IF NOT EXISTS idx_audit_acesso_usuario ON auditoria_acesso(usuario_id);
  `);
  await run('INDEX: auditoria_acesso(criado_em DESC)', `
    CREATE INDEX IF NOT EXISTS idx_audit_acesso_criado_em ON auditoria_acesso(criado_em DESC);
  `);
  await run('INDEX: auditoria_acesso(rota, criado_em DESC)', `
    CREATE INDEX IF NOT EXISTS idx_audit_acesso_rota ON auditoria_acesso(rota, criado_em DESC);
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // 15. ANALYZE — atualiza estatísticas do planner após criação de indexes
  // ═══════════════════════════════════════════════════════════════════════════
  await run('ANALYZE: atualiza estatísticas do planner', `
    ANALYZE producao_pedido;
    ANALYZE producao_itempedido;
    ANALYZE producao_movimentacaoitem;
    ANALYZE producao_loteitem;
    ANALYZE producao_entrega;
  `);

  return NextResponse.json({
    ok: erros.length === 0,
    aplicados: log.length,
    erros: erros.length,
    log,
    ...(erros.length > 0 ? { erros } : {}),
  });
}
