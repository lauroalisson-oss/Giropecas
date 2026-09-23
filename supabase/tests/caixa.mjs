// O que entra no caixa no momento da venda.
//
// Venda no crediário não é dinheiro em caixa: o valor financiado vira
// dívida do cliente e só entra quando cada parcela é paga. Sem essa
// separação, a mesma venda era somada duas vezes ao faturamento — uma
// pelo total no fechamento, outra parcela a parcela.

import { dividirPagamento, lancamentosDaVenda } from '/home/user/Giropecas/src/lib/caixa.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const dinheiro = (amount) => ({ method: 'dinheiro', amount });
const cartao = (amount) => ({ method: 'cartao_credito', amount });
const crediario = (amount) => ({ method: 'crediario', amount });

console.log('--- Venda à vista: tudo entra ---');
let r = dividirPagamento({ total: 100, pagamentos: [dinheiro(100)] });
ok(r.recebidoAgora === 100 && r.financiado === 0, 'dinheiro: entra o total');
r = dividirPagamento({ total: 100, pagamentos: [cartao(100)] });
ok(r.recebidoAgora === 100 && r.financiado === 0, 'cartao: entra o total');
r = dividirPagamento({ total: 100, pagamentos: [dinheiro(60), cartao(40)] });
ok(r.recebidoAgora === 100 && r.financiado === 0, 'misto sem crediario: entra o total');

// Troco nao e faturamento.
r = dividirPagamento({ total: 100, pagamentos: [dinheiro(150)] });
ok(r.recebidoAgora === 100, 'pagou 150 numa venda de 100: entram 100, nao 150');

console.log('--- Venda no crediário: ENTRA SÓ A ENTRADA ---');
// Este e o bug: antes lancava o total (1000) e depois cada parcela.
r = dividirPagamento({ total: 1000, pagamentos: [crediario(1000)], entrada: 200 });
ok(r.recebidoAgora === 200, `entram os 200 da entrada (deu ${r.recebidoAgora})`);
ok(r.financiado === 800, `ficam 800 financiados (deu ${r.financiado})`);

r = dividirPagamento({ total: 1000, pagamentos: [crediario(1000)], entrada: 0 });
ok(r.recebidoAgora === 0, 'sem entrada, nada entra no caixa agora');
ok(r.financiado === 1000, 'tudo financiado');

console.log('--- Crediário misturado com outro meio ---');
// Descontar so a entrada financiaria dinheiro que ja esta no caixa.
r = dividirPagamento({ total: 1000, pagamentos: [dinheiro(300), crediario(700)], entrada: 0 });
ok(r.recebidoAgora === 300, 'os 300 em dinheiro entram');
ok(r.financiado === 700, 'so os 700 sao financiados, nao os 1000');

r = dividirPagamento({ total: 1000, pagamentos: [cartao(200), crediario(800)], entrada: 100 });
ok(r.recebidoAgora === 300, 'entrada + cartao entram (100 + 200)');
ok(r.financiado === 700, 'financia o resto');

console.log('--- Limites ---');
r = dividirPagamento({ total: 1000, pagamentos: [crediario(1000)], entrada: 1500 });
ok(r.recebidoAgora === 1000 && r.financiado === 0, 'entrada maior que o total nao passa do total');
r = dividirPagamento({ total: 1000, pagamentos: [crediario(1000)], entrada: -50 });
ok(r.recebidoAgora === 0 && r.financiado === 1000, 'entrada negativa conta como zero');
r = dividirPagamento({ total: 0, pagamentos: [], entrada: 0 });
ok(r.recebidoAgora === 0 && r.financiado === 0, 'venda zerada nao gera nada');
r = dividirPagamento({ total: 100 });
ok(r.recebidoAgora === 100, 'sem lista de pagamentos, trata como a vista');
r = dividirPagamento({ total: 100, pagamentos: [null, crediario(100)], entrada: 30 });
ok(r.recebidoAgora === 30, 'item nulo na lista nao quebra');

