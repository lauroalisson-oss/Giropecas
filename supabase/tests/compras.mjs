// Compras e contas a pagar: operações que só podem acontecer uma vez.
//
// Receber uma compra soma ao estoque; marcar uma conta como paga lança
// uma saída no caixa. Nenhuma das duas se desfaz sozinha, e as duas
// estavam ao alcance de um clique duplo — o botão só sumia DEPOIS de a
// tela recarregar.

import {
  podeReceber, podePagar, impactoExclusaoConta,
  podeRegistrarPagamento, dataDePagamento, lancamentoPagamentoCompra,
  situacaoCompra, aPagarEmCompras,
} from '/home/user/Giropecas/src/lib/compras.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const compra = (extra) => ({
  id: 'oc1', status: 'rascunho',
  items: [{ part_id: 'p1', quantity: 10, unit_cost: 5 }],
  ...extra,
});

console.log('--- Receber uma compra ---');
ok(podeReceber(compra()) === null, 'rascunho com peças pode ser recebida');
ok(podeReceber(compra({ status: 'enviada' })) === null, 'enviada pode ser recebida');

// O bug: clicar duas vezes dava entrada em dobro no estoque.
const jaRecebida = podeReceber(compra({ status: 'recebida' }));
ok(jaRecebida?.erro, 'compra já recebida é barrada');
ok(/já foi recebida/.test(jaRecebida.erro), 'a mensagem diz o motivo');
ok(/estoque já foi somado/.test(jaRecebida.erro), 'e explica a consequência');

ok(podeReceber(compra({ status: 'cancelada' }))?.erro, 'compra cancelada é barrada');
ok(podeReceber(null)?.erro, 'compra inexistente é barrada');
ok(podeReceber(compra({ items: [] }))?.erro, 'compra sem itens é barrada');
ok(podeReceber(compra({ items: null }))?.erro, 'itens nulos são barrados');
// Item sem peça não dá entrada em nada.
ok(podeReceber(compra({ items: [{ quantity: 5 }] }))?.erro, 'item sem peça é barrado');
ok(podeReceber(compra({ items: [{ quantity: 5 }, { part_id: 'p2', quantity: 1 }] })) === null,
  'basta uma peça válida na lista');

console.log('--- Pagar uma conta ---');
const conta = (extra) => ({ id: 'c1', status: 'a_vencer', amount: 250, ...extra });

ok(podePagar(conta()) === null, 'conta a vencer pode ser paga');
ok(podePagar(conta({ status: 'vencido' })) === null, 'conta vencida pode ser paga');

// O bug: clicar duas vezes lançava a despesa em dobro no caixa.
const jaPaga = podePagar(conta({ status: 'pago' }));
ok(jaPaga?.erro, 'conta já paga é barrada');
ok(/lançamento no caixa já foi feito/.test(jaPaga.erro), 'a mensagem explica o risco');

ok(podePagar(conta({ status: 'cancelado' }))?.erro, 'conta cancelada é barrada');
ok(podePagar(null)?.erro, 'conta inexistente é barrada');
ok(podePagar(conta({ amount: 0 }))?.erro, 'conta sem valor é barrada');
ok(podePagar(conta({ amount: null }))?.erro, 'valor nulo é barrado');
ok(podePagar(conta({ amount: -50 }))?.erro, 'valor negativo é barrado');
ok(podePagar(conta({ amount: 0.01 })) === null, 'um centavo é valor válido');

console.log('--- Excluir uma conta ---');
const naoPaga = impactoExclusaoConta(conta());
ok(naoPaga.paga === false, 'conta a vencer não está paga');
ok(naoPaga.removeLancamento === false, 'sem pagamento, não há lançamento para remover');

// Excluir conta paga deixava a saida no caixa sem nada atras dela.
const paga = impactoExclusaoConta(conta({ status: 'pago' }));
ok(paga.paga === true, 'reconhece a conta paga');
ok(paga.removeLancamento === true, 'o lançamento de caixa sai junto');
ok(paga.valor === 250, 'informa o valor, para o aviso mostrar');

ok(impactoExclusaoConta(null).paga === false, 'conta nula não quebra');
ok(impactoExclusaoConta(null).valor === 0, 'conta nula tem valor zero');
ok(impactoExclusaoConta({ status: 'pago', amount: 33.33 }).valor === 33.33, 'centavos ficam exatos');

