// Devolução de estoque ao desfazer uma venda ou uma OS.
//
// O estoque só é baixado no PAGAMENTO. Antes disso, a OS pode ter peças
// lançadas sem nada ter saído da prateleira. Somar de volta a lista de
// peças sem olhar o que foi movimentado é o que fazia a exclusão de uma
// OS nunca paga INVENTAR peças no estoque.

import {
  saldoADevolver, temBaixaDeEstoque, faltaEmEstoque, avisoFaltaEmEstoque, devolucaoDeEstoque,
  estoqueMinimo, estoqueBaixo, efeitoNoSaldo, saldoPelosMovimentos, ajusteDeEstoque, movimentoSaldoInicial,
} from '/home/user/Giropecas/src/lib/estoque.js';
import { readFileSync } from 'node:fs';

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

console.log('--- Estoque que nao cobre a baixa ---');
// Acontece de verdade: a peca foi instalada na moto, mas o cadastro
// dizia ter menos. Math.max(0, ...) zerava e engolia a diferenca — a
// oficina seguia achando que a contagem batia.
const catalogo = {
  oleo: { description: 'Oleo 20W50', stock_quantity: 5 },
  filtro: { description: 'Filtro de oleo', stock_quantity: 1 },
  vela: { description: 'Vela', stock_quantity: 0 },
};

ok(faltaEmEstoque([{ part_id: 'oleo', quantity: 3 }], catalogo).length === 0,
  'saldo suficiente nao gera aviso');
ok(faltaEmEstoque([{ part_id: 'oleo', quantity: 5 }], catalogo).length === 0,
  'levar exatamente o saldo nao gera aviso');

const falta = faltaEmEstoque([{ part_id: 'filtro', quantity: 3 }], catalogo);
ok(falta.length === 1, 'saldo menor que o pedido gera aviso');
ok(falta[0].falta === 2, `diz quanto faltou (deu ${falta[0].falta})`);
ok(falta[0].saldo === 1 && falta[0].pedido === 3, 'guarda o saldo e o pedido');
ok(falta[0].descricao === 'Filtro de oleo', 'usa a descricao do cadastro');

ok(faltaEmEstoque([{ part_id: 'vela', quantity: 1 }], catalogo)[0].falta === 1,
  'peca zerada: falta tudo o que saiu');

const varias = faltaEmEstoque(
  [{ part_id: 'oleo', quantity: 2 }, { part_id: 'filtro', quantity: 3 }, { part_id: 'vela', quantity: 1 }],
  catalogo);
ok(varias.length === 2, 'lista so as que faltaram, nao as que estavam ok');

console.log('--- Entradas estranhas ---');
ok(faltaEmEstoque([], catalogo).length === 0, 'lista vazia');
ok(faltaEmEstoque(null, catalogo).length === 0, 'lista nula');
ok(faltaEmEstoque([{ part_id: 'oleo', quantity: 3 }], null).length === 0, 'sem catalogo nao inventa falta');
ok(faltaEmEstoque([{ part_id: 'nao-existe', quantity: 3 }], catalogo).length === 0,
  'peca fora do catalogo e ignorada');
ok(faltaEmEstoque([{ quantity: 3 }], catalogo).length === 0, 'item sem peca e ignorado');
ok(faltaEmEstoque([{ part_id: 'filtro', quantity: 0 }], catalogo).length === 0, 'quantidade zero');
ok(faltaEmEstoque([{ part_id: 'filtro', quantity: -2 }], catalogo).length === 0, 'quantidade negativa');
ok(faltaEmEstoque([null, { part_id: 'filtro', quantity: 3 }], catalogo).length === 1, 'item nulo no meio');
// Peca sem estoque cadastrado conta como zero, nao como "sem limite".
ok(faltaEmEstoque([{ part_id: 'x', quantity: 1 }], { x: { description: 'X' } })[0].falta === 1,
  'estoque nao cadastrado conta como zero');

console.log('--- Aviso na tela ---');
ok(avisoFaltaEmEstoque([]) === null, 'sem falta, sem aviso');
ok(avisoFaltaEmEstoque(null) === null, 'lista nula, sem aviso');
const aviso = avisoFaltaEmEstoque(varias);
ok(/2 peça\(s\)/.test(aviso), 'diz quantas pecas');
ok(/Filtro de oleo \(tinha 1, saiu 3\)/.test(aviso), 'mostra o que tinha e o que saiu');
ok(/Confira a contagem/.test(aviso), 'diz o que fazer');
ok(/foi registrada como aconteceu/.test(aviso), 'deixa claro que a baixa nao foi bloqueada');


