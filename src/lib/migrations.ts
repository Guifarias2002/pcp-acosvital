/**
 * Migrations incrementais — roda automaticamente no startup do servidor.
 * Cada bloco é idempotente e falha silenciosamente para não derrubar o app.
 */
import postgres from 'postgres';
import sql from './db';
import { SETORES_CALDEIRARIA_MENU } from './types';

// Execução memoizada: várias chamadas concorrentes (ex.: várias pessoas logando
// no mesmo cold start logo após um deploy) compartilham a MESMA execução e todas
// esperam ela terminar — sem corrida e sem re-rodar. Um processo novo (novo
// deploy/cold start) começa do zero (a variável nasce null de novo).
let migrationPromise: Promise<void> | null = null;

// Lock id arbitrário (qualquer bigint serve, só precisa ser o mesmo em toda
// instância). Evita que um deploy — que sobe várias instâncias ao mesmo tempo —
// gere uma corrida de N execuções concorrentes das mesmas ALTER TABLE/CREATE
// INDEX: cada uma exige lock exclusivo mesmo sendo IF NOT EXISTS, e a fila
// resultante já travou o banco inteiro (via SELECTs presos em ClientRead que
// ficaram atrás dela). Com o advisory lock, só a primeira instância a chegar
// executa de fato; as demais tentam pegar o lock, falham na hora (tentativa
// não-bloqueante) e saem sem disputar lock de tabela nenhum.
const MIGRATION_LOCK_ID = 7274123;

// Versão do schema. SEM isto, TODA instância nova (cada cold start da Vercel)
// re-executava os ~41 passos de DDL (ALTER/CREATE IF NOT EXISTS) — mesmo já
// aplicados, cada ALTER pega ACCESS EXCLUSIVE nas tabelas quentes
// (producao_itempedido/pedido) e a fila de locks travava o banco inteiro,
// deixando TODO o sistema lento. Agora gravamos a versão aplicada em
// producao_config; se o banco já está nela, pulamos o DDL por completo.
// AO ADICIONAR UM NOVO PASSO (Mxx), INCREMENTE ESTE NÚMERO pra ele rodar 1×.
const SCHEMA_VERSION = 58;

export function runMigrations(): Promise<void> {
  if (!migrationPromise) migrationPromise = doRunMigrations();
  return migrationPromise;
}

async function doRunMigrations(): Promise<void> {
  try {
    await sql.begin(async (sql) => {
      const [{ locked }] = await sql`SELECT pg_try_advisory_xact_lock(${MIGRATION_LOCK_ID}) AS locked`;
      if (!locked) return; // outra instância já está migrando (ou já migrou) — não competir por lock de tabela

      // Fast-path: schema já na versão atual → não roda nenhum DDL de novo.
      const ver = await sql`SELECT valor FROM producao_config WHERE chave = 'schema_version'`
        .catch(() => [] as { valor: string }[]);
      if (ver.length && Number(ver[0].valor) >= SCHEMA_VERSION) return;

      await runMigrationSteps(sql);

      // Marca a versão aplicada (producao_config é criada no M33 acima).
      await sql`
        INSERT INTO producao_config (chave, valor, atualizado_em)
        VALUES ('schema_version', ${String(SCHEMA_VERSION)}, NOW())
        ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()
      `.catch(() => {});
    });
  } catch (e) {
    console.error('[migrations] runMigrations falhou:', e);
    // Zera a memoização pra permitir uma nova tentativa numa próxima chamada
    // (ex.: o login com auto-recuperação abaixo) — senão um erro transitório de
    // conexão travaria a migração pro resto da vida do processo.
    migrationPromise = null;
  }
}