console.log('--- Recebimento e pagamento sao fatos separados ---');
// A peca entra no estoque numa data; o dinheiro sai em outra, ate 30
// dias depois. Misturar os dois joga a despesa no mes errado.
const recebidaNaoPaga = { id: 'oc9', status: 'recebida', payment_status: 'pendente', total: 1500 };
const sit = situacaoCompra(recebidaNaoPaga);
ok(sit.recebida === true, 'recebida');
ok(sit.paga === false, 'ainda nao paga');
ok(sit.custoPendente === true, 'peca no estoque com custo pendente');

const compraPaga = situacaoCompra({ status: 'recebida', payment_status: 'pago' });
ok(compraPaga.paga === true && compraPaga.custoPendente === false, 'paga: nao ha custo pendente');

const soPedida = situacaoCompra({ status: 'rascunho', payment_status: 'pendente' });
ok(soPedida.custoPendente === false, 'compra ainda nao recebida nao conta como custo pendente');
ok(situacaoCompra(null).recebida === false, 'compra nula nao quebra');

console.log('--- Registrar o pagamento ---');
ok(podeRegistrarPagamento(recebidaNaoPaga) === null, 'compra recebida e pendente pode ser paga');
// Pagar antes de receber e normal: a vista, ou sinal ao fornecedor.
ok(podeRegistrarPagamento({ status: 'enviada', payment_status: 'pendente', total: 100 }) === null,
  'da para pagar antes de receber (compra a vista)');

const jaPagaCompra = podeRegistrarPagamento({ status: 'recebida', payment_status: 'pago', total: 100 });
ok(jaPagaCompra?.erro, 'compra ja paga e barrada');
ok(/custo já entrou no caixa/.test(jaPagaCompra.erro), 'a mensagem explica o risco');

ok(podeRegistrarPagamento({ status: 'cancelada', total: 100 })?.erro, 'compra cancelada e barrada');
ok(podeRegistrarPagamento({ status: 'recebida', total: 0 })?.erro, 'compra sem valor e barrada');
ok(podeRegistrarPagamento(null)?.erro, 'compra inexistente e barrada');

console.log('--- A DATA e o que decide o mes do custo ---');
const hoje = new Date().toISOString().split('T')[0];
ok(dataDePagamento('2026-08-15') === '2026-08-15', 'usa a data informada');
ok(dataDePagamento('') === hoje, 'sem data, usa hoje');
ok(dataDePagamento(null) === hoje, 'data nula, usa hoje');
ok(dataDePagamento('15/08/2026') === hoje, 'formato invalido cai para hoje, nao grava lixo');
ok(dataDePagamento('  2026-08-15  ') === '2026-08-15', 'apara espacos');

console.log('--- Lancamento do custo ---');
const lanc = lancamentoPagamentoCompra({
  compra: { id: 'oc9', order_number: 'OC-000123', total: 1500 },
  data: '2026-08-15', companyId: 'c1',
});
ok(lanc.type === 'debit', 'custo e saida, nao entrada');
ok(lanc.amount === 1500, 'valor da compra');
ok(lanc.date === '2026-08-15', 'lancado na DATA DO PAGAMENTO, nao na de hoje');
ok(lanc.reference_type === 'purchase' && lanc.reference_id === 'oc9', 'aponta para a compra');
ok(/OC-000123/.test(lanc.description), 'descricao identifica a ordem');
ok(lancamentoPagamentoCompra({ compra: { total: 33.33 }, data: '2026-08-15' }).amount === 33.33,
  'centavos ficam exatos');

// Pagamento lancado com atraso tem de cair no mes em que aconteceu.
const atrasado = lancamentoPagamentoCompra({
  compra: { id: 'x', total: 500 }, data: '2026-07-02', companyId: 'c1',
});
ok(atrasado.date.startsWith('2026-07'), 'pagamento de julho lancado em setembro cai em julho');

console.log('--- Quanto ha de custo pendente ---');
const carteira = [
  { status: 'recebida', payment_status: 'pendente', total: 1500 },
  { status: 'recebida', payment_status: 'pendente', total: 933 },
  { status: 'recebida', payment_status: 'pago', total: 5590 },
  { status: 'rascunho', payment_status: 'pendente', total: 200 },
];
const pend = aPagarEmCompras(carteira);
ok(pend.quantidade === 2, 'conta so as recebidas e nao pagas');
ok(pend.total === 2433, `soma 1500 + 933 (deu ${pend.total})`);
ok(aPagarEmCompras([]).quantidade === 0, 'carteira vazia');
ok(aPagarEmCompras(null).total === 0, 'lista nula nao quebra');

console.log(f === 0 ? '\n✅ COMPRAS E CONTAS A PAGAR OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