console.log('--- Centavos ---');
r = dividirPagamento({ total: 100, pagamentos: [crediario(100)], entrada: 33.33 });
ok(r.recebidoAgora === 33.33 && r.financiado === 66.67, 'centavos fecham: 33.33 + 66.67 = 100');
r = dividirPagamento({ total: 0.30, pagamentos: [dinheiro(0.10), crediario(0.20)], entrada: 0 });
ok(r.recebidoAgora === 0.10 && r.financiado === 0.20, '0.10 + 0.20 sem sobra de ponto flutuante');

console.log('--- Lançamentos gerados ---');
const aVista = lancamentosDaVenda({
  total: 500, pagamentos: [dinheiro(500)], taxas: 0,
  categoria: 'Vendas PDV', descricao: 'Venda PDV', data: '2026-09-23',
  saleId: 'v1', companyId: 'c1',
});
ok(aVista.lancamentos.length === 1, 'venda à vista sem taxa: um lançamento');
ok(aVista.lancamentos[0].type === 'credit' && aVista.lancamentos[0].amount === 500, 'crédito de 500');
ok(aVista.lancamentos[0].description === 'Venda PDV', 'descrição simples quando nada foi financiado');

const comTaxa = lancamentosDaVenda({
  total: 500, pagamentos: [cartao(500)], taxas: 15,
  categoria: 'Vendas PDV', descricao: 'Venda PDV', data: '2026-09-23', saleId: 'v2', companyId: 'c1',
});
ok(comTaxa.lancamentos.length === 2, 'com taxa: crédito e débito');
const debito = comTaxa.lancamentos.find(l => l.type === 'debit');
ok(debito.amount === 15 && /Taxa/.test(debito.category), 'taxa entra como débito separado');
ok(comTaxa.lancamentos.find(l => l.type === 'credit').amount === 500,
  'a taxa NAO reduz o credito — e despesa, nao faturamento menor');

const noCrediario = lancamentosDaVenda({
  total: 1000, pagamentos: [crediario(1000)], entrada: 200, taxas: 0,
  categoria: 'Vendas OS', descricao: 'Venda OS #101', data: '2026-09-23', saleId: 'v3', companyId: 'c1',
});
ok(noCrediario.lancamentos.length === 1, 'crediário com entrada: um lançamento');
ok(noCrediario.lancamentos[0].amount === 200, 'lança 200, NAO os 1000 da venda');
ok(/entrada/.test(noCrediario.lancamentos[0].description), 'a descrição diz que é a entrada');
ok(noCrediario.financiado === 800, 'devolve quanto ficou financiado');

const semEntrada = lancamentosDaVenda({
  total: 1000, pagamentos: [crediario(1000)], entrada: 0, taxas: 0,
  categoria: 'Vendas OS', descricao: 'Venda OS #102', data: '2026-09-23', saleId: 'v4', companyId: 'c1',
});
ok(semEntrada.lancamentos.length === 0, 'crediário sem entrada: NENHUM lançamento de caixa');

console.log('--- A venda inteira, do fechamento à última parcela ---');
// Venda de 1000: entrada 200 + 4x200. O caixa tem de somar 1000 no fim,
// nao 2000.
const venda = lancamentosDaVenda({
  total: 1000, pagamentos: [crediario(1000)], entrada: 200, taxas: 0,
  categoria: 'Vendas OS', descricao: 'OS #1', data: '2026-09-23', saleId: 'v5', companyId: 'c1',
});
const noFechamento = venda.lancamentos
  .filter(l => l.type === 'credit').reduce((s, l) => s + l.amount, 0);
const parcelasPagas = 4 * 200; // lançadas uma a uma pela tela de Crediário
ok(noFechamento + parcelasPagas === 1000,
  `caixa total = 1000 (deu ${noFechamento + parcelasPagas}) — antes dava 2000`);

console.log(f === 0 ? '\n✅ CAIXA OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
