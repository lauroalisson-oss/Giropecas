// Comissão do mecânico.
//
// É dinheiro saindo do bolso do dono para o de um funcionário, e uma vez
// pago não volta. O painel fazia a conta dentro da tela e reconhecia o
// pagamento pelo NOME do mecânico escrito na descrição do lançamento.

import {
  geraComissao, competenciaDe, competenciaDaOrdem, resumoComissoes,
  totaisComissoes, podePagarComissao, lancamentoComissao, REFERENCIA_COMISSAO,
} from '/home/user/Giropecas/src/lib/comissoes.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const ana = { id: 't1', name: 'Ana', commission_percent: 10, monthly_goal: 5000 };
const anaPaula = { id: 't2', name: 'Ana Paula', commission_percent: 10 };

const os = (extra) => ({
  id: 'o1', mechanic_id: 't1', status: 'faturada',
  closed_at: '2026-09-15', service_items: [{ total_price: 1000 }], ...extra,
});
const pago = (extra) => ({
  reference_type: REFERENCIA_COMISSAO, reference_id: 't1',
  competencia: '2026-09', amount: 100, date: '2026-10-02', ...extra,
});

const linhaDe = (p) => resumoComissoes(p)[0];

console.log('--- Que OS gera comissao ---');
ok(geraComissao({ status: 'faturada' }), 'faturada gera');
ok(geraComissao({ status: 'finalizada' }), 'finalizada gera');
ok(!geraComissao({ status: 'cancelada' }), 'cancelada nao gera');
// Era a divergencia: o relatorio contava tudo que nao fosse cancelada e
// punha no DRE a comissao de servico que ainda estava na bancada.
ok(!geraComissao({ status: 'aberta' }), 'OS aberta nao gera: o servico nao comecou');
ok(!geraComissao({ status: 'em_andamento' }), 'em andamento nao gera');
ok(!geraComissao({ status: 'aguardando_peca' }), 'parada esperando peca nao gera');
ok(!geraComissao(null), 'ordem nula nao gera');

console.log('--- Competencia: o mes do SERVICO ---');
ok(competenciaDe('2026-09-15') === '2026-09', 'extrai o mes');
ok(competenciaDe('2026-01-01') === '2026-01', 'dia 1 nao escorrega de mes');
ok(competenciaDe('2026-12-31') === '2026-12', 'ultimo dia do ano fica em dezembro');
ok(competenciaDe(null) === null, 'sem data, sem competencia');
ok(competenciaDe('quinze de setembro') === null, 'data invalida nao vira lixo');
ok(competenciaDaOrdem(os()) === '2026-09', 'usa o fechamento da OS');
ok(competenciaDaOrdem(os({ closed_at: null, created_date: '2026-08-03' })) === '2026-08',
  'sem fechamento, cai na abertura');

console.log('--- O calculo ---');
const set = linhaDe({ ordens: [os()], tecnicos: [ana], pagamentos: [], competencia: '2026-09' });
ok(set.maoDeObra === 1000, 'mao de obra da competencia');
ok(set.gerado === 100, '10% de 1000');
ok(set.ordens === 1, 'conta as OS');
ok(set.pago === 0 && set.pendente === 100, 'nada pago ainda');

// Competencia errada nao entra.
const out = linhaDe({ ordens: [os({ closed_at: '2026-08-15' })], tecnicos: [ana], pagamentos: [], competencia: '2026-09' });
ok(out.gerado === 0, 'OS de agosto nao entra em setembro');

const tudo = linhaDe({ ordens: [os(), os({ id: 'o2', closed_at: '2026-08-15' })], tecnicos: [ana], pagamentos: [] });
ok(tudo.gerado === 200, 'sem competencia, soma todo o periodo');

console.log('--- Percentual ausente nao vira NaN ---');
// Sem guarda, serviceRevenue * (undefined/100) = NaN. E NaN nao e maior
// nem menor que nada: o botao de pagar sumia e o aviso de quitado
// tambem. A tela ficava muda.
const semPct = linhaDe({ ordens: [os({ mechanic_id: 't9' })], tecnicos: [{ id: 't9', name: 'Novo' }], pagamentos: [] });
ok(semPct.gerado === 0, 'mecanico sem percentual gera zero');
ok(!Number.isNaN(semPct.gerado), 'e zero de verdade, nao NaN');
ok(linhaDe({ ordens: [os({ mechanic_id: 't9' })], tecnicos: [{ id: 't9', commission_percent: 0 }], pagamentos: [] }).gerado === 0,
  'percentual zero gera zero');

console.log('--- O pagamento sai do ID, nao do NOME ---');
// A armadilha: `description.includes('Ana')` casa com "Comissão paga:
// Ana Paula". A Ana aparecia paga e ficava sem receber.
const duas = resumoComissoes({
  ordens: [os({ mechanic_id: 't1' }), os({ id: 'o2', mechanic_id: 't2' })],
  tecnicos: [ana, anaPaula],
  pagamentos: [pago({ reference_id: 't2' })],   // pagou a Ana Paula
  competencia: '2026-09',
});
ok(duas[0].pago === 0, 'pagar a Ana Paula NAO quita a Ana');
ok(duas[0].pendente === 100, 'a Ana continua a receber');
ok(duas[1].pago === 100, 'a Ana Paula consta paga');

// Renomear o mecanico nao pode desligar o que ja foi pago.
const renomeada = linhaDe({
  ordens: [os()], tecnicos: [{ ...ana, name: 'Ana Souza' }],
  pagamentos: [pago()], competencia: '2026-09',
});
ok(renomeada.pago === 100, 'renomear o mecanico nao apaga o pagamento');