console.log('--- Devolucao ao estoque: o que o banco aceita e a ordem ---');
// Gravava reference_type = 'estorno' (recusado pelo banco) e somava a peca
// ANTES de gravar o movimento. Cada tentativa de cancelar uma OS paga
// inflava o estoque; o cancelamento nunca concluia.
const saidasOS = [
  { part_id: 'oleo', type: 'saida', quantity: 3 },
  { part_id: 'filtro', type: 'saida', quantity: 1 },
];
const passosDev = devolucaoDeEstoque({
  movimentos: saidasOS, estoqueAtual: { oleo: 10, filtro: 0 },
  referenceId: 'os1', referenceType: 'work_order', motivo: 'Cancelamento da OS #1', companyId: 'c1',
});
ok(passosDev.length === 2, 'uma devolucao por peca que saiu');
const oleoDev = passosDev.find(p => p.part_id === 'oleo');
ok(oleoDev.movimento.type === 'devolucao', 'o type diz que e devolucao');
ok(oleoDev.movimento.reference_type === 'work_order', 'o reference_type diz para onde o id aponta');
ok(oleoDev.movimento.reference_id === 'os1', 'ligado a OS, para o saldo fechar');
ok(oleoDev.movimento.previous_stock === 10 && oleoDev.movimento.new_stock === 13, 'registra antes e depois');
ok(oleoDev.novoEstoque === 13, 'o saldo novo e o que vai para a peca');
ok(passosDev.find(p => p.part_id === 'filtro').novoEstoque === 1, 'peca zerada volta para 1');
ok(Object.keys(passosDev[0])[2] === 'movimento' && Object.keys(passosDev[0])[3] === 'novoEstoque',
  'cada passo traz o movimento antes do saldo — a ordem de gravacao');

// Repetir depois de gravado nao devolve de novo.
const repetida = devolucaoDeEstoque({
  movimentos: [...saidasOS, ...passosDev.map(p => p.movimento)],
  estoqueAtual: { oleo: 13, filtro: 1 }, referenceId: 'os1', referenceType: 'work_order',
});
ok(repetida.length === 0, 'cancelar de novo nao devolve de novo');

ok(devolucaoDeEstoque({ movimentos: [], referenceId: 'v1', referenceType: 'sale' }).length === 0,
  'nada saiu, nada volta');
let barrou = false;
try { devolucaoDeEstoque({ movimentos: saidasOS, referenceId: 'os1', referenceType: 'estorno' }); } catch { barrou = true; }
ok(barrou, "'estorno' e recusado aqui, antes de chegar ao banco");
ok(devolucaoDeEstoque({ movimentos: saidasOS, referenceId: 'os1', referenceType: 'work_order' })[0].movimento.previous_stock === 0,
  'sem estoque atual informado, parte de zero em vez de NaN');


