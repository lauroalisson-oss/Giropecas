// Resolução do código de tributação nacional.
//
// A mesma função atende duas pontas: o cadastro do serviço, que avisa o
// lojista enquanto ele digita, e a montagem da DPS, que recusa o que o
// Sefin recusaria. O que importa é que as duas concordem — divergência
// aqui só apareceria com o cliente esperando pela nota.

import {
  resolverCTribNac, codigoTributacaoNacional, descricaoCTribNac,
  desdobrosDoItem, TABELA_CTRIBNAC,
} from '/home/user/Giropecas/shared/ctribnac.js';
import { codigoTributacaoNacional as viaDps } from '/home/user/Giropecas/api/_lib/nfse-dps.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

console.log('--- O caso da oficina ---');
const oficina = resolverCTribNac('14.01');
ok(oficina.ok && oficina.codigo === '140101', 'item 14.01 resolve para 140101');
ok(/conserto/i.test(oficina.descricao), 'traz a descricao oficial');
ok(resolverCTribNac('1401').codigo === '140101', 'aceita sem o ponto');
ok(resolverCTribNac('140101').codigo === '140101', 'aceita o codigo de 6 digitos');
ok(resolverCTribNac(' 14.01 ').codigo === '140101', 'ignora espacos');

console.log('--- Item ambiguo (62 dos 338 tem mais de um desdobro) ---');
const ambiguo = resolverCTribNac('10.01');
ok(!ambiguo.ok && ambiguo.motivo === 'ambiguo', '10.01 e ambiguo');
ok(ambiguo.opcoes.length === 5, `oferece os 5 desdobros (deu ${ambiguo.opcoes?.length})`);
ok(ambiguo.opcoes.every(o => o.codigo.startsWith('1001') && o.descricao), 'cada opcao tem codigo e descricao');
ok(/Escolha o código de 6 dígitos/.test(ambiguo.mensagem), 'diz o que fazer');
// A tela oferece as opcoes; escolher uma tem de resolver.
ok(resolverCTribNac(ambiguo.opcoes[0].codigo).ok, 'escolher uma opcao resolve');

console.log('--- Recusas ---');
const inexistente = resolverCTribNac('140100');
ok(!inexistente.ok && inexistente.motivo === 'inexistente', '140100 (o antigo derivado) nao existe');
ok(!resolverCTribNac('99.99').ok, 'item fora da LC 116');
ok(resolverCTribNac('').motivo === 'vazio', 'vazio e tratado como vazio, nao como erro');
ok(resolverCTribNac(null).motivo === 'vazio', 'nulo idem');
ok(resolverCTribNac('abc').motivo === 'vazio', 'texto sem digito idem');
ok(!resolverCTribNac('14').ok, 'so o item, sem subitem, nao resolve');
ok(!resolverCTribNac('1401011').ok, 'digitos demais nao resolve');

console.log('--- As duas pontas concordam ---');
// Esta e a razao de o modulo ser compartilhado.
const amostra = ['14.01', '140101', '10.01', '140100', '99.99', '', '14'];
for (const entrada of amostra) {
  const r = resolverCTribNac(entrada);
  let viaExcecao = null;
  try { viaExcecao = codigoTributacaoNacional(entrada); } catch { viaExcecao = null; }
  ok(r.ok ? viaExcecao === r.codigo : viaExcecao === null,
    `"${entrada}": cadastro e emissao decidem igual`);
}
ok(viaDps('14.01') === codigoTributacaoNacional('14.01'),
  'nfse-dps usa exatamente a mesma resolucao (nao uma copia)');

console.log('--- Tabela ---');
const todos = Object.keys(TABELA_CTRIBNAC);
ok(todos.length === 338, `338 codigos (tem ${todos.length})`);
ok(todos.every(c => /^\d{6}$/.test(c)), 'todo codigo tem 6 digitos');
ok(todos.every(c => resolverCTribNac(c).ok), 'todo codigo da tabela e aceito');
ok(!todos.some(c => c.endsWith('00')), 'nenhum termina em 00 — era o erro da deducao antiga');
ok(todos.every(c => typeof TABELA_CTRIBNAC[c] === 'string' && TABELA_CTRIBNAC[c].length > 5),
  'todo codigo tem descricao util');
ok(descricaoCTribNac('140101') === TABELA_CTRIBNAC['140101'], 'descricaoCTribNac le da tabela');
ok(descricaoCTribNac('000000') === null, 'codigo inexistente nao tem descricao');

console.log('--- Desdobros de um item ---');
ok(desdobrosDoItem('14.01').length === 1, '14.01 tem um desdobro');
ok(desdobrosDoItem('10.01').length === 5, '10.01 tem cinco');
ok(desdobrosDoItem('99.99').length === 0, 'item inexistente nao tem desdobro');
ok(desdobrosDoItem('').length === 0, 'vazio nao quebra');
ok(desdobrosDoItem('140101').length === 1, 'codigo de 6 digitos usa os 4 primeiros');

// Todo item ambiguo tem de oferecer escolha; nenhum pode ficar sem saida.
const ambiguos = [...new Set(todos.map(c => c.slice(0, 4)))]
  .filter(i => desdobrosDoItem(i).length > 1);
ok(ambiguos.length === 62, `62 itens ambiguos (achou ${ambiguos.length})`);
ok(ambiguos.every(i => resolverCTribNac(i).opcoes?.length > 1),
  'todo item ambiguo oferece as opcoes para escolher');

console.log(f === 0 ? '\n✅ CODIGO DE TRIBUTACAO NACIONAL OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
