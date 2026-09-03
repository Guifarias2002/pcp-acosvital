/**
 * Migrations incrementais — roda automaticamente no startup do servidor.
 * Cada bloco é idempotente e falha silenciosamente para não derrubar o app.
 */
import postgres from 'postgres';
import sql from './db';

let ran = false;

// Lock id arbitrário (qualquer bigint serve, só precisa ser o mesmo em toda
// instância). Evita que um deploy — que sobe várias instâncias ao mesmo tempo —
// gere uma corrida de N execuções concorrentes das mesmas ALTER TABLE/CREATE
// INDEX: cada uma exige lock exclusivo mesmo sendo IF NOT EXISTS, e a fila
// resultante já travou o banco inteiro (via SELECTs presos em ClientRead que
// ficaram atrás dela). Com o advisory lock, só a primeira instância a chegar
// executa de fato; as demais tentam pegar o lock, falham na hora (tentativa
// não-bloqueante) e saem sem disputar lock de tabela nenhum.
const MIGRATION_LOCK_ID = 7274123;

export async function runMigrations() {
  if (ran) return;
  ran = true;

  try {
    await sql.begin(async (sql) => {
      const [{ locked }] = await sql`SELECT pg_try_advisory_xact_lock(${MIGRATION_LOCK_ID}) AS locked`;
      if (!locked) return; // outra instância já está migrando (ou já migrou) — não competir por lock de tabela

      await runMigrationSteps(sql);
    });
  } catch (e) {
    console.error('[migrations] runMigrations falhou:', e);
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
}