{ // escopo proprio
console.log('--- Ajuste manual: a contagem fisica manda ---');
const peca = { id: 'p1', stock_quantity: 10 };
// Estoque ATUAL no banco e 8: saiu uma venda de 2 depois que a tela abriu.
const aj = ajusteDeEstoque({ peca, atual: 8, contado: '5', motivo: 'Contagem', companyId: 'c1' });
ok(aj.novoEstoque === 5, 'o estoque passa a ser o contado');
ok(aj.diferenca === -3, `a diferenca e contra o estoque ATUAL: 5 - 8 = -3 (deu ${aj.diferenca})`);
ok(aj.movimento.previous_stock === 8, 'antes = o do banco, nao o 10 da tela velha');
ok(aj.movimento.quantity === 3 && aj.movimento.type === 'ajuste', 'movimento de ajuste de 3');
ok(aj.movimento.reference_type === 'manual', 'reference_type aceito pelo banco');

ok(ajusteDeEstoque({ peca, atual: 8, contado: '', motivo: 'x' }).erro, 'campo vazio NAO zera o estoque');
ok(/Informe a quantidade/.test(ajusteDeEstoque({ peca, atual: 8, contado: '  ', motivo: 'x' }).erro), 'so espacos tambem nao');
ok(ajusteDeEstoque({ peca, atual: 8, contado: 'abc', motivo: 'x' }).erro, 'texto nao e quantidade');
ok(ajusteDeEstoque({ peca, atual: 8, contado: '-1', motivo: 'x' }).erro, 'contagem negativa e recusada');
ok(ajusteDeEstoque({ peca, atual: 8, contado: '5' }).erro, 'sem motivo e recusado');
ok(/já está em 8/.test(ajusteDeEstoque({ peca, atual: 8, contado: '8', motivo: 'x' }).erro), 'sem diferenca, nada a ajustar');
ok(ajusteDeEstoque({ peca, atual: 8, contado: '0', motivo: 'Perda total' }).novoEstoque === 0, 'zerar de proposito, com motivo, pode');
ok(ajusteDeEstoque({ peca, atual: 2, contado: '2,5', motivo: 'Oleo a granel' }).novoEstoque === 2.5, 'aceita virgula decimal (litros)');
ok(ajusteDeEstoque({ peca: null, atual: 8, contado: '5', motivo: 'x' }).erro, 'peca nula');

console.log('--- O sinal do ajuste ---');
// Gravava so o modulo. A conferencia contava zero e a tela mostrava "-"
// ate para o ajuste que ACHOU pecas.
const paraMais = ajusteDeEstoque({ peca, atual: 8, contado: '12', motivo: 'Achei uma caixa' }).movimento;
const paraMenos = ajusteDeEstoque({ peca, atual: 8, contado: '5', motivo: 'Perda' }).movimento;
ok(efeitoNoSaldo(paraMais) === 4, 'ajuste para mais soma');
ok(efeitoNoSaldo(paraMenos) === -3, 'ajuste para menos subtrai');
ok(efeitoNoSaldo({ type: 'entrada', quantity: 5 }) === 5, 'entrada soma');
ok(efeitoNoSaldo({ type: 'devolucao', quantity: 2 }) === 2, 'devolucao soma');
ok(efeitoNoSaldo({ type: 'saida', quantity: 3 }) === -3, 'saida subtrai');
ok(efeitoNoSaldo({ type: 'desconhecido', quantity: 3 }) === 0, 'tipo desconhecido nao mexe');
ok(efeitoNoSaldo(null) === 0, 'nulo');

console.log('--- Saldo inicial vira movimento ---');
// Peca cadastrada com 10 e vendida em 2: saldo 8, movimentos -2. A
// conferencia acusava divergencia de 10 em toda peca criada com estoque.
const nova = { id: 'p9', stock_quantity: 10 };
const ini = movimentoSaldoInicial({ peca: nova, companyId: 'c1' });
ok(ini.type === 'entrada' && ini.quantity === 10, 'o saldo inicial e uma entrada');
ok(ini.previous_stock === 0 && ini.new_stock === 10, 'de 0 para 10');
ok(movimentoSaldoInicial({ peca: { id: 'x', stock_quantity: 0 } }) === null, 'sem estoque, sem movimento');
ok(movimentoSaldoInicial({ peca: { stock_quantity: 5 } }) === null, 'sem id, sem movimento');

const historia = [ini, { type: 'saida', quantity: 2 }, paraMenos && { ...paraMenos, previous_stock: 8, new_stock: 5 }];
ok(saldoPelosMovimentos(historia) === 5, `cadastro 10, venda 2, contagem 5: saldo pelos movimentos = 5 (deu ${saldoPelosMovimentos(historia)})`);
ok(saldoPelosMovimentos([{ type: 'saida', quantity: 2 }]) === -2, 'sem o saldo inicial, a conta nao fecha — era o bug');

console.log('--- A conferencia SQL faz a mesma conta ---');
const sql = readFileSync('/home/user/Giropecas/supabase/tests/conferencia.sql', 'utf8');
ok(/when\s+type\s*=\s*'ajuste'/i.test(sql), 'a conferencia conta o ajuste');
ok(/new_stock(\s*,\s*0\s*\))?\s*-\s*(coalesce\(\s*)?previous_stock/i.test(sql), 'e tira o sinal do antes/depois, como efeitoNoSaldo');

console.log('--- Estoque minimo ---');
ok(estoqueMinimo({ min_stock: 0 }) === 0, 'minimo 0 fica 0 (antes virava 1)');
ok(estoqueMinimo({ min_stock: 5 }) === 5, 'minimo 5');
ok(estoqueMinimo({ min_stock: '3' }) === 3, 'texto vira numero');
ok(estoqueMinimo({}) === 1, 'sem minimo definido, 1');
ok(estoqueMinimo({ min_stock: null }) === 1, 'nulo, 1');
ok(estoqueMinimo({ min_stock: '' }) === 1, 'vazio, 1');
ok(estoqueMinimo({ min_stock: -2 }) === 1, 'negativo nao e minimo, 1');
ok(!estoqueBaixo({ stock_quantity: 0, min_stock: 0 }) === false, 'minimo 0 com estoque 0: ainda e baixo (0 <= 0)');
ok(!estoqueBaixo({ stock_quantity: 1, min_stock: 0 }), 'minimo 0 com estoque 1: nao alerta (antes alertava)');
ok(estoqueBaixo({ stock_quantity: 1 }), 'sem minimo, 1 unidade alerta');
}

console.log(f === 0 ? '\n✅ DEVOLUCAO DE ESTOQUE OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
