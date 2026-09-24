// Cancelar venda paga com devolução — o fluxo inteiro, OS e PDV.
//
// Roda planejar + executar contra um banco em memória com a mesma forma
// das entidades do base44. Assim dá para conferir o que nenhum teste de
// função isolada confere: a ORDEM das gravações, e o que acontece quando
// uma delas falha no meio e o lojista tenta de novo.

import { planejarCancelamento, executarCancelamento, avisoDeCancelamento } from '/home/user/Giropecas/src/lib/cancelamento.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

// ---------------------------------------------------------------- banco falso
function bancoFalso(inicial = {}) {
  const tabelas = {};
  const log = [];
  let seq = 0;
  let falharEm = null;   // (entidade, op, dados) => boolean
  const tabela = (n) => (tabelas[n] ||= []);
  for (const [n, linhas] of Object.entries(inicial)) tabelas[n] = linhas.map(l => ({ ...l }));

  const entidade = (nome) => ({
    async filter(q) {
      return tabela(nome).filter(l => Object.entries(q).every(([k, v]) => l[k] === v)).map(l => ({ ...l }));
    },
    async get(id) {
      const l = tabela(nome).find(x => x.id === id);
      if (!l) throw new Error(`${nome} ${id} nao existe`);
      return { ...l };
    },
    async create(dados) {
      if (falharEm?.(nome, 'create', dados)) throw new Error(`falha simulada em ${nome}.create`);
      const l = { id: `${nome}-${++seq}`, ...dados };
      tabela(nome).push(l);
      log.push(`${nome}.create`);
      return { ...l };
    },
    async update(id, dados) {
      if (falharEm?.(nome, 'update', dados)) throw new Error(`falha simulada em ${nome}.update`);
      const l = tabela(nome).find(x => x.id === id);
      Object.assign(l, dados);
      log.push(`${nome}.update`);
      return { ...l };
    },
  });

  const api = Object.fromEntries(
    ['Sale', 'CreditTitle', 'AccountingEntry', 'StockMovement', 'Part', 'NFeRecord'].map(n => [n, entidade(n)]),
  );
  return { api, tabelas, log, falhar: (fn) => { falharEm = fn; } };
}

const C = 'c1';
const HOJE = '2026-09-25';

// Venda de balcão: 2 óleos + 1 filtro, R$ 200 em dinheiro.
function cenarioPdv(extra = {}) {
  return bancoFalso({
    Sale: [{ id: 'v1', company_id: C, type: 'pdv', status: 'pago', total: 200, ...extra.venda }],
    Part: [{ id: 'oleo', stock_quantity: 8 }, { id: 'filtro', stock_quantity: 3 }],
    StockMovement: [
      { id: 'm1', company_id: C, part_id: 'oleo', type: 'saida', quantity: 2, reference_id: 'v1', reference_type: 'sale' },
      { id: 'm2', company_id: C, part_id: 'filtro', type: 'saida', quantity: 1, reference_id: 'v1', reference_type: 'sale' },
    ],
    AccountingEntry: [
      { id: 'a1', company_id: C, type: 'credit', reference_type: 'sale', reference_id: 'v1', amount: 200 },
      ...(extra.lancamentos || []),
    ],
    CreditTitle: extra.titulos || [],
    NFeRecord: extra.notas || [],
  });
}

const planoPdv = (b, venda) => planejarCancelamento({
  api: b.api, companyId: C, venda, estoque: { id: 'v1', tipo: 'sale' }, hoje: HOJE, descricao: 'PDV #1',
});

