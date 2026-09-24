// O que entra no caixa no momento da venda.
//
// Venda no crediário não é dinheiro em caixa: o valor financiado vira
// dívida do cliente e só entra quando cada parcela é paga. Sem essa
// separação, a mesma venda era somada duas vezes ao faturamento — uma
// pelo total no fechamento, outra parcela a parcela.

import {
  dividirPagamento, lancamentosDaVenda, taxaDeCartao, totalDeTaxas,
} from '/home/user/Giropecas/src/lib/caixa.js';

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

console.log('--- Taxa de cartao: a soma tem de ser SOMA ---');
// O modal de faturar OS fazia `payments.reduce((s, p) => getCardFee(p), 0)`
// — sem usar o acumulador. Devolvia a taxa do ULTIMO pagamento.
const tabela = [
  { brand: 'Visa', machine: 'Stone', debit_rate: 1.5, credit_rates: { 1: 3, 3: 5 } },
  { brand: 'Visa', machine: 'Cielo', debit_rate: 2.0, credit_rates: { 1: 4.2, 3: 6 } },
  { brand: 'Outras', machine: 'Geral (todas)', debit_rate: 2.5, credit_rates: { 1: 5 } },
];
const noCartao = (extra) => ({
  method: 'cartao_credito', brand: 'Visa', machine: 'Stone',
  installments: 1, amount: 600, ...extra,
});

ok(taxaDeCartao(noCartao()) === 0, 'sem tabela cadastrada, taxa zero');
ok(taxaDeCartao(noCartao(), tabela) === 18, '3% de 600 = 18');

// O caso que sumia: cartao + dinheiro, com o dinheiro por ULTIMO.
const misto = [noCartao({ amount: 600 }), { method: 'dinheiro', amount: 400 }];
ok(totalDeTaxas(misto, tabela) === 18,
  `cartao + dinheiro cobra a taxa do cartao (deu ${totalDeTaxas(misto, tabela)}, antes dava 0)`);

const doisCartoes = [noCartao({ amount: 600 }), noCartao({ amount: 400, installments: 3 })];
ok(totalDeTaxas(doisCartoes, tabela) === 38,
  `dois cartoes somam: 18 + 20 (deu ${totalDeTaxas(doisCartoes, tabela)}, antes dava 20)`);

ok(totalDeTaxas([], tabela) === 0, 'venda sem pagamento');
ok(totalDeTaxas(null, tabela) === 0, 'lista nula');
ok(totalDeTaxas([null, noCartao()], tabela) === 18, 'pagamento nulo no meio');

console.log('--- Taxa de cartao: qual LINHA do cadastro ---');
// A copia do modal ignorava a maquininha e caia em cardRates[0] — a
// primeira linha que o banco devolvesse. Com Stone a 3% e Cielo a 4,2%,
// a mesma venda custava taxas diferentes dependendo da ordem do SELECT.
ok(taxaDeCartao(noCartao({ machine: 'Cielo' }), tabela) === 25.2,
  `usa a linha da Cielo: 4,2% de 600 (deu ${taxaDeCartao(noCartao({ machine: 'Cielo' }), tabela)})`);
ok(taxaDeCartao(noCartao({ machine: 'Stone' }), tabela) === 18, 'usa a linha da Stone: 3%');
ok(taxaDeCartao(noCartao({ machine: 'Rede' }), tabela) === 30,
  'maquininha sem linha propria cai na coringa Geral (5%)');
ok(taxaDeCartao(noCartao({ brand: 'Elo', machine: 'Rede' }), tabela) === 30,
  'bandeira sem linha propria tambem cai na coringa');

// Sem linha nenhuma que sirva, a taxa e zero — e o lojista percebe que
// falta cadastrar. Chutar uma linha qualquer erraria calado.
ok(taxaDeCartao(noCartao({ machine: 'Rede' }), [tabela[0]]) === 0,
  'sem coringa e sem a maquininha, taxa zero em vez de linha errada');

console.log('--- Taxa de cartao: debito, parcelas e bordas ---');
ok(taxaDeCartao(noCartao({ method: 'cartao_debito', amount: 1000 }), tabela) === 15,
  'debito usa debit_rate: 1,5% de 1000');
ok(taxaDeCartao(noCartao({ installments: 3, amount: 1000 }), tabela) === 50, '3x usa a linha de 3 parcelas');
ok(taxaDeCartao(noCartao({ installments: 7 }), tabela) === 0, 'parcela sem taxa cadastrada nao inventa');
ok(taxaDeCartao(noCartao({ installments: null }), tabela) === 18, 'sem parcelas informadas vale 1x');
ok(taxaDeCartao({ method: 'dinheiro', amount: 600 }, tabela) === 0, 'dinheiro nao tem taxa');
ok(taxaDeCartao({ method: 'pix', amount: 600 }, tabela) === 0, 'pix nao tem taxa');
ok(taxaDeCartao({ method: 'crediario', amount: 600 }, tabela) === 0, 'crediario nao tem taxa');
ok(taxaDeCartao(null, tabela) === 0, 'pagamento nulo');
ok(taxaDeCartao(noCartao({ amount: 0 }), tabela) === 0, 'valor zero');

// Centavos: 3% de 33,33 = 0,9999 -> 1,00. Sem arredondar em centavos, o
// debito sairia com casas que o caixa nao sabe representar.
ok(taxaDeCartao(noCartao({ amount: 33.33 }), tabela) === 1,
  `centavos ficam exatos (deu ${taxaDeCartao(noCartao({ amount: 33.33 }), tabela)})`);

console.log('--- A taxa chega ao caixa como despesa ---');
const vendaComTaxa = lancamentosDaVenda({
  total: 1000, pagamentos: misto, taxas: totalDeTaxas(misto, tabela),
  categoria: 'Vendas OS', descricao: 'OS #7', data: '2026-09-24', saleId: 'v9', companyId: 'c1',
});
ok(vendaComTaxa.lancamentos.length === 2, 'um credito da venda e um debito da taxa');
const debitoTaxa = vendaComTaxa.lancamentos.find(l => l.type === 'debit');
ok(debitoTaxa && debitoTaxa.amount === 18, 'o debito e a taxa somada');
ok(debitoTaxa.category === 'Taxas de Cartão', 'lancada na categoria propria');

console.log(f === 0 ? '\n✅ CAIXA OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
