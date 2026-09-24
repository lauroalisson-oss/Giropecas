// Indicadores gerenciais.
//
// São os números que o dono da oficina usa para decidir preço, compra e
// comissão. Um indicador errado aqui não dá erro em lugar nenhum — só
// leva a uma decisão ruim.

import {
  custoDasVendas, comissoes, inadimplencia, dre,
} from '/home/user/Giropecas/src/lib/relatorios.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const HOJE = '2026-09-23';
const pecas = {
  oleo: { id: 'oleo', description: 'Óleo', cost_price: 30 },
  filtro: { id: 'filtro', description: 'Filtro', cost_price: 12 },
};

console.log('--- CMV: o custo sai do ITEM, nao do cadastro atual ---');
// O cadastro guarda o ULTIMO custo de compra e muda a cada entrada. Usa-lo
// faz a margem de um mes passado mudar sozinha quando chega compra nova:
// o mesmo relatorio daria numeros diferentes a cada semana.
const vendaComCusto = {
  total: 200,
  items: [{ type: 'part', part_id: 'oleo', quantity: 2, cost_price: 25, total_price: 200 }],
};
const c1 = custoDasVendas([vendaComCusto], pecas);
ok(c1.total === 50, `usa o custo gravado (2 x 25 = 50, deu ${c1.total})`);
ok(c1.estimado === false, 'com custo no item, o CMV e exato');
// Se caisse no cadastro, daria 2 x 30 = 60 — a margem do mes passado
// encolheria so porque o oleo subiu de preco depois.
ok(c1.total !== 60, 'nao usa o custo atual do cadastro');

console.log('--- CMV: venda antiga, sem custo no item ---');
const vendaSemCusto = { total: 200, items: [{ type: 'part', part_id: 'oleo', quantity: 2 }] };
const c2 = custoDasVendas([vendaSemCusto], pecas);
ok(c2.total === 60, 'cai para o cadastro atual');
ok(c2.estimado === true, 'e AVISA que o numero e aproximado');
ok(c2.semCustoNoItem === 1, 'conta quantos itens ficaram sem custo');

const misto = custoDasVendas([vendaComCusto, vendaSemCusto], pecas);
ok(misto.total === 110, 'soma os dois (50 + 60)');
ok(misto.estimado === true, 'basta um item sem custo para marcar como aproximado');

console.log('--- CMV: o que nao entra ---');
ok(custoDasVendas([{ items: [{ type: 'service', total_price: 150 }] }], pecas).total === 0,
  'servico nao tem CMV');
ok(custoDasVendas([{ items: [{ type: 'part', part_id: 'x', quantity: 1 }] }], pecas).total === 0,
  'peca fora do cadastro nao inventa custo');
ok(custoDasVendas([{ items: [{ type: 'part', part_id: 'oleo', quantity: 0, cost_price: 25 }] }], pecas).total === 0,
  'quantidade zero');
ok(custoDasVendas([], pecas).total === 0, 'sem vendas');
ok(custoDasVendas(null, pecas).total === 0, 'lista nula');
ok(custoDasVendas([null, vendaComCusto], pecas).total === 50, 'venda nula no meio');
ok(custoDasVendas([{ items: null }], pecas).total === 0, 'venda sem itens');
ok(custoDasVendas([{ items: [null] }], pecas).total === 0, 'item nulo');
ok(custoDasVendas([{ items: [{ type: 'part', part_id: 'oleo', quantity: 3, cost_price: 0.10 }] }], pecas).total === 0.30,
  'centavos sem sobra de ponto flutuante');

console.log('--- Comissoes: OS cancelada nao paga comissao ---');
const tecnicos = { m1: { id: 'm1', name: 'João', commission_percent: 10 } };
const os = (extra) => ({
  mechanic_id: 'm1', status: 'faturada',
  service_items: [{ total_price: 1000 }], ...extra,
});

ok(comissoes([os()], tecnicos).total === 100, '10% de 1000 = 100');
// Era o bug: a OS cancelada entrava na conta e o mecanico recebia por
// servico que nao foi cobrado.
ok(comissoes([os({ status: 'cancelada' })], tecnicos).total === 0, 'OS cancelada nao gera comissao');
ok(comissoes([os(), os({ status: 'cancelada' })], tecnicos).total === 100, 'so a valida conta');

// A regra de qual OS gera comissao e UMA SO, em lib/comissoes.js. Aqui
// bastava nao estar cancelada: uma OS ainda na bancada entrava no DRE
// como comissao devida, e o painel de Tecnicos, que ja exigia a
// conclusao, mostrava outro numero para o mesmo mes.
ok(comissoes([os({ status: 'aberta' })], tecnicos).total === 0, 'OS aberta nao gera comissao');
ok(comissoes([os({ status: 'em_andamento' })], tecnicos).total === 0, 'OS em andamento nao gera');
ok(comissoes([os({ status: 'aguardando_peca' })], tecnicos).total === 0, 'OS parada por peca nao gera');
ok(comissoes([os({ status: 'finalizada' })], tecnicos).total === 100, 'OS finalizada gera');

ok(comissoes([os({ mechanic_id: null })], tecnicos).total === 0, 'OS sem mecanico');
ok(comissoes([os({ mechanic_id: 'desconhecido' })], tecnicos).total === 0, 'mecanico fora do cadastro');
ok(comissoes([os()], { m1: { name: 'João' } }).total === 0, 'mecanico sem percentual definido');
ok(comissoes([os({ service_items: [] })], tecnicos).total === 0, 'OS so com pecas nao gera comissao de mao de obra');
ok(comissoes([os({ service_items: null })], tecnicos).total === 0, 'service_items nulo');
ok(comissoes(null, tecnicos).total === 0, 'lista nula');
ok(comissoes([null, os()], tecnicos).total === 100, 'item nulo no meio');

