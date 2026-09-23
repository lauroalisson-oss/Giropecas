// Projeção de fluxo de caixa.
//
// É a tela em que o lojista decide se pode comprar peça este mês. Um
// número otimista aqui custa dinheiro de verdade.

import {
  aReceber, aPagar, saldoAtual, projetarFluxo,
} from '/home/user/Giropecas/src/lib/fluxo.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const HOJE = '2026-09-23';
const titulo = (extra) => ({
  id: 't', title_number: '0001', status: 'a_vencer',
  total_amount: 100, paid_amount: 0, due_date: '2026-10-10', ...extra,
});
const conta = (extra) => ({
  id: 'b', description: 'Energia', status: 'a_vencer',
  amount: 300, due_date: '2026-10-05', ...extra,
});

console.log('--- A receber: o VENCIDO nao pode sumir ---');
// Era o bug: o filtro `due_date >= hoje` escondia da projecao justamente
// a parcela atrasada — a que a oficina mais precisa enxergar.
const r = aReceber([
  titulo({ id: 'a', due_date: '2026-09-01' }),   // vencida
  titulo({ id: 'b', due_date: HOJE }),           // vence hoje
  titulo({ id: 'c', due_date: '2026-10-10' }),   // a vencer
], HOJE);
ok(r.atraso.length === 1, 'a vencida aparece em atraso');
ok(r.aVencer.length === 2, 'hoje e futuro contam como a vencer');
ok(r.atraso[0].valor === 100, 'atraso leva o valor em aberto');

console.log('--- A receber: o que fica de fora ---');
ok(aReceber([titulo({ status: 'pago', paid_amount: 100 })], HOJE).aVencer.length === 0, 'quitada nao entra');
ok(aReceber([titulo({ status: 'cancelado' })], HOJE).aVencer.length === 0, 'cancelada nao entra');
ok(aReceber([], HOJE).aVencer.length === 0, 'lista vazia');
ok(aReceber(null, HOJE).atraso.length === 0, 'lista nula nao quebra');
ok(aReceber([null, titulo()], HOJE).aVencer.length === 1, 'item nulo no meio');
ok(aReceber([titulo({ due_date: null })], HOJE).semData.length === 1, 'parcela sem vencimento fica em separado');

console.log('--- A receber: o valor sai de total menos pago ---');
// A coluna remaining_amount pode ter ficado defasada; usa-la mostraria
// dinheiro que nao vem.
const parcial = aReceber([titulo({ paid_amount: 60, remaining_amount: 999 })], HOJE);
ok(parcial.aVencer[0].valor === 40, `recalcula: 100 - 60 = 40 (deu ${parcial.aVencer[0].valor})`);
// remaining_amount zerado com status errado nao pode virar o total.
ok(aReceber([titulo({ paid_amount: 100, remaining_amount: 0, status: 'pago_parcial' })], HOJE).aVencer.length === 0,
  'sem saldo real, nao entra mesmo com status inconsistente');

console.log('--- A pagar: compra recebida e nao paga tambem e divida ---');
// A peca ja esta na prateleira; o fornecedor vai cobrar. Ficava de fora
// porque a projecao so olhava a tela de Contas a Pagar.
const p = aPagar({
  contas: [conta({ id: 'x', due_date: '2026-09-01' }), conta({ id: 'y' })],
  compras: [
    { order_number: 'OC-1', status: 'recebida', payment_status: 'pendente', total: 1500 },
    { order_number: 'OC-2', status: 'recebida', payment_status: 'pago', total: 900 },
    { order_number: 'OC-3', status: 'rascunho', payment_status: 'pendente', total: 700 },
  ],
}, HOJE);
ok(p.atraso.length === 1, 'conta vencida entra em atraso');
ok(p.aVencer.length === 1, 'conta a vencer entra a vencer');
ok(p.semData.length === 1, 'a compra pendente entra sem data');
ok(p.semData[0].valor === 1500, 'com o valor da compra');
ok(p.semData[0].origem === 'compra', 'marcada como compra, para a tela distinguir');
ok(!p.semData.some(x => /OC-2/.test(x.descricao)), 'compra ja paga nao entra');
ok(!p.semData.some(x => /OC-3/.test(x.descricao)), 'compra nao recebida ainda nao e divida');

