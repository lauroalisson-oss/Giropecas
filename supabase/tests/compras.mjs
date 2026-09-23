// Compras e contas a pagar: operações que só podem acontecer uma vez.
//
// Receber uma compra soma ao estoque; marcar uma conta como paga lança
// uma saída no caixa. Nenhuma das duas se desfaz sozinha, e as duas
// estavam ao alcance de um clique duplo — o botão só sumia DEPOIS de a
// tela recarregar.

import { podeReceber, podePagar, impactoExclusaoConta } from '/home/user/Giropecas/src/lib/compras.js';

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

console.log(f === 0 ? '\n✅ COMPRAS E CONTAS A PAGAR OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