const duas = comissoes([os(), os({ service_items: [{ total_price: 500 }] })], tecnicos);
ok(duas.total === 150, 'soma as OS do mesmo mecanico');
ok(duas.detalhe.length === 1 && duas.detalhe[0].nome === 'João', 'agrupa por mecanico, com o nome');

console.log('--- Inadimplencia: sai da DATA, nao do status gravado ---');
// Era o bug mais silencioso: o status 'vencido' so existe em memoria nas
// telas e nunca chega ao banco. Filtrar por ele dava SEMPRE zero.
const parc = (extra) => ({ total_amount: 100, paid_amount: 0, status: 'a_vencer', due_date: '2026-10-10', ...extra });

const semStatus = inadimplencia([
  parc({ due_date: '2026-08-01' }),   // vencida ha quase 2 meses
  parc({ due_date: '2026-10-10' }),   // a vencer
], HOJE);
ok(semStatus.vencido === 100, `reconhece a vencida pela data (deu ${semStatus.vencido})`);
ok(semStatus.parcelasVencidas === 1, 'conta as parcelas vencidas');
ok(semStatus.aReceber === 200, 'a receber e o total em aberto');
ok(semStatus.taxa === 50, '100 de 200 = 50%');

ok(inadimplencia([parc({ due_date: HOJE })], HOJE).vencido === 0, 'o que vence hoje ainda nao e atraso');
ok(inadimplencia([parc({ due_date: '2026-09-22' })], HOJE).vencido === 100, 'venceu ontem ja e atraso');

console.log('--- Inadimplencia: o que fica de fora ---');
ok(inadimplencia([parc({ due_date: '2026-08-01', paid_amount: 100 })], HOJE).vencido === 0,
  'parcela quitada nao e inadimplencia, mesmo vencida');
ok(inadimplencia([parc({ due_date: '2026-08-01', status: 'cancelado' })], HOJE).vencido === 0,
  'parcela cancelada nao conta');
ok(inadimplencia([parc({ due_date: null })], HOJE).vencido === 0, 'parcela sem vencimento nao conta como atraso');
ok(inadimplencia([], HOJE).taxa === 0, 'carteira vazia: taxa zero, nao divisao por zero');
ok(inadimplencia(null, HOJE).aReceber === 0, 'lista nula');

// Pago parcial: so o que falta esta vencido.
const parcial = inadimplencia([parc({ due_date: '2026-08-01', paid_amount: 60 })], HOJE);
ok(parcial.vencido === 40, 'vencido e o saldo em aberto, nao o valor cheio');

// A taxa e sobre o que esta EM ABERTO. Dividir pelo historico faria a
// taxa encolher sozinha a cada venda nova, escondendo a piora.
const comHistorico = inadimplencia([
  parc({ due_date: '2026-08-01' }),
  parc({ due_date: '2026-07-01', paid_amount: 100 }),  // ja quitada
  parc({ due_date: '2026-06-01', paid_amount: 100 }),  // ja quitada
], HOJE);
ok(comHistorico.taxa === 100, 'quitadas nao diluem a taxa (100 de 100 em aberto)');

console.log('--- DRE completo ---');
const r = dre({
  vendas: [
    { total: 1000, items: [{ type: 'part', part_id: 'oleo', quantity: 10, cost_price: 30 }] },
    { total: 500, items: [{ type: 'service', total_price: 500 }] },
  ],
  ordens: [os({ service_items: [{ total_price: 500 }] })],
  pecaPorId: pecas,
  tecnicoPorId: tecnicos,
});
ok(r.receita === 1500, 'receita = 1000 + 500');
ok(r.cmv === 300, 'CMV = 10 x 30');
ok(r.lucroBruto === 1200, 'lucro bruto = 1500 - 300');
ok(r.margemBruta === 80, 'margem = 1200/1500 = 80%');
ok(r.comissoes === 50, 'comissao = 10% de 500');
ok(r.lucroOperacional === 1150, 'operacional = 1200 - 50');
ok(r.cmvEstimado === false, 'CMV exato: todo item tinha custo');

const vazio = dre({ vendas: [], ordens: [], pecaPorId: {}, tecnicoPorId: {} });
ok(vazio.receita === 0 && vazio.margemBruta === 0, 'periodo sem venda nao divide por zero');


console.log('--- DRE: venda cancelada fica de fora ---');
// OS paga e cancelada: o dinheiro voltou ao cliente e a peca ao estoque.
const comCancelada = dre({
  vendas: [
    { total: 1000, status: 'pago', items: [{ type: 'part', part_id: 'oleo', quantity: 10, cost_price: 30 }] },
    { total: 700, status: 'cancelado', items: [{ type: 'part', part_id: 'oleo', quantity: 5, cost_price: 30 }] },
  ],
  ordens: [], pecaPorId: pecas, tecnicoPorId: tecnicos,
});
ok(comCancelada.receita === 1000, `receita ignora a cancelada (deu ${comCancelada.receita})`);
ok(comCancelada.cmv === 300, 'e o custo dela tambem — a peca voltou ao estoque');

console.log(f === 0 ? '\n✅ RELATORIOS GERENCIAIS OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