// Lancamento de outra natureza nao conta como comissao.
ok(linhaDe({ ordens: [os()], tecnicos: [ana], pagamentos: [pago({ reference_type: 'manual' })], competencia: '2026-09' }).pago === 0,
  'lancamento avulso nao vira comissao paga');

console.log('--- A COMPETENCIA, nao a data do pagamento ---');
// A comissao de setembro paga em 2 de outubro. Antes: sumia de setembro
// (o lancamento nao e de setembro) e virava saldo negativo em outubro
// (as OS nao sao de outubro). A mesma comissao ficava a pagar para
// sempre numa tela e negativa na outra.
const setPagoEmOutubro = linhaDe({
  ordens: [os()], tecnicos: [ana],
  pagamentos: [pago({ competencia: '2026-09', date: '2026-10-02' })],
  competencia: '2026-09',
});
ok(setPagoEmOutubro.pago === 100, 'pago em outubro, consta em SETEMBRO');
ok(setPagoEmOutubro.pendente === 0, 'e setembro fica quitado');

const outubro = linhaDe({
  ordens: [os()], tecnicos: [ana],
  pagamentos: [pago({ competencia: '2026-09', date: '2026-10-02' })],
  competencia: '2026-10',
});
ok(outubro.gerado === 0 && outubro.pago === 0 && outubro.pendente === 0,
  'e outubro nao fica com saldo negativo');

console.log('--- Meta ---');
ok(linhaDe({ ordens: [os({ service_items: [{ total_price: 6000 }] })], tecnicos: [ana], pagamentos: [], competencia: '2026-09' }).metaAtingida,
  'meta de 5000 com 6000 de servico: atingida');
ok(!set.metaAtingida, 'meta de 5000 com 1000: nao atingida');
ok(linhaDe({ ordens: [os()], tecnicos: [anaPaula], pagamentos: [] }).metaAtingida === false,
  'mecanico sem meta nao aparece como tendo atingido');
ok(linhaDe({ ordens: [os()], tecnicos: [anaPaula], pagamentos: [] }).metaPct === 0,
  'sem meta, sem divisao por zero');

console.log('--- Totais ---');
const t = totaisComissoes([
  { gerado: 100, pago: 0, pendente: 100 },
  { gerado: 200, pago: 200, pendente: 0 },
]);
ok(t.gerado === 300 && t.pago === 200 && t.aPagar === 100, 'soma as linhas');

// Pagamento a mais (clique duplo, valor digitado errado) nao pode inflar
// o "total gerado". Antes o gerado era pago + pendente, e so o pendente
// tinha piso zero: 200 pagos numa comissao de 100 viravam 200 de gerado.
const demais = totaisComissoes([{ gerado: 100, pago: 200, pendente: -100 }]);
ok(demais.gerado === 100, `gerado continua 100 (deu ${demais.gerado})`);
ok(demais.aPagar === 0, 'nada a pagar');
ok(demais.pagoAMais === 100, 'e o excesso aparece em separado, para o dono ver');
ok(totaisComissoes([]).gerado === 0, 'sem mecanicos');
ok(totaisComissoes(null).pago === 0, 'lista nula');

console.log('--- Quando pode pagar ---');
const linhaOk = { tecnico: ana, gerado: 100, pago: 0, pendente: 100 };
ok(podePagarComissao(linhaOk, '2026-09') === null, 'comissao gerada e nao paga pode ser paga');

// O bug: o botao so sumia DEPOIS de a tela recarregar. Dois cliques,
// duas saidas no caixa.
const jaPaga = podePagarComissao({ tecnico: ana, gerado: 100, pago: 100, pendente: 0 }, '2026-09');
ok(jaPaga?.erro, 'comissao ja paga e barrada');
ok(/já foi paga/.test(jaPaga.erro), 'a mensagem diz o motivo');
ok(/caixa/.test(jaPaga.erro), 'e explica a consequencia');

ok(podePagarComissao(linhaOk, null)?.erro, 'sem mes escolhido, nao paga');
ok(/mês a mês/.test(podePagarComissao(linhaOk, null).erro), 'e explica por que');
ok(podePagarComissao({ tecnico: ana, gerado: 0, pendente: 0 }, '2026-09')?.erro, 'sem comissao gerada, nao paga');
ok(podePagarComissao({ gerado: 100, pendente: 100 }, '2026-09')?.erro, 'sem mecanico identificado, nao paga');
ok(podePagarComissao(null, '2026-09')?.erro, 'linha nula e barrada');

console.log('--- O lancamento ---');
const l = lancamentoComissao({ tecnico: ana, valor: 100, competencia: '2026-09', data: '2026-10-02', companyId: 'c1' });
ok(l.type === 'debit', 'comissao e saida');
ok(l.amount === 100, 'valor da comissao');
ok(l.date === '2026-10-02', 'lancada na data em que o dinheiro saiu');
ok(l.competencia === '2026-09', 'mas carregando o mes que quita');
ok(l.reference_type === REFERENCIA_COMISSAO && l.reference_id === 't1', 'aponta para o mecanico por ID');
ok(/Ana/.test(l.description), 'a descricao ainda diz o nome, para quem le o extrato');
ok(lancamentoComissao({ tecnico: ana, valor: 33.33, competencia: '2026-09' }).amount === 33.33,
  'centavos ficam exatos');

console.log(f === 0 ? '\n✅ COMISSOES OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