// ------------------------------------------------------------------- testes
console.log('--- PDV: venda em dinheiro ---');
{
  const b = cenarioPdv();
  const venda = await b.api.Sale.get('v1');
  const plano = await planoPdv(b, venda);
  ok(!plano.bloqueio, 'sem nota, sem bloqueio');
  ok(plano.estorno.valor === 200, 'devolve os 200 que entraram');
  ok(plano.devolucoes.length === 2, 'duas pecas voltam');
  ok(b.log.length === 0, 'planejar nao grava nada');

  const aviso = avisoDeCancelamento(plano, { oque: 'a venda PDV #1' });
  ok(/R\$ 200/.test(aviso) && /2 peça\(s\) voltam/.test(aviso), 'a confirmacao mostra valor e pecas');

  const r = await executarCancelamento({ api: b.api, venda, plano });
  ok(r.devolvido === 200 && r.pecas === 2, 'resultado resume o que foi feito');

  const saida = b.tabelas.AccountingEntry.find(l => l.reference_type === 'refund');
  ok(saida && saida.type === 'debit' && saida.amount === 200, 'saida de 200 no caixa');
  ok(saida.date === HOJE, 'na data do cancelamento');
  ok(b.tabelas.AccountingEntry.some(l => l.id === 'a1'), 'a entrada original fica — o mes dela pode estar fechado');

  const oleo = b.tabelas.Part.find(p => p.id === 'oleo');
  const filtro = b.tabelas.Part.find(p => p.id === 'filtro');
  ok(oleo.stock_quantity === 10 && filtro.stock_quantity === 4, 'estoque: 8+2 e 3+1');
  const dev = b.tabelas.StockMovement.filter(m => m.type === 'devolucao');
  ok(dev.length === 2 && dev.every(m => m.reference_type === 'sale' && m.reference_id === 'v1'),
    'devolucoes ligadas a venda, com o reference_type que o banco aceita');

  ok(b.tabelas.Sale[0].status === 'cancelado', 'venda cancelada');

  // A ORDEM: dinheiro, estoque (movimento antes do saldo), e a venda por ultimo.
  ok(b.log[0] === 'AccountingEntry.create', 'primeiro o dinheiro');
  ok(b.log.at(-1) === 'Sale.update', 'a venda e marcada por ULTIMO');
  const iMov = b.log.indexOf('StockMovement.create');
  const iPart = b.log.indexOf('Part.update');
  ok(iMov >= 0 && iMov < iPart, 'movimento de estoque antes do saldo da peca');
}

console.log('--- PDV: cancelar de novo nao faz nada ---');
{
  const b = cenarioPdv();
  const venda = await b.api.Sale.get('v1');
  await executarCancelamento({ api: b.api, venda, plano: await planoPdv(b, venda) });
  const depois = await b.api.Sale.get('v1');
  const plano2 = await planoPdv(b, depois);
  ok(/já está cancelada/.test(plano2.bloqueio || ''), 'venda ja cancelada: bloqueado');
}

console.log('--- PDV: falha no meio, e o lojista tenta de novo ---');
{
  const b = cenarioPdv();
  let venda = await b.api.Sale.get('v1');
  // O saldo do filtro falha: o dinheiro ja saiu, o oleo ja voltou.
  b.falhar((ent, op, dados) => ent === 'Part' && op === 'update' && dados.stock_quantity === 4);
  let erro = null;
  try { await executarCancelamento({ api: b.api, venda, plano: await planoPdv(b, venda) }); } catch (e) { erro = e; }
  ok(erro, 'a falha chega a tela');
  ok(b.tabelas.Sale[0].status === 'pago', 'a venda NAO ficou cancelada — o botao continua la');

  // Segunda tentativa, sem falha.
  b.falhar(null);
  venda = await b.api.Sale.get('v1');
  const plano2 = await planoPdv(b, venda);
  ok(plano2.estorno.valor === 0, 'o dinheiro ja devolvido nao e devolvido de novo');
  await executarCancelamento({ api: b.api, venda, plano: plano2 });
  const saidas = b.tabelas.AccountingEntry.filter(l => l.reference_type === 'refund');
  ok(saidas.length === 1 && saidas[0].amount === 200, 'uma unica saida de 200 no fim');
  ok(b.tabelas.Part.find(p => p.id === 'oleo').stock_quantity === 10, 'oleo voltou uma vez so');
  // O movimento do filtro foi gravado antes da falha no saldo: a segunda
  // tentativa ve que ele "ja voltou" e nao repete. O saldo da peca fica
  // atras do movimento — e a conferencia de estoque aponta exatamente isso.
  const movFiltro = b.tabelas.StockMovement.filter(m => m.part_id === 'filtro' && m.type === 'devolucao');
  ok(movFiltro.length === 1, 'filtro: um movimento de devolucao, nao dois');
  ok(b.tabelas.Part.find(p => p.id === 'filtro').stock_quantity === 3,
    'filtro: saldo ficou para tras do movimento — e o que a conferencia acusa, nao some calado');
  ok(b.tabelas.Sale[0].status === 'cancelado', 'na segunda tentativa a venda fecha como cancelada');
}

