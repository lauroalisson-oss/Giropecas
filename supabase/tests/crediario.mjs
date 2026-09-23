// Crediário: conferências antes de receber, e o que a exclusão atinge.
//
// Receber gera lançamento no caixa, e lançamento errado não se desfaz
// sozinho — some no meio do relatório do mês.

import {
  validarPagamento, aplicarPagamento, emAberto, estaQuitado, resumoCrediario,
} from '/home/user/Giropecas/src/lib/crediario.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const titulo = (extra) => ({
  id: 't1', total_amount: 100, paid_amount: 0, status: 'pendente', ...extra,
});

console.log('--- Saldo em aberto ---');
ok(emAberto(titulo()) === 100, 'nada pago: falta o total');
ok(emAberto(titulo({ paid_amount: 40 })) === 60, 'pago parcial: falta a diferenca');
ok(emAberto(titulo({ paid_amount: 100 })) === 0, 'quitado: nao falta nada');
ok(emAberto(null) === 0, 'titulo nulo nao quebra');
// A conta sai de total - pago, nao da coluna gravada: se remaining_amount
// tiver ficado desatualizado, a tela mostraria um saldo que nao existe.
ok(emAberto({ total_amount: 100, paid_amount: 30, remaining_amount: 999 }) === 70,
  'ignora remaining_amount gravado e recalcula');

console.log('--- Quitado ---');
ok(estaQuitado(titulo({ paid_amount: 100 })), 'pago integral esta quitado');
ok(!estaQuitado(titulo({ paid_amount: 99 })), 'faltando 1 real nao esta quitado');
// Dividir 100 em 3 parcelas deixa centavos de sobra; isso nao e divida.
ok(estaQuitado({ total_amount: 33.34, paid_amount: 33.33 }), 'diferenca de um centavo conta como quitado');

console.log('--- Recebimento: o que e barrado ---');
ok(validarPagamento({ titulo: titulo(), valor: 100 }) === null, 'valor exato passa');
ok(validarPagamento({ titulo: titulo(), valor: 40 }) === null, 'valor parcial passa');
ok(validarPagamento({ titulo: null, valor: 10 })?.erro, 'titulo inexistente e barrado');
ok(validarPagamento({ titulo: titulo(), valor: 0 })?.erro, 'valor zero e barrado');
ok(validarPagamento({ titulo: titulo(), valor: -50 })?.erro, 'valor negativo e barrado');
ok(validarPagamento({ titulo: titulo(), valor: 'abc' })?.erro, 'valor que nao e numero e barrado');

// Clicar duas vezes em "receber" lancava a entrada de novo e inflava o
// faturamento do mes.
const quitado = titulo({ paid_amount: 100, status: 'pago' });
ok(/já está quitado/.test(validarPagamento({ titulo: quitado, valor: 50 })?.erro || ''),
  'titulo ja quitado recusa novo recebimento');
ok(validarPagamento({ titulo: titulo({ status: 'cancelado' }), valor: 10 })?.erro,
  'titulo cancelado nao recebe');

console.log('--- Recebimento acima do saldo ---');
const demais = validarPagamento({ titulo: titulo(), valor: 500 });
ok(demais?.erro, 'valor acima do saldo e barrado');
ok(demais.maximo === 100, 'diz qual e o maximo');
ok(/100/.test(demais.erro), 'a mensagem mostra o valor que falta');
ok(validarPagamento({ titulo: titulo({ paid_amount: 60 }), valor: 41 })?.erro,
  'acima do que resta, mesmo com pagamento parcial antes');
ok(validarPagamento({ titulo: titulo({ paid_amount: 60 }), valor: 40 }) === null,
  'exatamente o que resta passa');
// Dinheiro e comparado em centavos inteiros: comparar reais em ponto
// flutuante da resultado por acaso (0.1 + 0.2 nao e 0.3).
ok(validarPagamento({ titulo: titulo(), valor: 100.004 }) === null,
  'fracao que arredonda para o valor exato passa');
ok(validarPagamento({ titulo: titulo(), valor: 100.01 }) === null,
  'um centavo a mais e tolerado (sobra de divisao em parcelas)');
ok(validarPagamento({ titulo: titulo(), valor: 100.02 })?.erro,
  'dois centavos a mais ja e barrado');
ok(validarPagamento({ titulo: { total_amount: 0.30, paid_amount: 0.10 }, valor: 0.20 }) === null,
  '0.10 + 0.20 = 0.30 sem sobra de ponto flutuante');

console.log('--- Como o titulo fica depois ---');
const parcial = aplicarPagamento({ titulo: titulo(), valor: 40, data: '2026-09-23' });
ok(parcial.paid_amount === 40 && parcial.remaining_amount === 60, 'parcial: soma e desconta');
ok(parcial.status === 'pago_parcial', 'parcial: status pago_parcial');
ok(parcial.payment_date === '2026-09-23', 'guarda a data');

const total = aplicarPagamento({ titulo: titulo({ paid_amount: 60 }), valor: 40 });
ok(total.paid_amount === 100 && total.remaining_amount === 0, 'quitacao: zera o saldo');
ok(total.status === 'pago', 'quitacao: status pago');

// Dinheiro com centavos nao pode acumular lixo de ponto flutuante.
const centavos = aplicarPagamento({ titulo: { total_amount: 100, paid_amount: 0 }, valor: 33.33 });
ok(centavos.paid_amount === 33.33, 'valor com centavos fica exato');
ok(aplicarPagamento({ titulo: { total_amount: 100, paid_amount: 33.33 }, valor: 33.33 }).paid_amount === 66.66,
  'somas sucessivas nao acumulam erro (66.66, nao 66.66000000000001)');

console.log('--- Resumo para o aviso de exclusao ---');
const vazio = resumoCrediario([]);
ok(vazio.titulos === 0 && vazio.comPagamento === 0, 'venda sem crediario nao gera aviso');
ok(resumoCrediario(null).titulos === 0, 'lista nula nao quebra');

const parcelas = [
  { total_amount: 100, paid_amount: 100 },
  { total_amount: 100, paid_amount: 50 },
  { total_amount: 100, paid_amount: 0 },
];
const resumo = resumoCrediario(parcelas);
ok(resumo.titulos === 3, 'conta as parcelas');
ok(resumo.total === 300, 'soma o total');
ok(resumo.recebido === 150, 'soma o que ja entrou');
ok(resumo.aReceber === 150, 'e o que falta receber');
ok(resumo.quitados === 1, 'conta as quitadas');
ok(resumo.comPagamento === 2, 'conta as que tem algum pagamento — e o que dispara o aviso');

// Crediario ainda intocado: apagar nao perde dinheiro recebido.
const intocado = resumoCrediario([{ total_amount: 100, paid_amount: 0 }, { total_amount: 100 }]);
ok(intocado.comPagamento === 0, 'nenhuma parcela paga: aviso mais leve');
ok(intocado.aReceber === 200, 'mas ainda avisa quanto some de divida');

console.log(f === 0 ? '\n✅ CREDIARIO OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
