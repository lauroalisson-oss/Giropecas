// Que botões uma OS oferece em cada estado.
//
// O estorno de OS paga foi entregue testado e inalcançável: o botão
// Cancelar só existia enquanto a OS não estava faturada, e pagar marca a
// OS como faturada. As suítes testavam a conta do estorno; nenhuma
// perguntava se alguém conseguia chegar nela.

import { acoesDaOrdem, ESTADOS_OS } from '/home/user/Giropecas/src/lib/ordens.js';
import { readFileSync } from 'node:fs';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

console.log('--- Toda OS nao cancelada pode ser cancelada ---');
for (const status of ESTADOS_OS.filter(s => s !== 'cancelada')) {
  ok(acoesDaOrdem({ status }).podeCancelar, `'${status}' tem caminho para cancelar`);
}
ok(!acoesDaOrdem({ status: 'cancelada' }).podeCancelar, 'cancelada nao cancela de novo');

console.log('--- Cancelar OS paga e estorno ---');
ok(acoesDaOrdem({ status: 'faturada' }).cancelarDevolveDinheiro, 'faturada: cancelar devolve o dinheiro');
for (const status of ['aberta', 'em_andamento', 'aguardando_peca', 'finalizada']) {
  ok(!acoesDaOrdem({ status }).cancelarDevolveDinheiro, `'${status}': nao ha dinheiro a devolver`);
}

console.log('--- Receber e mudar estado so antes do pagamento ---');
for (const status of ['aberta', 'em_andamento', 'aguardando_peca', 'finalizada']) {
  const a = acoesDaOrdem({ status });
  ok(a.podeReceber && a.podeMudarEstado, `'${status}': recebe e muda de estado`);
}
for (const status of ['faturada', 'cancelada']) {
  const a = acoesDaOrdem({ status });
  ok(!a.podeReceber, `'${status}': nao recebe de novo`);
  ok(!a.podeMudarEstado, `'${status}': estado travado`);
}

console.log('--- Estado desconhecido nao libera nada ---');
for (const o of [null, {}, { status: 'qualquer' }]) {
  const a = acoesDaOrdem(o);
  ok(!a.podeCancelar && !a.podeReceber && !a.podeMudarEstado, `${JSON.stringify(o)}: nenhuma acao`);
}

console.log('--- A tela usa a regra ---');
// Checagem de forma, nao de comportamento: sem biblioteca de renderizacao
// no projeto, o que da para garantir e que a tela consulta esta funcao nos
// dois blocos — o de OS em aberto e o de OS paga.
const tela = readFileSync('/home/user/Giropecas/src/pages/OrdemDetalhe.jsx', 'utf8');
ok(/acoesDaOrdem\(order\)/.test(tela), 'OrdemDetalhe calcula as acoes pela funcao');
ok(/acoes\.cancelarDevolveDinheiro[\s\S]{0,900}onClick=\{cancelOrder\}/.test(tela),
  'o bloco de OS paga chama cancelOrder');
ok(/isActive = acoes\.podeMudarEstado/.test(tela), 'o bloco de OS em aberto usa a mesma regra');

console.log('--- PDV: venda de balcao tambem cancela com devolucao ---');
// Antes, venda de balcao devolvida so podia ser EXCLUIDA — o que apaga a
// venda do mes em que foi feita, em vez de registrar a devolucao no dia.
const hist = readFileSync('/home/user/Giropecas/src/pages/Historico.jsx', 'utf8');
ok(/const handleCancelSale = async/.test(hist), 'o Historico tem o cancelamento de venda');
ok(/sale\.status !== VENDA_CANCELADA[\s\S]{0,300}handleCancelSale\(sale\)/.test(hist),
  'o botao aparece para toda venda nao cancelada');
ok(/planejarCancelamento\(/.test(hist) && /executarCancelamento\(/.test(hist), 'o PDV usa o modulo compartilhado');
ok(/planejarCancelamento\(/.test(tela) && /executarCancelamento\(/.test(tela), 'a OS usa o MESMO modulo');
ok(!/estornoDaVenda\(/.test(tela) && !/estornoDaVenda\(/.test(hist),
  'nenhuma das telas refaz a conta do estorno por conta propria');

console.log(f === 0 ? '\n✅ ACOES DA OS OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