async function runMigrationSteps(sql: postgres.TransactionSql) {
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

  // M15: idempotência de mutações. Protege contra DUPLICAÇÃO quando a internet
  // cai: se o servidor processa mas a resposta se perde, o cliente reenvia a
  // MESMA ação com a mesma `chave` (header Idempotency-Key). O servidor devolve
  // o resultado guardado em vez de executar de novo. `resultado`/`status_http`
  // ficam nulos enquanto a original está em andamento (reenvio recebe 409).
  // Limpeza por TTL curto (a chave só precisa viver alguns segundos/minutos).
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS producao_idempotencia (
      chave       TEXT PRIMARY KEY,
      usuario_id  INTEGER,
      metodo      TEXT,
      caminho     TEXT,
      status_http INTEGER,
      resultado   JSONB,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_idempotencia_criado_em ON producao_idempotencia (criado_em)`).catch(() => {});
  // Higiene: remove chaves com mais de 1h (bem acima do timeout do cliente).
  await sql`DELETE FROM producao_idempotencia WHERE criado_em < NOW() - INTERVAL '1 hour'`.catch(() => {});

  // M16: múltiplos canhotos por PEDIDO. Antes só havia canhoto_url (um único).
  // A entrega do pedido completo (Logística) permite anexar 1+ canhotos de uma
  // vez; guardamos a lista de URLs (Supabase Storage) aqui. canhoto_url continua
  // preenchido com o primeiro, para não quebrar a métrica de "canhotos assinados"
  // da tela de Entregues nem os relatórios que já leem canhoto_url.
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS canhotos TEXT[] NOT NULL DEFAULT '{}'`).catch(() => {});

  // M17: sub-itens (receita) para produtos compostos da Caldeiraria — ex: um
  // "Tê de Redução" é montado a partir de 3 flanges + 1 tubo, cada um fabricado
  // e rastreado separadamente pelos próprios setores até voltar pra montagem
  // final. item_pai_id aponta pro item "receita" que esse sub-item compõe;
  // ON DELETE SET NULL porque itens quase nunca são apagados de verdade (viram
  // inativo), mas se acontecer não deve arrastar os filhos junto.
  await sql.unsafe(`ALTER TABLE producao_itempedido ADD COLUMN IF NOT EXISTS item_pai_id INTEGER REFERENCES producao_itempedido(id) ON DELETE SET NULL`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_itempedido_pai ON producao_itempedido (item_pai_id)`).catch(() => {});

  // M18: anexos por item (desenho/OP/outro) — usado ao montar a receita de um
  // item composto: cada componente (ex: flange, tubo) pode ter seu próprio
  // desenho técnico, cópia da OP ou outro arquivo, diferente do array simples
  // `desenhos` (só um tipo, sem metadado de quem/quando anexou).
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS producao_item_anexo (
      id SERIAL PRIMARY KEY,
      item_pedido_id INTEGER NOT NULL REFERENCES producao_itempedido(id) ON DELETE CASCADE,
      tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('desenho','op','outro')),
      nome_arquivo TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      criado_por_id INTEGER REFERENCES usuarios_usuario(id) ON DELETE SET NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_item_anexo_item ON producao_item_anexo (item_pedido_id)`).catch(() => {});

  // M19: checklist de processo por etapa da Caldeiraria, parametrizado por
  // "tipo de produto" (Vaso de Pressão, Tanque, Skid, etc). tipo_produto fica
  // NULL pra qualquer item que não seja dessa feature (Flanges, itens antigos)
  // — o gate de checklist só ativa quando o campo está preenchido, então isso
  // nunca afeta nada fora da Caldeiraria nem quebra item já em andamento.
  await sql.unsafe(`ALTER TABLE producao_itempedido ADD COLUMN IF NOT EXISTS tipo_produto VARCHAR(30)`).catch(() => {});

  // producao_checklist_processo: histórico INSERT-ONLY (nunca dá UPDATE) dos
  // checklists de cada etapa — ao contrário de producao_itemparcial.observacao,
  // que é sobrescrita a cada "receber" (bug encontrado nesta auditoria: um
  // segundo checklist apagava o primeiro). Cada submissão vira uma linha nova,
  // formando a "Ficha de Fabricação" completa do item, etapa por etapa.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS producao_checklist_processo (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES producao_itempedido(id) ON DELETE CASCADE,
      parcial_id INTEGER REFERENCES producao_itemparcial(id) ON DELETE SET NULL,
      pedido_id INTEGER NOT NULL REFERENCES producao_pedido(id) ON DELETE CASCADE,
      setor VARCHAR(50) NOT NULL,
      tipo_produto VARCHAR(30),
      respostas JSONB NOT NULL,
      usuario_id INTEGER REFERENCES usuarios_usuario(id) ON DELETE SET NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_checklist_processo_item ON producao_checklist_processo (item_id)`).catch(() => {});

  // M20: permissão individual pra desfazer recebimento — hoje só quem tem
  // perfil "administrador" pode; alguns líderes (ex: Gilmar, usinagem)
  // precisam disso também, sem virar administrador completo (que daria acesso
  // a financeiro, gestão de usuários, etc). Default false: ninguém ganha a
  // permissão de graça, precisa ser marcado explicitamente por um admin.
  await sql.unsafe(`ALTER TABLE usuarios_usuario ADD COLUMN IF NOT EXISTS pode_desfazer_recebimento BOOLEAN NOT NULL DEFAULT false`).catch(() => {});

  // M21: máquina + operador ao iniciar produção na Usinagem/Furação — pra medir
  // depois tempo de máquina e peças feitas por máquina/operador (Análise PCP).
  // Não substitui o usuário logado (usuario_id em producao_movimentacaoitem):
  // quem inicia pode ser diferente de quem efetivamente opera a máquina.
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS maquina VARCHAR(60)`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS operador VARCHAR(120)`).catch(() => {});

  // M22: tempo de máquina preciso. `iniciado_em`/`concluido_em` já existiam pra
  // OUTRO propósito (lead time da parcial no setor) e são reaproveitados em
  // vários lugares — a parcial é a MESMA linha ao longo de vários ciclos
  // devolver→receber→iniciar (só troca setor_atual, não cria linha nova), então
  // `iniciado_em` fica "grudado" no primeiro início de sempre (COALESCE nunca
  // reseta). Usar esses campos pra medir tempo de máquina contava tempo parado
  // fora da Usinagem/Furação como se fosse produção. Colunas novas, dedicadas,
  // fecham/abrem sessão em cada ação (ver rotas item/parcial "acao"):
  // - maquina_sessao_iniciada_em: início da sessão ATUAL na máquina (null = sem sessão aberta)
  // - maquina_segundos_acumulados: soma das sessões já fechadas (pausar/finalizar/mover/etc.)
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS maquina_sessao_iniciada_em TIMESTAMPTZ`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS maquina_segundos_acumulados NUMERIC(12,0) NOT NULL DEFAULT 0`).catch(() => {});

  // M23: permissão individual pra ver a Análise PCP — hoje é só administrador.
  // PCP/logística/líderes específicos precisam ver os indicadores sem virar
  // administrador completo. Mesmo padrão do M20 (pode_desfazer_recebimento):
  // default false, marcado explicitamente por um admin. Gerar fechamento
  // semanal continua só admin — quem tem essa flag apenas VISUALIZA.
  await sql.unsafe(`ALTER TABLE usuarios_usuario ADD COLUMN IF NOT EXISTS pode_ver_analise BOOLEAN NOT NULL DEFAULT false`).catch(() => {});

  // M24: acesso ao PCP HRM (tela "Anexar OP") pra usuários que NÃO são staff.
  // Hoje o workspace HRM só aparece pra is_staff. Certos operadores (ex.: quem
  // anexa OP do Totvs) precisam SÓ dessa tela, sem virar admin. Default false.
  await sql.unsafe(`ALTER TABLE usuarios_usuario ADD COLUMN IF NOT EXISTS acesso_hrm BOOLEAN NOT NULL DEFAULT false`).catch(() => {});

  // M25: ordem MANUAL de produção por setor ("furar a fila"). Guarda, por setor,
  // um array ordenado de pedido_id definido pelo PCP ao arrastar os cards. A
  // ordenação automática (prazo/prioridade/tamanho/FIFO) continua sendo o padrão;
  // esta ordem manual, quando existe, tem precedência (pedidos fora dela caem
  // depois, auto-ordenados). Uma linha por setor; array pode conter pedidos que
  // já saíram do setor — são ignorados na leitura.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS producao_setor_ordem (
      setor TEXT PRIMARY KEY,
      ordem BIGINT[] NOT NULL DEFAULT '{}',
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_por_id BIGINT
    )
  `).catch(() => {});

  // M26: previsão de conclusão da produção, definida pelo PCP/líder responsável
  // (ex.: Gilmar). É a data REALISTA em que a peça/pedido fica pronto — separada
  // do prazo_entrega (que na verdade é a "Previsão de faturamento (Omie)" e NÃO
  // deve mais definir atraso). Pode ser preenchida por PEÇA (item) OU pelo
  // PEDIDO inteiro: a peça usa a própria previsão; se não tiver, herda a do
  // pedido. O atraso e a conclusão do pedido passam a derivar destas datas.
  await sql.unsafe(`ALTER TABLE producao_itempedido ADD COLUMN IF NOT EXISTS previsao_conclusao DATE`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS previsao_conclusao DATE`).catch(() => {});

  // M27: permissão pra DEFINIR a previsão de conclusão. Mesmo padrão do M23:
  // default false, marcado por um admin. Dada ao Gilmar e à equipe PCP; staff
  // (is_staff) já pode por ser PCP. Demais líderes/operadores só visualizam.
  await sql.unsafe(`ALTER TABLE usuarios_usuario ADD COLUMN IF NOT EXISTS pode_definir_previsao BOOLEAN NOT NULL DEFAULT false`).catch(() => {});

  // M28: motivo da pausa por parcial (Usinagem/Furação). Guarda o CÓDIGO do
  // motivo escolhido ao pausar (ex.: 'almoco', 'troca_maquina') — ver a lista
  // em src/lib/maquinas.ts (MOTIVOS_PAUSA). Só motivos de troca/quebra de
  // máquina fazem o "Retomar" pedir a máquina de novo; almoço/banheiro/etc.
  // retomam direto na mesma máquina. NULL = pausa sem motivo registrado (pausa
  // legada, ou de outro fluxo como divergência) — nesse caso o retomar continua
  // pedindo a máquina, como antes. Limpo ao retomar/iniciar/mover/etc.
  await sql.unsafe(`ALTER TABLE producao_itemparcial ADD COLUMN IF NOT EXISTS motivo_pausa VARCHAR(40)`).catch(() => {});

  // M29: nº do pedido do CLIENTE (a OC/PO que o cliente emitiu), usado pelo
  // cliente pra rastrear a peça dele. É DISTINTO do PV interno
  // (numero_pedido_venda) e do nº da OP (numero_op). Opcional, texto livre.
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS numero_pedido_cliente VARCHAR(120)`).catch(() => {});

  // M30: data de entrega CONTRATUAL — o prazo FIXO acordado em contrato. É só
  // referência do compromisso; NÃO define atraso (o atraso continua vindo da
  // previsao_conclusao, que é a "entrega prevista/real" que se move por
  // antecipação/atraso). Separada também da previsão de faturamento (Omie,
  // prazo_entrega). Opcional.
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS entrega_contratual DATE`).catch(() => {});

  // M31: novo perfil "apontador" — quem percorre a fábrica pedido por pedido
  // atualizando a previsão de conclusão. Não é staff (não é admin nem PCP), não
  // é vendedor (vê TODOS os pedidos, não só os próprios) e cai direto em "Todos
  // os Pedidos" ao entrar. A constraint perfil_valido (herdada do Django) só
  // aceitava administrador/pcp/lider/operador/vendedor; recria incluindo
  // 'apontador'. Idempotente: dropa e recria com a lista completa a cada startup
  // (tabela pequena, validação instantânea; nenhuma linha existente viola).
  await sql.unsafe(`ALTER TABLE usuarios_usuario DROP CONSTRAINT IF EXISTS perfil_valido`).catch(() => {});
  await sql.unsafe(`
    ALTER TABLE usuarios_usuario
    ADD CONSTRAINT perfil_valido CHECK (
      perfil::text = ANY (ARRAY['administrador','pcp','lider','operador','vendedor','apontador']::text[])
    )
  `).catch(() => {});

  // M32: CAPACIDADE por máquina (jornada). Uma linha por máquina com horas
  // disponíveis/dia e dias trabalhados/semana — insumo que faltava pra calcular
  // utilização e capacidade ociosa na Análise PCP (ver [[project_analise_pcp]]).
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS producao_maquina_capacidade (
      maquina TEXT PRIMARY KEY,
      horas_dia NUMERIC(5,2) NOT NULL DEFAULT 8,
      dias_semana SMALLINT NOT NULL DEFAULT 5,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_por_id BIGINT
    )
  `).catch(() => {});

  // M33: config genérica chave→valor do PCP (começa com a META de demanda
  // mensal em unidades). Key-value pra não criar tabela nova a cada parâmetro.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS producao_config (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL DEFAULT '',
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_por_id BIGINT
    )
  `).catch(() => {});

  // M34: INSPEÇÕES / Hold Points (Caldeiraria). Fluxo pedido pelo PCP: o
  // apontador solicita uma inspeção (ex.: Fit-Up) num ponto do roteiro → fica
  // 'pendente' e VISÍVEL pra Qualidade → o inspetor lança o laudo (aprovado /
  // reprovado / retrabalho). Aprovado libera a peça; reprovado/retrabalho
  // devolve pra Caldeiraria (reusa o fluxo 'devolver' das parciais). Uma linha
  // por inspeção — histórico preservado (a mesma peça pode ter várias). Tipos
  // configuráveis em TIPOS_INSPECAO (types.ts). Ver [[project_datas_op_cliente]].
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS producao_inspecao (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES producao_itempedido(id) ON DELETE CASCADE,
      parcial_id INTEGER REFERENCES producao_itemparcial(id) ON DELETE SET NULL,
      pedido_id INTEGER NOT NULL REFERENCES producao_pedido(id) ON DELETE CASCADE,
      tipo VARCHAR(40) NOT NULL,
      setor VARCHAR(30),
      status VARCHAR(20) NOT NULL DEFAULT 'pendente',
      observacao_solicitacao TEXT,
      solicitado_por_id INTEGER REFERENCES usuarios_usuario(id) ON DELETE SET NULL,
      solicitado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      inspetor_id INTEGER REFERENCES usuarios_usuario(id) ON DELETE SET NULL,
      laudo TEXT,
      resolvido_em TIMESTAMPTZ
    )
  `).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_inspecao_status   ON producao_inspecao (status)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_inspecao_item     ON producao_inspecao (item_id)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_inspecao_parcial  ON producao_inspecao (parcial_id)`).catch(() => {});

  // M35 (09/09): LOGÍSTICA APOSENTADA no FLANGE. A Quarentena passa a ser o passo
  // TERMINAL do Flange = "Pedido Finalizado". Move para 'quarentena' tudo que está
  // hoje parado em 'logistica' NO FLANGE — itens, parciais e o setor denormalizado
  // do pedido. NÃO toca na CALDEIRARIA (fabrica='caldeiraria' e/ou roteiro com
  // 'caldeiraria'), que continua usando 'logistica' como Coleta/Entrega. NADA é
  // apagado: cada peça movida ganha uma movimentação de trilha (logistica →
  // quarentena), então dá pra auditar e reverter. Idempotente: depois de rodar,
  // não sobra item Flange em logística, então re-execuções não fazem nada.
  //
  // Guard de fábrica: COALESCE(fabrica,'flange')='flange' é a mesma convenção usada
  // em toda a Análise; o NOT ('caldeiraria' = ANY(roteiro...)) é um cinto-e-suspensório
  // extra pra jamais arrastar uma peça de roteiro Caldeiraria.

  // 1) Trilha ANTES de mover (registra só os itens que vão sair da logística).
  await sql.unsafe(`
    INSERT INTO producao_movimentacaoitem
      (item_id, pedido_id, usuario_id, setor_origem, setor_destino, status_anterior, status_novo, observacao, criado_em)
    SELECT i.id, i.pedido_id, NULL, 'logistica', 'quarentena', i.status, i.status,
           'Migração automática (09/09): Logística aposentada no Flange — item movido para a Quarentena (passo terminal / Finalizado).', NOW()
    FROM producao_itempedido i
    WHERE i.setor_atual = 'logistica'
      AND COALESCE(i.fabrica,'flange') = 'flange'
      AND NOT ('caldeiraria' = ANY(COALESCE(i.roteiro_proprio, ARRAY[]::text[])))
  `).catch(() => {});

  // 2) Itens do Flange: logistica → quarentena.
  await sql.unsafe(`
    UPDATE producao_itempedido i
    SET setor_atual = 'quarentena', atualizado_em = NOW()
    WHERE i.setor_atual = 'logistica'
      AND COALESCE(i.fabrica,'flange') = 'flange'
      AND NOT ('caldeiraria' = ANY(COALESCE(i.roteiro_proprio, ARRAY[]::text[])))
  `).catch(() => {});

  // 3) Parciais desses itens do Flange.
  await sql.unsafe(`
    UPDATE producao_itemparcial pp
    SET setor_atual = 'quarentena', atualizado_em = NOW()
    WHERE pp.setor_atual = 'logistica'
      AND EXISTS (
        SELECT 1 FROM producao_itempedido i
        WHERE i.id = pp.item_pedido_id
          AND COALESCE(i.fabrica,'flange') = 'flange'
          AND NOT ('caldeiraria' = ANY(COALESCE(i.roteiro_proprio, ARRAY[]::text[])))
      )
  `).catch(() => {});

  // 4) Setor denormalizado do pedido (só pedidos Flange, nunca de roteiro Caldeiraria).
  await sql.unsafe(`
    UPDATE producao_pedido p
    SET setor_atual = 'quarentena', atualizado_em = NOW()
    WHERE p.setor_atual = 'logistica'
      AND NOT ('caldeiraria' = ANY(COALESCE(p.roteiro_base, ARRAY[]::text[])))
      AND EXISTS (
        SELECT 1 FROM producao_itempedido i
        WHERE i.pedido_id = p.id AND COALESCE(i.fabrica,'flange') = 'flange'
      )
  `).catch(() => {});

  // M36 (09/09): permissão individual pra VER/USAR a aba "Pedidos Não
  // Localizados" (marcar não localizado no setor, ver a aba, reencaminhar) sem
  // virar administrador. Mesmo padrão do M23/M27: default false, marcado por um
  // admin (ou direto no banco). Admin já vê por ser staff. A concessão a
  // usuários específicos é feita fora daqui (UPDATE pontual), pra não brigar com
  // uma futura remoção pela tela de cadastro.
  await sql.unsafe(`ALTER TABLE usuarios_usuario ADD COLUMN IF NOT EXISTS pode_ver_nao_localizados BOOLEAN NOT NULL DEFAULT false`).catch(() => {});

  // M37 (10/09): REGISTRO DE PARADAS DE PEDIDOS. Anotação PRIVADA (só o login do
  // Guilherme — ver podeRegistrarParadas em auth.ts) pra documentar quando um
  // pedido é PARADO pra atender outro que "furou a fila", bagunçando a produção
  // e a programação. Cada linha = uma parada, com o pedido parado, o motivo, o
  // setor/área afetada, o pedido prioritário que causou a parada e quando
  // ocorreu. Contagem = COUNT(*). Campos de pedido são TEXTO livre (o usuário
  // digita o nº do PV/OP como conhece) — não referenciam producao_pedido de
  // propósito, pra ele poder anotar até algo que não esteja cadastrado ainda.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS producao_parada_pedido (
      id SERIAL PRIMARY KEY,
      pedido VARCHAR(80) NOT NULL,
      motivo TEXT NOT NULL,
      setor VARCHAR(80),
      pedido_prioritario VARCHAR(80),
      ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      criado_por VARCHAR(150),
      criado_por_nome VARCHAR(150),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_parada_ocorrido ON producao_parada_pedido (ocorrido_em DESC)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_parada_criado_por ON producao_parada_pedido (criado_por)`).catch(() => {});

  // M38 (10/09): quantas PEÇAS pararam (no pedido interrompido) e quantas PEÇAS
  // foram iniciadas no pedido que entrou na frente — pra medir o tamanho do
  // impacto de cada parada, não só contar ocorrências. Campos opcionais.
  await sql.unsafe(`ALTER TABLE producao_parada_pedido ADD COLUMN IF NOT EXISTS pecas_paradas INTEGER`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_parada_pedido ADD COLUMN IF NOT EXISTS pecas_iniciadas INTEGER`).catch(() => {});

  // M39 (10/09): quando o pedido parado VOLTOU a andar. NULL = ainda parado.
  // Marcar o retorno NÃO apaga a parada — o histórico de que ela existiu fica
  // preservado; só registra a data/hora em que voltou (dá pra medir há quanto
  // tempo estava parado e quantos ainda seguem parados).
  await sql.unsafe(`ALTER TABLE producao_parada_pedido ADD COLUMN IF NOT EXISTS retornado_em TIMESTAMPTZ`).catch(() => {});

  // M40 (10/09): ROMANEIOS DE CARGA (aba Logística reativada). Documento de
  // transferência de materiais (ex.: HRM ↔ Aços Vital) — cabeçalho + itens.
  // Substitui o texto livre de transportadora/motorista por dado estruturado.
  // codigo = 'ROM-' + numero com 5 dígitos; numero é sequencial (índice único).
  // status: 'aberto' (em montagem/conferência) → 'fechado' (emitido). Cada item
  // tem flag `conferido` pra bater a carga item a item antes de fechar/imprimir.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS producao_romaneio (
      id SERIAL PRIMARY KEY,
      numero INTEGER NOT NULL,
      codigo VARCHAR(20) NOT NULL,
      origem VARCHAR(80) NOT NULL DEFAULT 'HRM',
      destino VARCHAR(80) NOT NULL DEFAULT 'Aços Vital',
      data_carregamento DATE,
      placa VARCHAR(20),
      motorista VARCHAR(120),
      setor_descarga VARCHAR(80) DEFAULT 'Produto acabado',
      finalidade VARCHAR(80) DEFAULT 'Produto Acabado',
      operador_separacao VARCHAR(120),
      conferente_carregamento VARCHAR(120),
      conferente_descarga VARCHAR(120),
      observacao TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'aberto',
      criado_por VARCHAR(150),
      criado_por_nome VARCHAR(150),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      fechado_em TIMESTAMPTZ
    )
  `).catch(() => {});
  await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_romaneio_numero ON producao_romaneio (numero)`).catch(() => {});
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS producao_romaneio_item (
      id SERIAL PRIMARY KEY,
      romaneio_id INTEGER NOT NULL REFERENCES producao_romaneio(id) ON DELETE CASCADE,
      ordem INTEGER NOT NULL DEFAULT 0,
      pedido VARCHAR(80),
      descricao TEXT NOT NULL,
      categoria VARCHAR(60) DEFAULT 'Produção',
      finalidade VARCHAR(80) DEFAULT 'Produto Acabado',
      unidade VARCHAR(20),
      quantidade NUMERIC,
      conferido BOOLEAN NOT NULL DEFAULT false,
      item_pedido_id INTEGER
    )
  `).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_romaneio_item_rom ON producao_romaneio_item (romaneio_id)`).catch(() => {});

  // M41 (10/09): PRAZO DE FINALIZAÇÃO POR SETOR (item E pedido). Diferente da
  // `previsao_conclusao` (prazo global, mantida): aqui cada SETOR tem seu prazo.
  // Ao mudar de setor o prazo "zera" — na prática só é honrado quando
  // `prazo_setor_ref` = setor onde a peça/pedido está AGORA; ao avançar, o ref
  // não bate mais e o prazo é ignorado até definirem um novo no setor novo.
  // Colunas denormalizadas (vigente) pro atraso ser rápido, no mesmo padrão do
  // COALESCE(item, pedido) já usado. O histórico completo (o que cada setor teve)
  // fica em producao_prazo_setor. Quem define: Ezequiel + admin (podeDefinirPrazoSetor).
  await sql.unsafe(`ALTER TABLE producao_itempedido ADD COLUMN IF NOT EXISTS prazo_setor DATE`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_itempedido ADD COLUMN IF NOT EXISTS prazo_setor_ref VARCHAR(40)`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS prazo_setor DATE`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS prazo_setor_ref VARCHAR(40)`).catch(() => {});
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS producao_prazo_setor (
      id SERIAL PRIMARY KEY,
      nivel VARCHAR(10) NOT NULL,
      item_id INTEGER REFERENCES producao_itempedido(id) ON DELETE CASCADE,
      pedido_id INTEGER REFERENCES producao_pedido(id) ON DELETE CASCADE,
      setor VARCHAR(40) NOT NULL,
      prazo DATE NOT NULL,
      vigente BOOLEAN NOT NULL DEFAULT true,
      definido_por VARCHAR(150),
      definido_por_nome VARCHAR(150),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      encerrado_em TIMESTAMPTZ
    )
  `).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_prazo_setor_item ON producao_prazo_setor (item_id) WHERE vigente`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_prazo_setor_pedido ON producao_prazo_setor (pedido_id) WHERE vigente`).catch(() => {});

  // M42 (11/09): OCULTAR VALORES (R$). Marcador por usuário — quem tem a flag
  // NÃO vê nenhum valor monetário (valor total do pedido, valor unitário, valor
  // em produção, etc.). Pensado pro acesso de VENDAS (visualização): vê pedidos e
  // setores, mas sem o financeiro. Mesmo padrão das outras flags (default false,
  // marcado no cadastro). A ocultação é de EXIBIÇÃO (client) — ver podeVerValores.
  await sql.unsafe(`ALTER TABLE usuarios_usuario ADD COLUMN IF NOT EXISTS oculta_valores BOOLEAN NOT NULL DEFAULT false`).catch(() => {});

  // M43 (14/09): PLANEJAMENTO da Usinagem (ex.: Reginaldo). Mesmo padrão das
  // outras flags (default false, marcado no cadastro). Libera a tela
  // /planejamento (fila + painel de máquinas) e o poder de definir máquina/ordem
  // da Usinagem — que o operador não reverte. Ver podePlanejar.
  await sql.unsafe(`ALTER TABLE usuarios_usuario ADD COLUMN IF NOT EXISTS acesso_planejamento BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
  // Plano de máquina da Usinagem: 1 linha por ITEM (peça) = a máquina em que ela
  // DEVE rodar. Quando existe, o "iniciar" na Usinagem FORÇA essa máquina. A
  // ORDEM da fila reaproveita producao_setor_ordem (setor 'usinagem').
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS producao_plano_usinagem (
      item_pedido_id INTEGER PRIMARY KEY REFERENCES producao_itempedido(id) ON DELETE CASCADE,
      maquina        VARCHAR(60),
      definido_por_id INTEGER,
      atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  // SEED: o Reginaldo já nasce com o acesso ligado (não depende de marcar à mão).
  // Guarda NOT EXISTS: só roda enquanto NINGUÉM tem a flag (primeiro deploy) — não
  // re-liga se desmarcarem depois. Username que não bate = no-op inofensivo.
  await sql`
    UPDATE usuarios_usuario SET acesso_planejamento = true
    WHERE username IN ('reginaldo.negri', 'reginaldo')
      AND acesso_planejamento = false
      AND NOT EXISTS (SELECT 1 FROM usuarios_usuario WHERE acesso_planejamento = true)
  `.catch(() => {});

  // M45 (24/09): CONFERÊNCIA HRM sem ser staff — flag acesso_conferencia_hrm
  // libera a Conferência do PCP HRM (conferir + lançar OP da Caldeiraria) e o
  // "Onde está cada OP". Semeia o Alan (login 'alan', líder) e ACRESCENTA a ele
  // os setores da Caldeiraria HRM (SETORES_CALDEIRARIA_MENU) sem tirar os que
  // já tem. Guarda NOT EXISTS: roda só no 1º deploy (enquanto ninguém tem a
  // flag) — não re-liga nem re-adiciona setores se desmarcarem depois.
  // SAVEPOINT: tudo roda numa transação só — se este passo errar, sem savepoint
  // o Postgres abortaria a transação inteira e nenhuma migração seria gravada.
  await sql.savepoint(async (sp) => {
    await sp.unsafe(`ALTER TABLE usuarios_usuario ADD COLUMN IF NOT EXISTS acesso_conferencia_hrm BOOLEAN NOT NULL DEFAULT false`);
    await sp`
      UPDATE usuarios_usuario
      SET acesso_conferencia_hrm = true,
          setores = ARRAY(
            SELECT DISTINCT s FROM unnest(
              COALESCE(NULLIF(setores, '{}'), CASE WHEN setor IS NOT NULL AND setor <> '' THEN ARRAY[setor::text] ELSE '{}'::text[] END)
              || ${sp.array(SETORES_CALDEIRARIA_MENU)}::text[]
            ) AS s
          ),
          setor = COALESCE(NULLIF(setor, ''), 'caldeiraria')
      WHERE username = 'alan'
        AND acesso_conferencia_hrm = false
        AND NOT EXISTS (SELECT 1 FROM usuarios_usuario WHERE acesso_conferencia_hrm = true)
    `;
  }).catch(e => console.error('[migrations] M45 (acesso_conferencia_hrm) falhou:', e));

  // M46 (25/09): setores novos da Caldeiraria HRM — Corte Caldeiraria
  // ('cald_corte') e Usinagem Caldeiraria ('cald_usinagem'). Não precisam de
  // DDL (setor é texto livre); aqui só ACRESCENTA os dois ao Alan (login
  // 'alan'), sem tirar nada. Roda 1x: marca 'm46_alan_setores' em
  // producao_config e só atualiza se a marca acabou de ser criada.
  await sql.savepoint(async (sp) => {
    const [marca] = await sp`
      INSERT INTO producao_config (chave, valor, atualizado_em)
      VALUES ('m46_alan_setores', 'ok', NOW())
      ON CONFLICT (chave) DO NOTHING
      RETURNING chave
    `;
    if (!marca) return;
    await sp`
      UPDATE usuarios_usuario
      SET setores = ARRAY(
        SELECT DISTINCT s FROM unnest(
          COALESCE(NULLIF(setores, '{}'), CASE WHEN setor IS NOT NULL AND setor <> '' THEN ARRAY[setor::text] ELSE '{}'::text[] END)
          || ${sp.array(['cald_corte', 'cald_usinagem'])}::text[]
        ) AS s
      )
      WHERE username = 'alan'
    `;
  }).catch(e => console.error('[migrations] M46 (setores alan) falhou:', e));

  // M44 (14/09): AVISOS DE PRODUÇÃO — "caixa de mensagens" do Planejamento pra
  // Usinagem. O planejador aperta "Avisar Produção" num pedido e cria um aviso
  // que o pessoal do setor destino (hoje 'usinagem') vê numa caixa de entrada no
  // topo da tela do setor, pra não se perderem. `visto` marca lido (some da
  // caixa). Ver /api/avisos e o componente AvisosSetor.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS producao_aviso (
      id             SERIAL PRIMARY KEY,
      pedido_id      INTEGER REFERENCES producao_pedido(id) ON DELETE CASCADE,
      setor          TEXT NOT NULL,
      mensagem       TEXT,
      criado_por_id  INTEGER,
      criado_por_nome TEXT,
      criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      visto          BOOLEAN NOT NULL DEFAULT false,
      visto_por_nome TEXT,
      visto_em       TIMESTAMPTZ
    )
  `).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_aviso_setor_visto ON producao_aviso (setor, visto, criado_em DESC)`).catch(() => {});

  // M45 (14/09): ENCAMINHAR PRODUÇÃO — comando FIXO e persistente do Planejamento
  // (Reginaldo) pra Usinagem: "este pedido deve ser feito". Diferente do aviso
  // (producao_aviso), que some quando o operador dá "Visto" — o encaminhamento
  // fica FIXO no topo da Usinagem até o REGINALDO desfazer (o operador não tira).
  // 1 linha por pedido (só usinagem por enquanto). Reginaldo pode editar a
  // observação ou desfazer (caso de engano). Ver /api/encaminhamentos.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS producao_encaminhamento (
      pedido_id           INTEGER PRIMARY KEY REFERENCES producao_pedido(id) ON DELETE CASCADE,
      setor               TEXT NOT NULL DEFAULT 'usinagem',
      observacao          TEXT,
      encaminhado_por_id  INTEGER,
      encaminhado_por_nome TEXT,
      encaminhado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_encaminhamento_setor ON producao_encaminhamento (setor, encaminhado_em DESC)`).catch(() => {});

  // M46 (14/09): FIXAR no topo — o Reginaldo (ou admin) escolhe se o pedido
  // encaminhado fica FIXO/destacado no topo da Usinagem (fixo=true) ou aparece
  // só como "encaminhado" sem pinar (fixo=false). Default true (comportamento
  // atual). Ver /api/encaminhamentos e o componente EncaminhadosSetor.
  await sql.unsafe(`ALTER TABLE producao_encaminhamento ADD COLUMN IF NOT EXISTS fixo BOOLEAN NOT NULL DEFAULT true`).catch(() => {});

  // M47 (17/09): INICIAR CONFERÊNCIA (PCP HRM / Caldeiraria). Ao enviar a OP pra
  // Conferência, ela nasce "aguardando"; na lista o PCP aperta "Iniciar" pra
  // marcar que começou a conferir aquela OP (evita dois conferindo a mesma).
  // Marcador no próprio pedido "casca" (só existe até a Conferência lançar os
  // itens, quando o pedido sai da lista). Ver /api/pcp-hrm/conferencia/[id].
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS conferencia_iniciada_em TIMESTAMPTZ`).catch(() => {});
  await sql.unsafe(`ALTER TABLE producao_pedido ADD COLUMN IF NOT EXISTS conferencia_iniciada_por TEXT`).catch(() => {});

  // M48 (22/09): Nº DE RASTREABILIDADE por MATERIAL (Caldeiraria). Óleo & gás
  // exige rastrear a matéria-prima de cada peça (nº de colada/corrida/heat number
  // ou certificado). Campo textual livre, preenchido "ao lado de cada material" na
  // abertura/edição da OP da Caldeiraria. Coluna aditiva na tabela de itens
  // (compartilhada) — inofensiva pro Flange, que simplesmente não preenche. A OP
  // do Omie já traz a coluna RASTREAB (hoje descartada no leitor), então dá pra
  // auto-preencher depois. Ver [[project_leitor_op_omie]].
  await sql.unsafe(`ALTER TABLE producao_itempedido ADD COLUMN IF NOT EXISTS numero_rastreabilidade VARCHAR(120)`).catch(() => {});

  // M49 (24/09): PLANEJAMENTO DA CALDEIRARIA — controle do coordenador ("o
  // Reginaldo da Caldeiraria"), substitui a planilha manual. Módulo SEPARADO do
  // fluxo pedido/item/parcial (os pedidos vêm do Omie e são lançados aqui pelo
  // PCP); nenhuma FK pras tabelas de produção. 1 linha por item; `areas` = roteiro
  // previsto; cada área guarda a DATA DE ENTRADA + previsão de saída
  // (+ fornecedor/retorno na industrialização). Ver src/lib/caldPlano.ts.
  // SAVEPOINT: roda na mesma transação das outras — erro aqui não aborta o resto.
  await sql.savepoint(async (sp) => {
    await sp.unsafe(`
      CREATE TABLE IF NOT EXISTS producao_cald_plano_item (
        id               SERIAL PRIMARY KEY,
        pedido           TEXT NOT NULL,
        vendedor         TEXT,
        cliente          TEXT,
        material         TEXT NOT NULL,
        quantidade       NUMERIC,
        unidade          TEXT,
        valor            NUMERIC,
        areas            TEXT[] NOT NULL DEFAULT '{}',
        area_atual       TEXT,
        status           TEXT NOT NULL DEFAULT 'novo',
        prioridade       TEXT NOT NULL DEFAULT 'normal',
        ordem            INTEGER NOT NULL DEFAULT 0,
        prazo_entrega    DATE,
        prev_faturamento DATE,
        faturado_em      DATE,
        prev_finalizacao DATE,
        finalizado_em    DATE,
        parcial          BOOLEAN NOT NULL DEFAULT false,
        obs              TEXT,
        criado_por_id    INTEGER,
        criado_por_nome  TEXT,
        criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await sp.unsafe(`CREATE INDEX IF NOT EXISTS idx_cald_plano_status ON producao_cald_plano_item (status, area_atual)`);
    await sp.unsafe(`
      CREATE TABLE IF NOT EXISTS producao_cald_plano_etapa (
        item_id          INTEGER NOT NULL REFERENCES producao_cald_plano_item(id) ON DELETE CASCADE,
        area             TEXT NOT NULL,
        entrada          DATE,
        previsao         DATE,
        fornecedor       TEXT,
        retorno_previsto DATE,
        PRIMARY KEY (item_id, area)
      )
    `);
    await sp.unsafe(`
      CREATE TABLE IF NOT EXISTS producao_cald_plano_hist (
        id           SERIAL PRIMARY KEY,
        item_id      INTEGER NOT NULL REFERENCES producao_cald_plano_item(id) ON DELETE CASCADE,
        acao         TEXT NOT NULL,
        detalhe      TEXT,
        usuario_nome TEXT,
        criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await sp.unsafe(`CREATE INDEX IF NOT EXISTS idx_cald_plano_hist_item ON producao_cald_plano_hist (item_id, criado_em DESC)`);
  }).catch(e => console.error('[migrations] M49 (planejamento caldeiraria) falhou:', e));

  // M50 (24/09): COBRANÇAS da caixa de pendências do PCP Caldeiraria. Item com
  // prazo vencido → o coordenador "cobra alguém" (quem, o quê, retorno esperado).
  // Enquanto o retorno não vence, o item fica em "Cobrados — aguardando". Ver
  // /api/cald-plano/[id] (acao 'cobrar') e a caixa de pendências em /cald-plano.
  await sql.savepoint(async (sp) => {
    await sp.unsafe(`
      CREATE TABLE IF NOT EXISTS producao_cald_plano_cobranca (
        id              SERIAL PRIMARY KEY,
        item_id         INTEGER NOT NULL REFERENCES producao_cald_plano_item(id) ON DELETE CASCADE,
        quem            TEXT,
        mensagem        TEXT,
        retorno         DATE,
        criado_por_nome TEXT,
        criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await sp.unsafe(`CREATE INDEX IF NOT EXISTS idx_cald_plano_cobranca_item ON producao_cald_plano_cobranca (item_id, criado_em DESC)`);
  }).catch(e => console.error('[migrations] M50 (cobranças caldeiraria) falhou:', e));

  // M51 (24/09): EMPRESA do pedido no PCP Caldeiraria (Aços Vital/Mogi, Aços
  // Uberaba, Aços HRM) — pra relatórios por empresa. Leitura tolerante em
  // caldPlanoServer (to_jsonb) caso a coluna ainda não exista.
  await sql.savepoint(async (sp) => {
    await sp.unsafe(`ALTER TABLE producao_cald_plano_item ADD COLUMN IF NOT EXISTS empresa TEXT`);
  }).catch(e => console.error('[migrations] M51 (empresa caldeiraria) falhou:', e));

  // M52 (24/09): conserta VALOR digitado com ponto de milhar no PCP Caldeiraria.
  // Até aqui o campo lia "56.837" como 56,837 (R$ 56,84) em vez de 56 mil. Real
  // tem 2 casas: valor com 3 casas decimais só existe por esse erro → ×1000.
  // Roda 1x (marca em producao_config) e registra no histórico de cada item.
  await sql.savepoint(async (sp) => {
    const [marca] = await sp`
      INSERT INTO producao_config (chave, valor, atualizado_em)
      VALUES ('m52_cald_valor_milhar', 'ok', NOW())
      ON CONFLICT (chave) DO NOTHING
      RETURNING chave
    `;
    if (!marca) return;
    const corr = await sp`
      UPDATE producao_cald_plano_item
      SET valor = valor * 1000, atualizado_em = NOW()
      WHERE valor IS NOT NULL AND valor <> round(valor, 2)
      RETURNING id, valor::float AS valor
    `;
    for (const c of corr) {
      await sp`
        INSERT INTO producao_cald_plano_hist (item_id, acao, detalhe, usuario_nome)
        VALUES (${c.id}, 'correcao', ${`Valor corrigido (ponto de milhar lido como decimal): R$ ${Number(c.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}, 'Sistema')
      `;
    }
  }).catch(e => console.error('[migrations] M52 (valor milhar caldeiraria) falhou:', e));

  // M53 (24/09): VALOR UNITÁRIO da mercadoria no PCP Caldeiraria. `valor`
  // continua sendo o TOTAL do item (o que soma nos relatórios); unitário é
  // guardado junto (a tela calcula um pelo outro × quantidade). Leitura
  // tolerante via to_jsonb em caldPlanoServer.
  await sql.savepoint(async (sp) => {
    await sp.unsafe(`ALTER TABLE producao_cald_plano_item ADD COLUMN IF NOT EXISTS valor_unitario NUMERIC`);
  }).catch(e => console.error('[migrations] M53 (valor unitário caldeiraria) falhou:', e));

  // M54 (25/09): setores NOVOS da Caldeiraria HRM (montagens, inspeções, testes,
  // tipagem, laboratório, ciclo do Book) — setor é texto livre, sem DDL. Aqui
  // só ACRESCENTA os novos ao Alan (login 'alan'), sem tirar nada, 1x.
  await sql.savepoint(async (sp) => {
    const [marca] = await sp`
      INSERT INTO producao_config (chave, valor, atualizado_em)
      VALUES ('m54_alan_setores_novos', 'ok', NOW())
      ON CONFLICT (chave) DO NOTHING
      RETURNING chave
    `;
    if (!marca) return;
    await sp`
      UPDATE usuarios_usuario
      SET setores = ARRAY(
        SELECT DISTINCT s FROM unnest(
          COALESCE(NULLIF(setores, '{}'), CASE WHEN setor IS NOT NULL AND setor <> '' THEN ARRAY[setor::text] ELSE '{}'::text[] END)
          || ${sp.array(['cald_pre_montagem', 'cald_insp_fitup', 'cald_insp_terceiros', 'cald_montagem_interm', 'cald_montagem_final', 'cald_insp_visual', 'cald_insp_lp', 'cald_insp_pm', 'cald_insp_us', 'cald_insp_dimensional', 'cald_tipagem', 'cald_conj_insp_cliente', 'cald_insp_dim_cliente', 'cald_teste_carga', 'cald_teste_queda', 'cald_lab_externo', 'cald_insp_pintura', 'cald_insp_final_cliente', 'cald_book_insp_cliente', 'cald_book_postagem', 'cald_book_ag_aprov', 'cald_book_aprovado'])}::text[]
        ) AS s
      )
      WHERE username = 'alan'
    `;
  }).catch(e => console.error('[migrations] M54 (setores novos alan) falhou:', e));

  // M55 (25/09): COMPRAS HRM ('cald_compras'). A M54/roteiro de 25/09 usou o
  // 'compras' do FLANGE no roteiro da Caldeiraria e peças HRM caíram na tela de
  // Compras do Flange. Move SÓ o que é da Caldeiraria (item fabrica =
  // 'caldeiraria'): parciais/itens parados em 'compras' → 'cald_compras' e troca
  // 'compras' por 'cald_compras' no roteiro desses itens e no roteiro_base de
  // pedido que só tem item da Caldeiraria. Flange não é tocado. Roda 1x.
  await sql.savepoint(async (sp) => {
    const [marca] = await sp`
      INSERT INTO producao_config (chave, valor, atualizado_em)
      VALUES ('m55_cald_compras', 'ok', NOW())
      ON CONFLICT (chave) DO NOTHING
      RETURNING chave
    `;
    if (!marca) return;
    await sp`
      UPDATE producao_itemparcial pa SET setor_atual = 'cald_compras'
      FROM producao_itempedido i
      WHERE pa.item_pedido_id = i.id AND i.fabrica = 'caldeiraria' AND pa.setor_atual = 'compras'
    `;
    await sp`
      UPDATE producao_itempedido
      SET setor_atual = CASE WHEN setor_atual = 'compras' THEN 'cald_compras' ELSE setor_atual END,
          roteiro_proprio = array_replace(roteiro_proprio, 'compras', 'cald_compras')
      WHERE fabrica = 'caldeiraria'
        AND (setor_atual = 'compras' OR 'compras' = ANY(COALESCE(roteiro_proprio, '{}')))
    `;
    await sp`
      UPDATE producao_pedido p
      SET roteiro_base = array_replace(roteiro_base, 'compras', 'cald_compras'),
          setor_atual = CASE WHEN p.setor_atual = 'compras' THEN 'cald_compras' ELSE p.setor_atual END
      WHERE 'compras' = ANY(COALESCE(p.roteiro_base, '{}'))
        AND EXISTS (SELECT 1 FROM producao_itempedido i WHERE i.pedido_id = p.id AND i.fabrica = 'caldeiraria')
        AND NOT EXISTS (SELECT 1 FROM producao_itempedido i WHERE i.pedido_id = p.id AND COALESCE(i.fabrica, 'flange') <> 'caldeiraria')
    `;
  }).catch(e => console.error('[migrations] M55 (compras HRM) falhou:', e));

  // M56 (25/09): SUB-SETOR no PCP Caldeiraria do Val (setor HRM dentro da área
  // geral) + RECADOS ao Alan (sub-setores "mais a fundo": inspeções/testes/
  // laboratório/Book). Tabelas pequenas do módulo; leitura tolerante em
  // caldPlanoServer (to_jsonb + consulta de recados em savepoint).
  await sql.savepoint(async (sp) => {
    await sp.unsafe(`ALTER TABLE producao_cald_plano_item ADD COLUMN IF NOT EXISTS sub_setor TEXT`);
    await sp.unsafe(`
      CREATE TABLE IF NOT EXISTS producao_cald_plano_recado (
        id                  SERIAL PRIMARY KEY,
        item_id             INTEGER NOT NULL REFERENCES producao_cald_plano_item(id) ON DELETE CASCADE,
        area                TEXT,
        sub_setor           TEXT,
        mensagem            TEXT,
        criado_por_nome     TEXT,
        criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        verificado_em       TIMESTAMPTZ,
        verificado_por_nome TEXT,
        resposta            TEXT
      )
    `);
    await sp.unsafe(`CREATE INDEX IF NOT EXISTS producao_cald_plano_recado_pend ON producao_cald_plano_recado (item_id) WHERE verificado_em IS NULL`);
  }).catch(e => console.error('[migrations] M56 (sub-setor + recados caldeiraria) falhou:', e));
}