ok(aPagar({ contas: [conta({ status: 'pago' })], compras: [] }, HOJE).aVencer.length === 0, 'conta paga nao entra');
ok(aPagar({ contas: [conta({ amount: 0 })], compras: [] }, HOJE).aVencer.length === 0, 'conta sem valor nao entra');
ok(aPagar({}, HOJE).atraso.length === 0, 'sem nada nao quebra');
ok(aPagar({ contas: null, compras: null }, HOJE).semData.length === 0, 'listas nulas nao quebram');

console.log('--- Saldo atual ---');
ok(saldoAtual([{ type: 'credit', amount: 1000 }, { type: 'debit', amount: 300 }]) === 700, 'entradas menos saidas');
ok(saldoAtual([]) === 0, 'sem lancamento, saldo zero');
ok(saldoAtual(null) === 0, 'lista nula');
ok(saldoAtual([{ type: 'debit', amount: 100 }]) === -100, 'saldo pode ser negativo');
ok(saldoAtual([null, { type: 'credit', amount: 50 }]) === 50, 'item nulo no meio');
ok(saldoAtual([{ type: 'credit', amount: 0.10 }, { type: 'credit', amount: 0.20 }]) === 0.30,
  'centavos sem sobra de ponto flutuante');

console.log('--- Projecao completa ---');
const fx = projetarFluxo({
  titulos: [
    titulo({ id: '1', due_date: '2026-09-01', total_amount: 200 }),  // atrasada
    titulo({ id: '2', due_date: '2026-09-25', total_amount: 150 }),
    titulo({ id: '3', due_date: '2026-10-15', total_amount: 150 }),
  ],
  contas: [conta({ due_date: '2026-09-28', amount: 300 })],
  compras: [{ order_number: 'OC-9', status: 'recebida', payment_status: 'pendente', total: 1500 }],
  lancamentos: [{ type: 'credit', amount: 5000 }, { type: 'debit', amount: 1200 }],
  hoje: HOJE,
  dias: 30,
});

ok(fx.saldoAtual === 3800, 'saldo atual = 5000 - 1200');
ok(fx.atraso.receber === 200, 'atraso a receber aparece em separado');
ok(fx.atraso.pagar === 0, 'nada em atraso a pagar');
ok(fx.semData.pagar === 1500, 'a compra pendente aparece como a pagar sem data');
ok(fx.projecao.length === 30, '30 dias de projecao');
ok(fx.projecao[0].data === HOJE, 'a projecao comeca hoje');

const dia25 = fx.projecao.find(d => d.data === '2026-09-25');
ok(dia25.receber === 150, 'a parcela cai no dia dela');
const dia28 = fx.projecao.find(d => d.data === '2026-09-28');
ok(dia28.pagar === 300, 'a conta cai no dia dela');
// O atraso nao pode ser jogado num dia da projecao: nao se sabe quando entra.
ok(fx.projecao.every(d => d.receber !== 200), 'a parcela atrasada nao e chutada em nenhum dia');

// 30 dias a partir de 23/09 vai ate 23/10: pega as duas parcelas.
ok(fx.janelas.d30.receber === 300, `30 dias: 25/09 e 15/10 (deu ${fx.janelas.d30.receber})`);
ok(fx.janelas.d30.pagar === 300, '30 dias: a conta de 28/09');
ok(fx.janelas.d30.saldo === 0, '30 dias: 300 a receber menos 300 a pagar');
ok(fx.janelas.d90.receber === 300, '90 dias: nao ha mais nada depois');

console.log('--- Virada de mes na projecao ---');
const virada = projetarFluxo({
  titulos: [titulo({ due_date: '2026-10-01', total_amount: 80 })],
  contas: [], compras: [], lancamentos: [],
  hoje: '2026-09-29', dias: 5,
});
ok(virada.projecao.map(d => d.data).includes('2026-10-01'), 'a projecao atravessa a virada do mes');
ok(virada.projecao.find(d => d.data === '2026-10-01').receber === 80, 'e a parcela cai no dia certo');

console.log(f === 0 ? '\n✅ FLUXO DE CAIXA OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