console.log('--- PDV no crediario ---');
{
  const b = cenarioPdv({
    venda: { payment_method: 'crediario' },
    titulos: [
      { id: 't1', company_id: C, sale_id: 'v1', total_amount: 50, paid_amount: 50, status: 'pago' },
      { id: 't2', company_id: C, sale_id: 'v1', total_amount: 50, paid_amount: 0, status: 'a_vencer' },
    ],
    lancamentos: [{ id: 'a2', company_id: C, type: 'credit', reference_type: 'payment', reference_id: 't1', amount: 50 }],
  });
  // entrada de 100 (a1 tem 200 — ajusta para 100)
  b.tabelas.AccountingEntry.find(l => l.id === 'a1').amount = 100;
  const venda = await b.api.Sale.get('v1');
  const plano = await planoPdv(b, venda);
  ok(plano.estorno.valor === 150, 'devolve entrada 100 + parcela paga 50');
  ok(plano.estorno.titulosACancelar.join() === 't2', 'a parcela em aberto e cancelada');
  await executarCancelamento({ api: b.api, venda, plano });
  ok(b.tabelas.CreditTitle.find(t => t.id === 't2').status === 'cancelado', 't2 cancelada');
  ok(b.tabelas.CreditTitle.find(t => t.id === 't1').status === 'pago', 't1 quitada fica como esta');
}

console.log('--- Nota autorizada trava tudo ---');
{
  const b = cenarioPdv({ notas: [{ id: 'n1', company_id: C, sale_id: 'v1', status: 'autorizada', number: '77' }] });
  const venda = await b.api.Sale.get('v1');
  const plano = await planoPdv(b, venda);
  ok(/77/.test(plano.bloqueio || ''), 'bloqueado citando a nota');
  ok(b.log.length === 0, 'nada gravado');
}
{
  const b = cenarioPdv({ notas: [{ id: 'n1', company_id: C, sale_id: 'v1', status: 'cancelada', number: '77' }] });
  ok(!(await planoPdv(b, await b.api.Sale.get('v1'))).bloqueio, 'nota ja cancelada libera');
}

console.log('--- OS: a baixa foi ligada a OS, nao a venda ---');
{
  const b = bancoFalso({
    Sale: [{ id: 'v9', company_id: C, type: 'os', work_order_id: 'os1', status: 'pago', total: 300 }],
    Part: [{ id: 'pneu', stock_quantity: 0 }],
    StockMovement: [{ id: 'm1', company_id: C, part_id: 'pneu', type: 'saida', quantity: 1, reference_id: 'os1', reference_type: 'work_order' }],
    AccountingEntry: [{ id: 'a1', company_id: C, type: 'credit', reference_type: 'sale', reference_id: 'v9', amount: 300 }],
    NFeRecord: [{ id: 'n', company_id: C, work_order_id: 'os1', status: 'autorizada', number: '5' }],
  });
  const venda = await b.api.Sale.get('v9');
  const bloqueada = await planejarCancelamento({ api: b.api, companyId: C, venda, estoque: { id: 'os1', tipo: 'work_order' }, workOrderId: 'os1', hoje: HOJE, descricao: 'OS #1' });
  ok(/5/.test(bloqueada.bloqueio || ''), 'NFS-e da OS tambem trava');

  b.tabelas.NFeRecord[0].status = 'cancelada';
  const plano = await planejarCancelamento({ api: b.api, companyId: C, venda, estoque: { id: 'os1', tipo: 'work_order' }, workOrderId: 'os1', hoje: HOJE, descricao: 'OS #1' });
  await executarCancelamento({ api: b.api, venda, plano });
  ok(b.tabelas.Part[0].stock_quantity === 1, 'o pneu volta pela baixa ligada a OS');
  ok(b.tabelas.StockMovement.some(m => m.type === 'devolucao' && m.reference_type === 'work_order'), 'devolucao ligada a OS');
  ok(b.tabelas.AccountingEntry.some(l => l.reference_type === 'refund' && l.amount === 300), 'devolve os 300');
}

console.log('--- OS nunca paga ---');
{
  const b = bancoFalso({});
  const plano = await planejarCancelamento({ api: b.api, companyId: C, venda: null, estoque: { id: 'os2', tipo: 'work_order' }, workOrderId: 'os2', hoje: HOJE, descricao: 'OS #2' });
  ok(!plano.bloqueio && plano.estorno.valor === 0 && plano.devolucoes.length === 0, 'nada a devolver, nada a travar');
  ok(avisoDeCancelamento(plano, { oque: 'esta OS' }) === 'Cancelar esta OS?', 'confirmacao simples');
}

console.log(f === 0 ? '\n✅ CANCELAMENTO COM DEVOLUCAO OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
