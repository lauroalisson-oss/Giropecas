// Devolução de estoque ao desfazer uma venda ou uma OS.
//
// O estoque só é baixado no PAGAMENTO. Antes disso, a OS pode ter peças
// lançadas sem nada ter saído da prateleira. Somar de volta a lista de
// peças sem olhar o que foi movimentado é o que fazia a exclusão de uma
// OS nunca paga INVENTAR peças no estoque.

import { saldoADevolver, temBaixaDeEstoque } from '/home/user/Giropecas/src/lib/estoque.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const saida = (part_id, quantity) => ({ part_id, quantity, type: 'saida' });
const volta = (part_id, quantity) => ({ part_id, quantity, type: 'devolucao' });
const qtdDe = (lista, id) => lista.find(i => i.part_id === id)?.quantity ?? 0;

console.log('--- OS nunca paga: nada saiu, nada volta ---');
// Este e o bug: antes, excluir uma OS aberta somava as pecas ao estoque.
ok(saldoADevolver([]).length === 0, 'sem movimento, nao ha o que devolver');
ok(temBaixaDeEstoque([]) === false, 'sem movimento, nao houve baixa');
ok(saldoADevolver(null).length === 0, 'lista nula nao quebra');
ok(saldoADevolver(undefined).length === 0, 'lista ausente nao quebra');

console.log('--- OS paga: devolve o que saiu ---');
const pago = [saida('p1', 2), saida('p2', 1)];
const r = saldoADevolver(pago);
ok(r.length === 2, 'duas pecas para devolver');
ok(qtdDe(r, 'p1') === 2, 'devolve as 2 unidades da p1');
ok(qtdDe(r, 'p2') === 1, 'devolve a unidade da p2');
ok(temBaixaDeEstoque(pago) === true, 'reconhece que houve baixa');

console.log('--- Nao devolver duas vezes ---');
// Devolver em dobro erra tanto quanto nao devolver: a oficina passaria a
// contar peca que nao existe.
ok(saldoADevolver([saida('p1', 2), volta('p1', 2)]).length === 0,
  'ja devolvido nao devolve de novo');
ok(qtdDe(saldoADevolver([saida('p1', 5), volta('p1', 2)]), 'p1') === 3,
  'devolucao parcial: falta devolver o resto');
ok(saldoADevolver([saida('p1', 2), volta('p1', 5)]).length === 0,
  'devolucao maior que a saida nao vira saldo negativo');

console.log('--- Mesma peca em varios lancamentos ---');
ok(qtdDe(saldoADevolver([saida('p1', 1), saida('p1', 3)]), 'p1') === 4,
  'soma as saidas da mesma peca');
const misto = saldoADevolver([saida('p1', 4), volta('p1', 1), saida('p2', 2)]);
ok(qtdDe(misto, 'p1') === 3 && qtdDe(misto, 'p2') === 2, 'cada peca com a sua conta');

console.log('--- Movimentos que nao sao baixa nem devolucao ---');
// Entrada de compra e ajuste de inventario nao tem nada a ver com
// desfazer uma venda; entrar na conta bagunçaria o estoque.
ok(saldoADevolver([{ part_id: 'p1', quantity: 10, type: 'entrada' }]).length === 0,
  'entrada de compra nao entra na conta');
ok(saldoADevolver([{ part_id: 'p1', quantity: 10, type: 'ajuste' }]).length === 0,
  'ajuste de inventario nao entra na conta');
ok(qtdDe(saldoADevolver([saida('p1', 2), { part_id: 'p1', quantity: 9, type: 'entrada' }]), 'p1') === 2,
  'entrada no meio nao altera o que ha para devolver');

console.log('--- Dados estranhos ---');
ok(saldoADevolver([{ quantity: 3, type: 'saida' }]).length === 0, 'movimento sem peca e ignorado');
ok(saldoADevolver([saida('p1', 0)]).length === 0, 'quantidade zero nao gera devolucao');
ok(saldoADevolver([saida('p1', -2)]).length === 0, 'quantidade negativa e ignorada');
ok(saldoADevolver([{ part_id: 'p1', quantity: null, type: 'saida' }]).length === 0, 'quantidade nula e ignorada');
ok(qtdDe(saldoADevolver([{ part_id: 'p1', quantity: '3', type: 'saida' }]), 'p1') === 3,
  'quantidade como texto e convertida');
ok(saldoADevolver([null, saida('p1', 1)]).length === 1, 'item nulo no meio nao quebra');

console.log('--- Caso completo de uma oficina ---');
// OS #101: 2 oleos e 1 filtro, paga. Cliente desiste, OS cancelada.
const os101 = [saida('oleo', 2), saida('filtro', 1)];
const devolver = saldoADevolver(os101);
ok(devolver.length === 2, 'cancelamento devolve as duas pecas');

// Cancelada e, por engano, cancelada de novo (ou excluida em seguida).
const depois = [...os101, volta('oleo', 2), volta('filtro', 1)];
ok(saldoADevolver(depois).length === 0, 'repetir a operacao nao devolve de novo');

console.log(f === 0 ? '\n✅ DEVOLUCAO DE ESTOQUE OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
