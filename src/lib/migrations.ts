/**
 * Migrations incrementais — roda automaticamente no startup do servidor.
 * Cada bloco é idempotente e falha silenciosamente para não derrubar o app.
 */
import sql from './db';

let ran = false;

export async function runMigrations() {
  if (ran) return;
  ran = true;

  // M01: colunas de timing em producao_itemparcial
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS iniciado_em  TIMESTAMPTZ`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS concluido_em TIMESTAMPTZ`).catch(() => {});

  // M02: status CHECK — drop qualquer constraint existente e recria com valores completos
  try {
    const rows = await sql`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'producao_itemparcial'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%status%'
    `;
    for (const row of rows) {
      await sql.unsafe(`ALTER TABLE producao_itemparcial DROP CONSTRAINT IF EXISTS "${row.conname}"`).catch(() => {});
    }
    await sql.unsafe(`
      ALTER TABLE producao_itemparcial
      ADD CONSTRAINT producao_itemparcial_status_check
      CHECK (status IN ('em_aberto','recebido','em_andamento','em_transito','pausado','finalizado_setor','concluida','cancelada'))
    `).catch((e) => {
      // Se isto falhar, a tabela fica sem CHECK de status ate o proximo restart
      // rodar a migration de novo - deixa visivel no log em vez de falhar em silencio.
      console.error('[migrations] falha ao recriar producao_itemparcial_status_check:', e);
    });
  } catch (e) {
    console.error('[migrations] M02 (status CHECK) falhou:', e);
  }

  // M04: flag de retrabalho em parciais devolvidas
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS retrabalho BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS motivo_retrabalho TEXT`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS devolvido_de TEXT`).catch(() => {});

  // M03: backfill timing
  await sql`
    UPDATE producao_itemparcial SET concluido_em = atualizado_em
    WHERE status = 'concluida' AND concluido_em IS NULL
  `.catch(() => {});
  await sql`
    UPDATE producao_itemparcial SET iniciado_em = criado_em
    WHERE status IN ('em_andamento','pausado','finalizado_setor','concluida') AND iniciado_em IS NULL
  `.catch(() => {});

  // M05: anexos de entrega no pedido
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS nota_url TEXT`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS canhoto_url TEXT`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS anexo_pendente BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});

  // M06: múltiplos desenhos por item
  await sql.unsafe(`ALTER TABLE producao_itempedido ADD COLUMN IF NOT EXISTS desenhos TEXT[] NOT NULL DEFAULT '{}'`).catch(() => {});

  // M07: índices críticos de performance — elimina seq scans nas queries mais pesadas
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_itempedido_pedido_id        ON producao_itempedido (pedido_id)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_itempedido_setor_status      ON producao_itempedido (setor_atual, status)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_itemparcial_item_id          ON producao_itemparcial (item_pedido_id)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_itemparcial_setor_status     ON producao_itemparcial (setor_atual, status)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_itemparcial_item_setor_status ON producao_itemparcial (item_pedido_id, setor_atual, status)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_movimentacao_item_id         ON producao_movimentacaoitem (item_id)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_movimentacao_criado_em       ON producao_movimentacaoitem (criado_em DESC)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pedido_status                ON producao_pedido (status)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pedido_prazo_status          ON producao_pedido (prazo_entrega, status)`).catch(() => {});

  // M08: múltiplos desenhos por pedido (mesmo padrão do M06 para itens) -
  // migra o desenho_url único existente (se houver) para o array antes de
  // o front-end passar a depender só de "desenhos".
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS desenhos TEXT[] NOT NULL DEFAULT '{}'`).catch(() => {});
  await sql`
    UPDATE producao_pedido SET desenhos = ARRAY[desenho_url]
    WHERE desenho_url IS NOT NULL AND desenhos = '{}'
  `.catch(() => {});

  // M09: múltiplos setores por usuário. Mantém a coluna `setor` como setor
  // principal (redirect da raiz / link) e adiciona `setores` com a lista completa
  // de setores que o usuário pode acessar. Backfill: quem já tem setor único
  // passa a ter setores = [setor], deixando a UI e as checagens consistentes.
  // Quando `setores` está vazio, o sistema cai no comportamento antigo ([setor]).
  await sql.unsafe(`ALTER TABLE usuarios_usuario ADD COLUMN IF NOT EXISTS setores TEXT[] NOT NULL DEFAULT '{}'`).catch(() => {});
  await sql`
    UPDATE usuarios_usuario SET setores = ARRAY[setor]
    WHERE setor IS NOT NULL AND setor <> '' AND setores = '{}'
  `.catch(() => {});

  // M10: peso da embalagem por parcial — lista de pesos (kg), um por pallet.
  // O setor de Embalagem registra 1+ pallets; o total é a soma. Vazio = não informado.
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS pesos_pallets NUMERIC(12,3)[] NOT NULL DEFAULT '{}'`).catch(() => {});
  // M10b: nome/numero de identificacao de cada pallet (alinhado por indice com
  // pesos_pallets). Vazio = pallet sem identificacao (mostra "Palet N" pelo indice).
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS nomes_pallets TEXT[] NOT NULL DEFAULT '{}'`).catch(() => {});

  // M11: resumo consolidado da Embalagem por PEDIDO (opcional; complementa o peso
  // por parcial). Colunas simples: identificação do pallet, nº de pallets, peso
  // total (kg) e total de unidades (peças). Vazio/0 = não informado.
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS embalagem_identificacao TEXT`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS embalagem_qtd_pallets INTEGER`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS embalagem_peso_total NUMERIC(12,3)`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS embalagem_total_unidades INTEGER`).catch(() => {});

  // M11: acesso somente-leitura por usuário. Quando true, o usuário vê tudo
  // normalmente (inclusive telas administrativas e valores) mas NÃO pode fazer
  // nenhuma alteração — o bloqueio é aplicado de forma central em `autenticar`,
  // que barra qualquer método de escrita (POST/PUT/PATCH/DELETE).
  await sql.unsafe(`ALTER TABLE usuarios_usuario ADD COLUMN IF NOT EXISTS somente_leitura BOOLEAN NOT NULL DEFAULT false`).catch(() => {});

  // M12: fotos por parcial. Galeria única que acompanha a peça — tirada na
  // Embalagem e visível também na Logística e no detalhe do pedido. Guarda os
  // storage paths (Supabase Storage), mesmo padrão dos
  // desenhos (TEXT[]). Como é a mesma linha da parcial que avança de setor,
  // as fotos "viajam" junto (igual pesos_pallets).
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS fotos TEXT[] NOT NULL DEFAULT '{}'`).catch(() => {});

  // M13: vendedor com visão de TODOS os pedidos (não só os próprios). Usado
  // para contas compartilhadas de visualização (ex.: login usado por várias
  // pessoas só pra acompanhar "Todos os Pedidos", sem ser vendedor de verdade).
  // Continua perfil 'vendedor' (não-staff, somente_leitura forçado, preso à
  // aba /pedidos) — só remove o filtro "só vê os próprios".
  await sql.unsafe(`ALTER TABLE usuarios_usuario ADD COLUMN IF NOT EXISTS ve_todos_pedidos BOOLEAN NOT NULL DEFAULT false`).catch(() => {});

  // M14: fábrica do item (Flanges/Caldeiraria), fixa e explícita por item —
  // antes disso era só inferida pelo roteiro_proprio, o que quebrava quando o
  // item ficava só com 'emissao' no roteiro (nenhum setor da fábrica ainda
  // selecionado): 'emissao' não pertence a nenhuma fábrica, então a inferência
  // caía sempre no fallback errado (Flanges). Backfill 'flange' pra todo item
  // já existente, já que até aqui só a fábrica de Flanges existia.
  await sql.unsafe(`ALTER TABLE producao_itempedido ADD COLUMN IF NOT EXISTS fabrica VARCHAR(20) NOT NULL DEFAULT 'flange'`).catch(() => {});
}
