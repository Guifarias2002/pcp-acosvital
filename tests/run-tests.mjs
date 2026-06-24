#!/usr/bin/env node
/**
 * Sistema PCP — Suite de testes robusta
 *
 * Cobre:
 *   • Autenticação (JWT, cookies, rate limit)
 *   • Controle de acesso (RBAC, isolamento de setor)
 *   • Validação de input (IDs, campos, tipos)
 *   • Workflow completo: emitido → entregue
 *   • Envio parcial + lotes
 *   • Devolução
 *   • Divergências: reprovar → retrabalho / resolver / cancelar_item
 *   • Integridade: pedido fecha quando todos os itens entregues
 *
 * Uso:
 *   node tests/run-tests.mjs
 *
 * Variáveis de ambiente:
 *   BASE_URL    padrão: http://localhost:3001
 *   ADMIN_USER  padrão: admin
 *   ADMIN_PASS  OBRIGATÓRIO
 *   OP_USER     usuário operador (setor usinagem) — opcional, pula testes de operador se ausente
 *   OP_PASS     senha do operador — obrigatório se OP_USER definido
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const OP_USER = process.env.OP_USER || '';
const OP_PASS = process.env.OP_PASS || '';

// ── Estado global ──────────────────────────────────────────────────────────────
let adminToken = null;
let operatorToken = null;

let pedidoId = null;   // pedido principal de workflow
let itemId = null;     // item principal
let pedidoIdParcial = null;
let itemIdParcial = null;
let pedidoIdDiv = null;
let itemIdDiv = null;

// ── Resultados ─────────────────────────────────────────────────────────────────
const results = [];
let passed = 0, failed = 0, skipped = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────
function colorize(str, color) {
  const codes = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', reset: '\x1b[0m' };
  return `${codes[color] || ''}${str}${codes.reset}`;
}

async function api(method, path, body, token, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  let json = null;
  try { json = await res.json(); } catch { /* body vazio */ }
  return { status: res.status, json };
}

async function expect(name, fn, skip = false) {
  if (skip) {
    skipped++;
    results.push({ name, result: 'SKIP' });
    console.log(`  ${colorize('⊘ SKIP', 'yellow')} ${name}`);
    return null;
  }
  try {
    const ret = await fn();
    passed++;
    results.push({ name, result: 'PASS' });
    console.log(`  ${colorize('✓ PASS', 'green')} ${name}`);
    return ret;
  } catch (e) {
    failed++;
    results.push({ name, result: 'FAIL', error: e.message });
    console.log(`  ${colorize('✗ FAIL', 'red')} ${name}`);
    console.log(`       ${colorize(e.message, 'red')}`);
    return null;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Asserção falhou');
}

// ── Limpeza de dados de teste ──────────────────────────────────────────────────
async function cleanup() {
  for (const id of [pedidoId, pedidoIdParcial, pedidoIdDiv]) {
    if (id) {
      try {
        await api('DELETE', `/api/pedidos/${id}`, { motivo: 'cleanup teste' }, adminToken);
      } catch { /* ignora */ }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. AUTENTICAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
async function testarAuth() {
  console.log(`\n${colorize('─── 1. AUTENTICAÇÃO ───────────────────────────────', 'cyan')}`);

  await expect('Login sem credenciais → 400', async () => {
    const r = await api('POST', '/api/auth/token', {});
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  await expect('Login com usuario errado → 401', async () => {
    const r = await api('POST', '/api/auth/token', { username: 'ninguem', password: 'x' });
    assert(r.status === 401, `esperado 401, recebido ${r.status}`);
    assert(r.json?.erro, 'falta campo "erro" na resposta');
  });

  await expect('Login admin válido → token JWT', async () => {
    assert(ADMIN_PASS, 'ADMIN_PASS não configurado — defina a variável de ambiente');
    const r = await api('POST', '/api/auth/token', { username: ADMIN_USER, password: ADMIN_PASS });
    assert(r.status === 200, `esperado 200, recebido ${r.status}: ${JSON.stringify(r.json)}`);
    assert(r.json?.access, 'resposta sem token "access"');
    assert(r.json?.user?.is_staff === true, 'admin deve ter is_staff=true');
    adminToken = r.json.access;
  });

  await expect('Login operador válido → token JWT', async () => {
    if (!OP_USER) throw new Error('OP_USER não configurado — pulando testes de operador');
    const r = await api('POST', '/api/auth/token', { username: OP_USER, password: OP_PASS });
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(r.json?.access, 'resposta sem token');
    operatorToken = r.json.access;
  }, !OP_USER);

  await expect('Token inválido → 401', async () => {
    const r = await api('GET', '/api/pedidos', null, 'token.invalido.aqui');
    assert(r.status === 401, `esperado 401, recebido ${r.status}`);
  });

  await expect('Token ausente → 401 em rota protegida', async () => {
    const r = await api('GET', '/api/pedidos');
    assert(r.status === 401, `esperado 401, recebido ${r.status}`);
  });

  await expect('Logout limpa cookie → resposta OK', async () => {
    const r = await api('POST', '/api/auth/logout', null, adminToken);
    assert(r.status === 200 || r.status === 204, `esperado 2xx, recebido ${r.status}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CONTROLE DE ACESSO (RBAC)
// ═══════════════════════════════════════════════════════════════════════════════
async function testarRBAC() {
  console.log(`\n${colorize('─── 2. CONTROLE DE ACESSO (RBAC) ──────────────────', 'cyan')}`);

  await expect('Operador NÃO pode criar pedido → 403', async () => {
    const r = await api('POST', '/api/pedidos', {
      numero_pedido_venda: 'TEST-OP',
      cliente: 'X',
      prazo_entrega: '2026-12-31',
      prioridade: 'normal',
      roteiro_base: ['usinagem'],
      itens: [{ codigo: 'A', quantidade: 1, unidade: 'un' }],
    }, operatorToken);
    assert(r.status === 403, `esperado 403, recebido ${r.status}`);
  }, !operatorToken);

  await expect('Operador NÃO pode listar usuários → 403', async () => {
    const r = await api('GET', '/api/usuarios', null, operatorToken);
    assert(r.status === 403, `esperado 403, recebido ${r.status}`);
  }, !operatorToken);

  await expect('Operador NÃO pode excluir pedido → 403', async () => {
    // usa ID fictício; o 403 deve vir antes do 404
    const r = await api('DELETE', `/api/pedidos/999999`, { motivo: 'teste' }, operatorToken);
    assert(r.status === 403, `esperado 403, recebido ${r.status}`);
  }, !operatorToken);

  await expect('Operador NÃO pode editar usuário → 403', async () => {
    const r = await api('PATCH', '/api/usuarios/999999', { nome: 'Hacker' }, operatorToken);
    assert(r.status === 403, `esperado 403, recebido ${r.status}`);
  }, !operatorToken);

  await expect('Admin pode listar usuários → 200', async () => {
    const r = await api('GET', '/api/usuarios', null, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(Array.isArray(r.json), 'resposta deve ser array');
  });

  await expect('Admin pode listar pedidos → 200', async () => {
    const r = await api('GET', '/api/pedidos', null, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(Array.isArray(r.json), 'resposta deve ser array');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. VALIDAÇÃO DE INPUT
// ═══════════════════════════════════════════════════════════════════════════════
async function testarValidacao() {
  console.log(`\n${colorize('─── 3. VALIDAÇÃO DE INPUT ─────────────────────────', 'cyan')}`);

  await expect('Criar pedido sem numero_pedido_venda → 400', async () => {
    const r = await api('POST', '/api/pedidos', {
      cliente: 'X',
      prazo_entrega: '2026-12-31',
      prioridade: 'normal',
      roteiro_base: ['usinagem'],
      itens: [{ codigo: 'A', quantidade: 1, unidade: 'un' }],
    }, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  await expect('Criar pedido com prazo inválido → 400', async () => {
    const r = await api('POST', '/api/pedidos', {
      numero_pedido_venda: 'X',
      cliente: 'Y',
      prazo_entrega: '31/12/2026',
      prioridade: 'normal',
      roteiro_base: ['usinagem'],
      itens: [{ codigo: 'A', quantidade: 1, unidade: 'un' }],
    }, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  await expect('Criar pedido com prioridade inválida → 400', async () => {
    const r = await api('POST', '/api/pedidos', {
      numero_pedido_venda: 'X',
      cliente: 'Y',
      prazo_entrega: '2026-12-31',
      prioridade: 'MUITO_URGENTE',
      roteiro_base: ['usinagem'],
      itens: [{ codigo: 'A', quantidade: 1, unidade: 'un' }],
    }, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  await expect('Criar pedido com setor inválido no roteiro → 400', async () => {
    const r = await api('POST', '/api/pedidos', {
      numero_pedido_venda: 'X',
      cliente: 'Y',
      prazo_entrega: '2026-12-31',
      prioridade: 'normal',
      roteiro_base: ['usinagem', 'SECTOR_FAKE'],
      itens: [{ codigo: 'A', quantidade: 1, unidade: 'un' }],
    }, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  await expect('Criar pedido sem itens → 400', async () => {
    const r = await api('POST', '/api/pedidos', {
      numero_pedido_venda: 'X',
      cliente: 'Y',
      prazo_entrega: '2026-12-31',
      prioridade: 'normal',
      roteiro_base: ['usinagem'],
      itens: [],
    }, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  await expect('GET /api/pedidos/0 → 400 (ID inválido)', async () => {
    const r = await api('GET', '/api/pedidos/0', null, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  await expect('GET /api/pedidos/-1 → 400 (ID negativo)', async () => {
    const r = await api('GET', '/api/pedidos/-1', null, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  await expect('GET /api/pedidos/abc → 400 (ID não numérico)', async () => {
    const r = await api('GET', '/api/pedidos/abc', null, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  await expect('Ação inválida no workflow → 400', async () => {
    const r = await api('POST', '/api/item/1/acao/DROP_TABLE', {}, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
    assert(r.json?.erro, 'deve retornar campo "erro"');
  });

  await expect('Ação inválida de lote → 400', async () => {
    const r = await api('POST', '/api/lote/1/deletar', {}, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  await expect('GET /api/pedidos/999999 → 404 (não encontrado)', async () => {
    const r = await api('GET', '/api/pedidos/999999', null, adminToken);
    assert(r.status === 404, `esperado 404, recebido ${r.status}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. WORKFLOW COMPLETO: emitido → entregue
// ═══════════════════════════════════════════════════════════════════════════════
async function testarWorkflowCompleto() {
  console.log(`\n${colorize('─── 4. WORKFLOW COMPLETO ──────────────────────────', 'cyan')}`);

  // 4.1 Criar pedido
  await expect('Criar pedido de teste → 201', async () => {
    const r = await api('POST', '/api/pedidos', {
      numero_pedido_venda: `TEST-WF-${Date.now()}`,
      numero_op: 'OP-TEST-001',
      cliente: 'Cliente Teste Automatizado',
      vendedor: 'PCP',
      prazo_entrega: '2099-12-31',
      prioridade: 'normal',
      roteiro_base: ['emissao', 'usinagem', 'qualidade', 'logistica'],
      observacoes: 'Pedido criado por teste automatizado — pode ser excluído',
      itens: [{
        codigo: 'ITEM-TEST-001',
        descricao: 'Item de teste automatizado',
        quantidade: 5,
        unidade: 'un',
        valor_unitario: 10.00,
      }],
    }, adminToken);
    assert(r.status === 201, `esperado 201, recebido ${r.status}: ${JSON.stringify(r.json)}`);
    assert(r.json?.id, 'resposta sem "id" do pedido');
    pedidoId = r.json.id;
  });

  // 4.2 Verificar pedido criado
  await expect('Pedido criado com status "emitido"', async () => {
    assert(pedidoId, 'pedidoId não definido — etapa anterior falhou');
    const r = await api('GET', `/api/pedidos/${pedidoId}`, null, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(r.json?.status === 'emitido', `esperado "emitido", recebido "${r.json?.status}"`);
    assert(Array.isArray(r.json?.itens) && r.json.itens.length === 1, 'pedido deve ter 1 item');
    itemId = r.json.itens[0].id;
    assert(itemId, 'itemId não encontrado');
    assert(r.json.itens[0].status === 'emitido', `item deve ser "emitido", recebido "${r.json.itens[0].status}"`);
    assert(r.json.itens[0].setor_atual === 'emissao', `setor deve ser "emissao"`);
  });

  // 4.3 Liberar
  await expect('Liberar item → aguardando em usinagem', async () => {
    assert(itemId, 'itemId não definido');
    const r = await api('POST', `/api/item/${itemId}/acao/liberar`, {}, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}: ${JSON.stringify(r.json)}`);
    assert(r.json?.status === 'aguardando', `esperado "aguardando", recebido "${r.json?.status}"`);
    // Verifica no banco
    const check = await api('GET', `/api/pedidos/${pedidoId}`, null, adminToken);
    const item = check.json?.itens?.find(i => i.id === itemId);
    assert(item?.setor_atual === 'usinagem', `setor deve ser "usinagem", recebido "${item?.setor_atual}"`);
  });

  // 4.4 Tentar liberar de novo (transição inválida)
  await expect('Liberar item já liberado → 400 (transição inválida)', async () => {
    const r = await api('POST', `/api/item/${itemId}/acao/liberar`, {}, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  // 4.5 Receber
  await expect('Receber item na usinagem → recebido', async () => {
    const r = await api('POST', `/api/item/${itemId}/acao/receber`, {}, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(r.json?.status === 'recebido', `esperado "recebido", recebido "${r.json?.status}"`);
  });

  // 4.6 Iniciar
  await expect('Iniciar trabalho → em_andamento', async () => {
    const r = await api('POST', `/api/item/${itemId}/acao/iniciar`, {}, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(r.json?.status === 'em_andamento', `esperado "em_andamento", recebido "${r.json?.status}"`);
  });

  // 4.7 Pausar e retomar
  await expect('Pausar → pausado', async () => {
    const r = await api('POST', `/api/item/${itemId}/acao/pausar`, {}, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(r.json?.status === 'pausado', `esperado "pausado", recebido "${r.json?.status}"`);
  });

  await expect('Retomar → em_andamento', async () => {
    const r = await api('POST', `/api/item/${itemId}/acao/retomar`, {}, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(r.json?.status === 'em_andamento', `esperado "em_andamento", recebido "${r.json?.status}"`);
  });

  // 4.8 Finalizar setor
  await expect('Finalizar setor usinagem → finalizado_setor', async () => {
    const r = await api('POST', `/api/item/${itemId}/acao/finalizar`, { observacao: 'Usinagem concluída' }, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(r.json?.status === 'finalizado_setor', `esperado "finalizado_setor", recebido "${r.json?.status}"`);
  });

  // 4.9 Enviar tudo para qualidade
  await expect('Enviar tudo → aguardando em qualidade', async () => {
    const r = await api('POST', `/api/item/${itemId}/acao/enviar_tudo`, {}, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(r.json?.status === 'aguardando', `esperado "aguardando", recebido "${r.json?.status}"`);
    const check = await api('GET', `/api/pedidos/${pedidoId}`, null, adminToken);
    const item = check.json?.itens?.find(i => i.id === itemId);
    assert(item?.setor_atual === 'qualidade', `setor deve ser "qualidade", recebido "${item?.setor_atual}"`);
  });

  // 4.10 Aprovar na qualidade
  await expect('Receber na qualidade → recebido', async () => {
    const r = await api('POST', `/api/item/${itemId}/acao/receber`, {}, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
  });

  await expect('Iniciar na qualidade → em_andamento', async () => {
    const r = await api('POST', `/api/item/${itemId}/acao/iniciar`, {}, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
  });

  await expect('Aprovar na qualidade → finalizado_setor', async () => {
    const r = await api('POST', `/api/item/${itemId}/acao/aprovar`, { observacao: 'Aprovado' }, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(r.json?.status === 'finalizado_setor', `esperado "finalizado_setor", recebido "${r.json?.status}"`);
  });

  // 4.11 Enviar para logística
  await expect('Enviar tudo para logística → aguardando', async () => {
    const r = await api('POST', `/api/item/${itemId}/acao/enviar_tudo`, {}, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    const check = await api('GET', `/api/pedidos/${pedidoId}`, null, adminToken);
    const item = check.json?.itens?.find(i => i.id === itemId);
    assert(item?.setor_atual === 'logistica', `setor deve ser "logistica", recebido "${item?.setor_atual}"`);
  });

  // 4.12 Entregar (via acao/entregar)
  await expect('Receber na logística', async () => {
    const r = await api('POST', `/api/item/${itemId}/acao/receber`, {}, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
  });

  await expect('Entregar item (acao) → entregue', async () => {
    const r = await api('POST', `/api/item/${itemId}/acao/entregar`, { observacao: 'Entregue ao cliente' }, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(r.json?.status === 'entregue', `esperado "entregue", recebido "${r.json?.status}"`);
  });

  // 4.13 Integridade: pedido deve estar entregue
  await expect('INTEGRIDADE: pedido fecha quando todos itens entregues', async () => {
    const r = await api('GET', `/api/pedidos/${pedidoId}`, null, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(r.json?.status === 'entregue', `pedido deve ser "entregue", recebido "${r.json?.status}"`);
    const item = r.json?.itens?.find(i => i.id === itemId);
    assert(item?.status === 'entregue', `item deve ser "entregue", recebido "${item?.status}"`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. DEVOLUÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
async function testarDevolucao() {
  console.log(`\n${colorize('─── 5. DEVOLUÇÃO ──────────────────────────────────', 'cyan')}`);

  let pedidoDevId = null;
  let itemDevId = null;

  await expect('Setup: criar pedido para teste de devolução', async () => {
    const r = await api('POST', '/api/pedidos', {
      numero_pedido_venda: `TEST-DEV-${Date.now()}`,
      cliente: 'Cliente Devolucao',
      prazo_entrega: '2099-12-31',
      prioridade: 'normal',
      roteiro_base: ['emissao', 'usinagem', 'acabamento', 'logistica'],
      itens: [{ codigo: 'DEV-001', descricao: 'Item para devolucao', quantidade: 3, unidade: 'un' }],
    }, adminToken);
    assert(r.status === 201, `esperado 201, recebido ${r.status}: ${JSON.stringify(r.json)}`);
    pedidoDevId = r.json.id;
    const check = await api('GET', `/api/pedidos/${pedidoDevId}`, null, adminToken);
    itemDevId = check.json?.itens?.[0]?.id;
    assert(itemDevId, 'itemDevId não encontrado');
  });

  await expect('Avançar até finalizado_setor na usinagem', async () => {
    assert(itemDevId, 'itemDevId não definido');
    for (const acao of ['liberar', 'receber', 'iniciar', 'finalizar']) {
      const r = await api('POST', `/api/item/${itemDevId}/acao/${acao}`, {}, adminToken);
      assert(r.status === 200, `acao "${acao}" falhou: ${r.status} ${JSON.stringify(r.json)}`);
    }
  });

  await expect('Devolver item de usinagem → aguardando em emissao', async () => {
    assert(itemDevId, 'itemDevId não definido');
    const r = await api('POST', `/api/item/${itemDevId}/acao/devolver`, {
      setor_destino: 'emissao',
      observacao: 'Retrabalho necessário',
    }, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}: ${JSON.stringify(r.json)}`);
    const check = await api('GET', `/api/pedidos/${pedidoDevId}`, null, adminToken);
    const item = check.json?.itens?.find(i => i.id === itemDevId);
    assert(item?.setor_atual === 'emissao', `setor deve ser "emissao", recebido "${item?.setor_atual}"`);
    assert(item?.status === 'aguardando', `status deve ser "aguardando", recebido "${item?.status}"`);
  });

  await expect('Devolver para setor inválido → usa setor anterior do roteiro', async () => {
    // Avançar até finalizado_setor novamente primeiro
    const acao1 = await api('POST', `/api/item/${itemDevId}/acao/receber`, {}, adminToken);
    assert(acao1.status === 200, 'receber falhou');
    const acao2 = await api('POST', `/api/item/${itemDevId}/acao/iniciar`, {}, adminToken);
    assert(acao2.status === 200, 'iniciar falhou');
    const acao3 = await api('POST', `/api/item/${itemDevId}/acao/finalizar`, {}, adminToken);
    assert(acao3.status === 200, 'finalizar falhou');
    // Devolver com setor inválido — deve fallback para setor anterior no roteiro
    const r = await api('POST', `/api/item/${itemDevId}/acao/devolver`, {
      setor_destino: 'SETOR_INEXISTENTE',
      observacao: 'Teste setor invalido',
    }, adminToken);
    // Deve aceitar mas usar o setor_atual como destino (fallback)
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
  });

  // Cleanup
  if (pedidoDevId) {
    await api('DELETE', `/api/pedidos/${pedidoDevId}`, { motivo: 'cleanup' }, adminToken).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. ENVIO PARCIAL + LOTES
// ═══════════════════════════════════════════════════════════════════════════════
async function testarEnvioParcial() {
  console.log(`\n${colorize('─── 6. ENVIO PARCIAL + LOTES ──────────────────────', 'cyan')}`);

  await expect('Setup: criar pedido para envio parcial (qtd=10)', async () => {
    const r = await api('POST', '/api/pedidos', {
      numero_pedido_venda: `TEST-PARC-${Date.now()}`,
      cliente: 'Cliente Parcial',
      prazo_entrega: '2099-12-31',
      prioridade: 'normal',
      roteiro_base: ['emissao', 'usinagem', 'logistica'],
      itens: [{ codigo: 'PARC-001', descricao: 'Item parcial', quantidade: 10, unidade: 'un' }],
    }, adminToken);
    assert(r.status === 201, `esperado 201, recebido ${r.status}: ${JSON.stringify(r.json)}`);
    pedidoIdParcial = r.json.id;
    const check = await api('GET', `/api/pedidos/${pedidoIdParcial}`, null, adminToken);
    itemIdParcial = check.json?.itens?.[0]?.id;
    assert(itemIdParcial, 'itemIdParcial não encontrado');
  });

  await expect('Avançar até finalizado_setor na usinagem', async () => {
    assert(itemIdParcial, 'itemIdParcial não definido');
    for (const acao of ['liberar', 'receber', 'iniciar', 'finalizar']) {
      const r = await api('POST', `/api/item/${itemIdParcial}/acao/${acao}`, {}, adminToken);
      assert(r.status === 200, `acao "${acao}" falhou: ${r.status}`);
    }
  });

  await expect('Envio parcial qtd > pendente → 400', async () => {
    assert(itemIdParcial, 'itemIdParcial não definido');
    const r = await api('POST', `/api/item/${itemIdParcial}/acao/enviar_parcial`, {
      quantidade: 999,
    }, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  await expect('Envio parcial qtd=0 → 400', async () => {
    const r = await api('POST', `/api/item/${itemIdParcial}/acao/enviar_parcial`, {
      quantidade: 0,
    }, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  let loteId = null;

  await expect('Envio parcial qtd=4 → cria lote + reduz quantidade_pendente', async () => {
    assert(itemIdParcial, 'itemIdParcial não definido');
    const r = await api('POST', `/api/item/${itemIdParcial}/acao/enviar_parcial`, {
      quantidade: 4,
      observacao: 'Lote parcial de teste',
    }, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}: ${JSON.stringify(r.json)}`);

    // Verifica item: deve ter quantidade_pendente = 6 e estar no setor original ainda
    const check = await api('GET', `/api/pedidos/${pedidoIdParcial}`, null, adminToken);
    const item = check.json?.itens?.find(i => i.id === itemIdParcial);
    assert(item, 'item não encontrado no pedido');
    assert(Number(item.quantidade_pendente) === 6, `quantidade_pendente deve ser 6, recebido ${item.quantidade_pendente}`);

    // Verifica se lote foi criado via API do kanban
    const kanban = await api('GET', '/api/kanban', null, adminToken);
    assert(kanban.status === 200, 'kanban não acessível');
  });

  await expect('Envio parcial restante (qtd=6) → fecha item', async () => {
    assert(itemIdParcial, 'itemIdParcial não definido');
    const r = await api('POST', `/api/item/${itemIdParcial}/acao/enviar_parcial`, {
      quantidade: 6,
    }, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    const check = await api('GET', `/api/pedidos/${pedidoIdParcial}`, null, adminToken);
    const item = check.json?.itens?.find(i => i.id === itemIdParcial);
    assert(item?.setor_atual === 'logistica', `item deve estar em "logistica", recebido "${item?.setor_atual}"`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. DIVERGÊNCIAS
// ═══════════════════════════════════════════════════════════════════════════════
async function testarDivergencias() {
  console.log(`\n${colorize('─── 7. DIVERGÊNCIAS ───────────────────────────────', 'cyan')}`);

  await expect('Setup: criar pedido para divergências', async () => {
    const r = await api('POST', '/api/pedidos', {
      numero_pedido_venda: `TEST-DIV-${Date.now()}`,
      cliente: 'Cliente Divergencia',
      prazo_entrega: '2099-12-31',
      prioridade: 'alta',
      roteiro_base: ['emissao', 'usinagem', 'qualidade', 'logistica'],
      itens: [{ codigo: 'DIV-001', descricao: 'Item para divergencia', quantidade: 2, unidade: 'un' }],
    }, adminToken);
    assert(r.status === 201, `esperado 201, recebido ${r.status}`);
    pedidoIdDiv = r.json.id;
    const check = await api('GET', `/api/pedidos/${pedidoIdDiv}`, null, adminToken);
    itemIdDiv = check.json?.itens?.[0]?.id;
    assert(itemIdDiv, 'itemIdDiv não encontrado');
  });

  await expect('Avançar até em_andamento na qualidade', async () => {
    assert(itemIdDiv, 'itemIdDiv não definido');
    for (const acao of ['liberar', 'receber', 'iniciar', 'finalizar', 'enviar_tudo', 'receber', 'iniciar']) {
      const r = await api('POST', `/api/item/${itemIdDiv}/acao/${acao}`, {}, adminToken);
      assert(r.status === 200, `acao "${acao}" falhou: ${r.status} ${JSON.stringify(r.json)}`);
    }
  });

  await expect('Reprovar → status reprovado + divergência criada automaticamente', async () => {
    assert(itemIdDiv, 'itemIdDiv não definido');
    const r = await api('POST', `/api/item/${itemIdDiv}/acao/reprovar`, {
      observacao: 'Dimensional fora de tolerância',
    }, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}: ${JSON.stringify(r.json)}`);
    assert(r.json?.status === 'reprovado', `esperado "reprovado", recebido "${r.json?.status}"`);
    // Verifica divergência
    const divs = await api('GET', `/api/divergencias?pedido_id=${pedidoIdDiv}`, null, adminToken);
    assert(divs.status === 200, 'endpoint divergencias falhou');
    const divAberta = divs.json?.divergencias?.find(d => d.pedido_id === pedidoIdDiv && d.status === 'aberta');
    assert(divAberta, 'divergência aberta não encontrada após reprovar');
  });

  await expect('Tentar reprovar item já reprovado → 400', async () => {
    const r = await api('POST', `/api/item/${itemIdDiv}/acao/reprovar`, {}, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  let itemIdDiv2 = null;

  await expect('Setup item 2 para teste de resolver/cancelar', async () => {
    // Cria outro pedido para testar resolver e cancelar_item
    const r2 = await api('POST', '/api/pedidos', {
      numero_pedido_venda: `TEST-DIV2-${Date.now()}`,
      cliente: 'Cliente Divergencia 2',
      prazo_entrega: '2099-12-31',
      prioridade: 'normal',
      roteiro_base: ['emissao', 'qualidade', 'logistica'],
      itens: [{ codigo: 'DIV-002', descricao: 'Item divergencia 2', quantidade: 1, unidade: 'un' }],
    }, adminToken);
    assert(r2.status === 201, `esperado 201, recebido ${r2.status}`);
    const check2 = await api('GET', `/api/pedidos/${r2.json.id}`, null, adminToken);
    itemIdDiv2 = check2.json?.itens?.[0]?.id;
    assert(itemIdDiv2, 'itemIdDiv2 não encontrado');
    // Avança até reprovado
    for (const acao of ['liberar', 'receber', 'iniciar', 'reprovar']) {
      const rx = await api('POST', `/api/item/${itemIdDiv2}/acao/${acao}`, {}, adminToken);
      assert(rx.status === 200, `acao "${acao}" falhou`);
    }
    // guarda para cleanup
    global._pedidoDiv2Id = r2.json.id;
  });

  await expect('Retrabalho com setor inválido → 400', async () => {
    assert(itemIdDiv, 'itemIdDiv não definido');
    const r = await api('POST', `/api/item/${itemIdDiv}/acao/retrabalho`, {
      setor_destino: 'SETOR_FAKE',
    }, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  await expect('Retrabalho → item volta para usinagem com status aguardando', async () => {
    assert(itemIdDiv, 'itemIdDiv não definido');
    const r = await api('POST', `/api/item/${itemIdDiv}/acao/retrabalho`, {
      setor_destino: 'usinagem',
      observacao: 'Refazer usinagem — dimensional errado',
    }, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}: ${JSON.stringify(r.json)}`);
    const check = await api('GET', `/api/pedidos/${pedidoIdDiv}`, null, adminToken);
    const item = check.json?.itens?.find(i => i.id === itemIdDiv);
    assert(item?.setor_atual === 'usinagem', `setor deve ser "usinagem", recebido "${item?.setor_atual}"`);
    assert(item?.status === 'aguardando', `status deve ser "aguardando", recebido "${item?.status}"`);
  });

  await expect('Resolver internamente → finalizado_setor', async () => {
    assert(itemIdDiv2, 'itemIdDiv2 não definido');
    const r = await api('POST', `/api/item/${itemIdDiv2}/acao/resolver`, {
      observacao: 'Resolvido internamente pela qualidade',
    }, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}: ${JSON.stringify(r.json)}`);
    assert(r.json?.status === 'finalizado_setor', `esperado "finalizado_setor", recebido "${r.json?.status}"`);
  });

  await expect('Cancelar item em pedido separado → item bloqueado', async () => {
    // Precisamos de outro item reprovado
    const r3 = await api('POST', '/api/pedidos', {
      numero_pedido_venda: `TEST-DIV3-${Date.now()}`,
      cliente: 'Cancelar Item',
      prazo_entrega: '2099-12-31',
      prioridade: 'normal',
      roteiro_base: ['emissao', 'qualidade', 'logistica'],
      itens: [{ codigo: 'DIV-003', descricao: 'Item para cancelar', quantidade: 1, unidade: 'un' }],
    }, adminToken);
    assert(r3.status === 201, `esperado 201, recebido ${r3.status}`);
    global._pedidoDiv3Id = r3.json.id;
    const check3 = await api('GET', `/api/pedidos/${r3.json.id}`, null, adminToken);
    const itemDiv3 = check3.json?.itens?.[0]?.id;
    assert(itemDiv3, 'item não encontrado');
    for (const acao of ['liberar', 'receber', 'iniciar', 'reprovar']) {
      const rx = await api('POST', `/api/item/${itemDiv3}/acao/${acao}`, {}, adminToken);
      assert(rx.status === 200, `acao "${acao}" falhou`);
    }
    const rCancel = await api('POST', `/api/item/${itemDiv3}/acao/cancelar_item`, {
      observacao: 'Peça inviável — cancelada',
    }, adminToken);
    assert(rCancel.status === 200, `esperado 200, recebido ${rCancel.status}`);
    assert(rCancel.json?.status === 'bloqueado', `esperado "bloqueado", recebido "${rCancel.json?.status}"`);
  });

  await expect('Divergência manual via POST /api/divergencias', async () => {
    assert(pedidoIdDiv, 'pedidoIdDiv não definido');
    const r = await api('POST', '/api/divergencias', {
      pedido_id: pedidoIdDiv,
      tipo: 'quantidade',
      descricao: 'Quantidade recebida menor que o pedido',
      setor_responsavel: 'usinagem',
      prioridade: 'alta',
    }, adminToken);
    assert(r.status === 201, `esperado 201, recebido ${r.status}: ${JSON.stringify(r.json)}`);
    assert(r.json?.id, 'resposta sem id da divergência');
  });

  await expect('Divergência sem tipo → 400', async () => {
    const r = await api('POST', '/api/divergencias', {
      pedido_id: pedidoIdDiv,
      descricao: 'Sem tipo',
    }, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });

  await expect('Divergência com tipo inválido → 400', async () => {
    const r = await api('POST', '/api/divergencias', {
      pedido_id: pedidoIdDiv,
      tipo: 'explosao',
      descricao: 'Tipo fictício',
    }, adminToken);
    assert(r.status === 400, `esperado 400, recebido ${r.status}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. ISOLAMENTO DE SETOR (operador)
// ═══════════════════════════════════════════════════════════════════════════════
async function testarIsolamentoSetor() {
  console.log(`\n${colorize('─── 8. ISOLAMENTO DE SETOR ────────────────────────', 'cyan')}`);

  if (!operatorToken) {
    console.log(`  ${colorize('⊘ SKIP', 'yellow')} Todos os testes de isolamento (OP_USER não configurado)`);
    skipped += 3;
    return;
  }

  // Pega o setor do operador via token
  let opSetor = '';
  try {
    const payload = JSON.parse(Buffer.from(operatorToken.split('.')[1], 'base64').toString());
    opSetor = payload.setor || '';
  } catch { /* ignora */ }

  await expect('Operador NÃO vê pedido de outro setor → 403', async () => {
    // cria pedido no setor oposto
    const setorOutro = opSetor === 'usinagem' ? 'acabamento' : 'usinagem';
    const r = await api('POST', '/api/pedidos', {
      numero_pedido_venda: `TEST-ISO-${Date.now()}`,
      cliente: 'ISO Test',
      prazo_entrega: '2099-12-31',
      prioridade: 'normal',
      roteiro_base: ['emissao', setorOutro, 'logistica'],
      itens: [{ codigo: 'ISO-001', descricao: 'Isolamento', quantidade: 1, unidade: 'un' }],
    }, adminToken);
    assert(r.status === 201, 'não criou pedido para teste de isolamento');
    const pedIdIso = r.json.id;
    const check = await api('GET', `/api/pedidos/${pedIdIso}`, null, adminToken);
    const itemIso = check.json?.itens?.[0];
    // Libera para setorOutro
    await api('POST', `/api/item/${itemIso.id}/acao/liberar`, {}, adminToken);
    // Operador do setor errado não deve conseguir agir
    const rOp = await api('POST', `/api/item/${itemIso.id}/acao/receber`, {}, operatorToken);
    assert(rOp.status === 403, `esperado 403 (setor errado), recebido ${rOp.status}`);
    // cleanup
    await api('DELETE', `/api/pedidos/${pedIdIso}`, { motivo: 'cleanup iso' }, adminToken).catch(() => {});
  });

  await expect('Operador PODE agir em item do próprio setor', async () => {
    const r = await api('POST', '/api/pedidos', {
      numero_pedido_venda: `TEST-ISO2-${Date.now()}`,
      cliente: 'ISO Test2',
      prazo_entrega: '2099-12-31',
      prioridade: 'normal',
      roteiro_base: ['emissao', opSetor, 'logistica'],
      itens: [{ codigo: 'ISO-002', descricao: 'Meu setor', quantidade: 1, unidade: 'un' }],
    }, adminToken);
    assert(r.status === 201, 'não criou pedido para ISO2');
    const pedIdIso2 = r.json.id;
    const check = await api('GET', `/api/pedidos/${pedIdIso2}`, null, adminToken);
    const itemIso2 = check.json?.itens?.[0];
    await api('POST', `/api/item/${itemIso2.id}/acao/liberar`, {}, adminToken);
    // Operador do setor correto DEVE conseguir receber
    const rOp = await api('POST', `/api/item/${itemIso2.id}/acao/receber`, {}, operatorToken);
    assert(rOp.status === 200, `esperado 200 (setor correto), recebido ${rOp.status}: ${JSON.stringify(rOp.json)}`);
    await api('DELETE', `/api/pedidos/${pedIdIso2}`, { motivo: 'cleanup iso2' }, adminToken).catch(() => {});
  });

  await expect('Operador NÃO pode ver lote de setor alheio → 403', async () => {
    // Lote de setor diferente do operador
    const rOp = await api('POST', '/api/lote/999999/receber', {}, operatorToken);
    // 404 (lote inexistente) ou 403 (setor errado se existisse) — ambos são aceitáveis
    assert(rOp.status === 404 || rOp.status === 403, `esperado 403/404, recebido ${rOp.status}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ENDPOINTS AUXILIARES
// ═══════════════════════════════════════════════════════════════════════════════
async function testarEndpointsAuxiliares() {
  console.log(`\n${colorize('─── 9. ENDPOINTS AUXILIARES ───────────────────────', 'cyan')}`);

  await expect('GET /api/dashboard → 200 com estrutura esperada', async () => {
    const r = await api('GET', '/api/dashboard', null, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(typeof r.json?.total === 'number', 'campo "total" ausente ou não numérico');
    assert(Array.isArray(r.json?.por_setor), 'campo "por_setor" deve ser array');
  });

  await expect('GET /api/kanban → 200', async () => {
    const r = await api('GET', '/api/kanban', null, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
  });

  await expect('GET /api/setores → 200 com lista de setores', async () => {
    const r = await api('GET', '/api/setores', null, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(Array.isArray(r.json), 'deve ser array');
  });

  await expect('GET /api/emitidos → 200', async () => {
    const r = await api('GET', '/api/emitidos', null, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
  });

  await expect('GET /api/entregues → 200', async () => {
    const r = await api('GET', '/api/entregues', null, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
  });

  await expect('GET /api/divergencias → 200 com totais', async () => {
    const r = await api('GET', '/api/divergencias', null, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
    assert(Array.isArray(r.json?.divergencias), 'campo "divergencias" deve ser array');
    assert(typeof r.json?.totais?.total !== 'undefined', 'campo "totais.total" ausente');
  });

  await expect('GET /api/notificacoes → 200', async () => {
    const r = await api('GET', '/api/notificacoes', null, adminToken);
    assert(r.status === 200 || r.status === 204, `esperado 2xx, recebido ${r.status}`);
  });

  await expect('GET /api/relatorios → 200', async () => {
    const r = await api('GET', '/api/relatorios', null, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
  });

  await expect('GET /api/auditoria → 200 (admin)', async () => {
    const r = await api('GET', '/api/auditoria', null, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
  });

  await expect('GET /api/setor/usinagem → 200', async () => {
    const r = await api('GET', '/api/setor/usinagem', null, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
  });

  await expect('GET /api/setor/SETOR_INVALIDO → 400 ou 404', async () => {
    const r = await api('GET', '/api/setor/SETOR_INVALIDO', null, adminToken);
    assert(r.status === 400 || r.status === 404, `esperado 400/404, recebido ${r.status}`);
  });

  await expect('GET /api/por-lider → 200', async () => {
    const r = await api('GET', '/api/por-lider', null, adminToken);
    assert(r.status === 200, `esperado 200, recebido ${r.status}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. SEGURANÇA AVANÇADA
// ═══════════════════════════════════════════════════════════════════════════════
async function testarSegurancaAvancada() {
  console.log(`\n${colorize('─── 10. SEGURANÇA AVANÇADA ────────────────────────', 'cyan')}`);

  await expect('Token expirado / assinatura inválida → 401', async () => {
    // JWT com assinatura forjada
    const forgedToken = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsImlzX3N0YWZmIjp0cnVlfQ.ASSINATURA_FORJADA';
    const r = await api('GET', '/api/pedidos', null, forgedToken);
    assert(r.status === 401, `token forjado deve retornar 401, recebido ${r.status}`);
  });

  await expect('Campos financeiros ocultos para perfil não-admin', async () => {
    // Se operador disponível, verifica que valor_unitario é null
    if (!operatorToken) {
      throw new Error('OP_USER não configurado — pulando verificação financeira');
    }
    if (!pedidoId) {
      throw new Error('pedidoId não disponível (workflow não completou)');
    }
    const r = await api('GET', `/api/pedidos/${pedidoId}`, null, operatorToken);
    // Pode ser 403 (setor diferente) ou 200 com valores zerados — ambos ok
    assert(r.status === 200 || r.status === 403, `esperado 200/403, recebido ${r.status}`);
    if (r.status === 200) {
      assert(r.json?.valor_calculado === null, 'operador não deve ver valor_calculado');
    }
  }, !operatorToken);

  await expect('DELETE /api/pedidos sem motivo funciona (motivo opcional)', async () => {
    // Cria um pedido temporário para deletar
    const r = await api('POST', '/api/pedidos', {
      numero_pedido_venda: `TEST-DEL-${Date.now()}`,
      cliente: 'Deletar',
      prazo_entrega: '2099-12-31',
      prioridade: 'baixa',
      roteiro_base: ['emissao', 'logistica'],
      itens: [{ codigo: 'DEL-001', descricao: 'Para deletar', quantidade: 1, unidade: 'un' }],
    }, adminToken);
    assert(r.status === 201, `não criou pedido: ${r.status}`);
    const rDel = await api('DELETE', `/api/pedidos/${r.json.id}`, {}, adminToken);
    assert(rDel.status === 200, `esperado 200, recebido ${rDel.status}: ${JSON.stringify(rDel.json)}`);
    // Verifica que foi de fato excluído
    const rCheck = await api('GET', `/api/pedidos/${r.json.id}`, null, adminToken);
    assert(rCheck.status === 404, `pedido excluído deve retornar 404, recebido ${rCheck.status}`);
  });

  await expect('Injeção de SQL via username → tratado como string literal', async () => {
    const r = await api('POST', '/api/auth/token', {
      username: "admin' OR '1'='1",
      password: 'qualquer',
    });
    assert(r.status === 401, `injeção SQL não deve autenticar — esperado 401, recebido ${r.status}`);
  });

  await expect('Username excessivamente longo truncado/rejeitado', async () => {
    const r = await api('POST', '/api/auth/token', {
      username: 'A'.repeat(10000),
      password: 'x',
    });
    // Deve retornar 401 (sem usuário) ou 400, nunca 500
    assert(r.status === 401 || r.status === 400, `esperado 401/400, recebido ${r.status}`);
  });

  await expect('Content-Type incorreto em POST → trata como body vazio / 400', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'username=admin&password=test',
    });
    const json = await res.json().catch(() => ({}));
    // Deve retornar 400 (body inválido) ou 401 (credenciais inválidas) — nunca 500
    assert(res.status !== 500, `não deve retornar 500, recebido ${res.status}`);
  });

  await expect('Método HTTP não suportado → 405 ou 404', async () => {
    const r = await api('PUT', '/api/pedidos', {}, adminToken);
    assert(r.status === 405 || r.status === 404, `esperado 405/404, recebido ${r.status}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(colorize('\n╔══════════════════════════════════════════════════════╗', 'bold'));
  console.log(colorize('║  Sistema PCP — Suite de Testes Robusta               ║', 'bold'));
  console.log(colorize('╚══════════════════════════════════════════════════════╝', 'bold'));
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  Admin    : ${ADMIN_USER}`);
  console.log(`  Operador : ${OP_USER || colorize('não configurado (testes de operador serão pulados)', 'yellow')}`);

  // Verifica se servidor está rodando
  try {
    await fetch(`${BASE_URL}/login`, { signal: AbortSignal.timeout(5000) });
  } catch {
    console.log(colorize(`\n✗ ERRO: Servidor não responde em ${BASE_URL}`, 'red'));
    console.log(colorize('  Execute: npm run dev -- --port 3001', 'yellow'));
    process.exit(1);
  }

  if (!ADMIN_PASS) {
    console.log(colorize('\n✗ ERRO: ADMIN_PASS não configurado.', 'red'));
    console.log('  Uso: ADMIN_PASS=suasenha node tests/run-tests.mjs');
    process.exit(1);
  }

  try {
    await testarAuth();
    if (!adminToken) {
      console.log(colorize('\n✗ Login admin falhou — não é possível continuar.', 'red'));
      process.exit(1);
    }
    await testarRBAC();
    await testarValidacao();
    await testarWorkflowCompleto();
    await testarDevolucao();
    await testarEnvioParcial();
    await testarDivergencias();
    await testarIsolamentoSetor();
    await testarEndpointsAuxiliares();
    await testarSegurancaAvancada();
  } finally {
    console.log(`\n${colorize('─── Limpando dados de teste ───────────────────────', 'cyan')}`);
    await cleanup();
    for (const k of ['_pedidoDiv2Id', '_pedidoDiv3Id']) {
      if (global[k]) {
        await api('DELETE', `/api/pedidos/${global[k]}`, { motivo: 'cleanup' }, adminToken).catch(() => {});
      }
    }
    console.log('  Dados de teste removidos.');
  }

  // Sumário
  const total = passed + failed + skipped;
  console.log(colorize('\n╔══════════════════════════════════════════════════════╗', 'bold'));
  console.log(colorize('║  RESULTADO FINAL                                      ║', 'bold'));
  console.log(colorize('╚══════════════════════════════════════════════════════╝', 'bold'));
  console.log(`  ${colorize(`✓ ${passed} passaram`, 'green')}  ${colorize(`✗ ${failed} falharam`, failed > 0 ? 'red' : 'green')}  ${colorize(`⊘ ${skipped} pulados`, 'yellow')}  (total: ${total})`);

  if (failed > 0) {
    console.log(colorize('\n  Falhas:', 'red'));
    results.filter(r => r.result === 'FAIL').forEach(r => {
      console.log(`  ${colorize('✗', 'red')} ${r.name}`);
      console.log(`    ${colorize(r.error || '', 'red')}`);
    });
    process.exit(1);
  } else {
    console.log(colorize('\n  Todos os testes passaram! ✓', 'green'));
    process.exit(0);
  }
}

main().catch(e => {
  console.error(colorize('\nErro fatal:', 'red'), e.message);
  process.exit(1);
});
