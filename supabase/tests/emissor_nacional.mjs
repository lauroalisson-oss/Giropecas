// O município da oficina emite pelo Emissor Nacional?
//
// O GiroPeças emite direto no Sefin Nacional, que só aceita DPS de
// município aderente ao Emissor Nacional. Cipó-BA é conveniado ao Ambiente
// Nacional mas emite pelo sistema próprio (Siam/ABRASF) — a oficina de
// teste está lá. A tabela vem da planilha oficial do gov.br.

import { readFileSync } from 'node:fs';
import { chaveMunicipio, usaEmissorNacional, avisoEmissorNacional } from '../../shared/emissor-nacional.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const tabela = JSON.parse(readFileSync(new URL('../../shared/emissor-nacional.json', import.meta.url), 'utf8'));

console.log('--- A tabela ---');
const total = tabela.comEmissorNacional.length + tabela.semEmissorNacional.length;
ok(total === 5571, `todos os municipios do pais (${total})`);
ok(new Set([...tabela.comEmissorNacional, ...tabela.semEmissorNacional]).size === total, 'nenhum municipio nas duas listas');
ok(/^\d{4}-\d{2}-\d{2}$/.test(tabela.atualizado), `com a data da planilha (${tabela.atualizado})`);

console.log('--- Nome como vem do CEP (ViaCEP) ---');
ok(chaveMunicipio('ba', 'Cipó') === 'BA|CIPO', 'sem acento e maiusculo');
ok(chaveMunicipio('PI', "Pau D'Arco do Piauí") === 'PI|PAUDARCODOPIAUI', 'apostrofo e espacos');
ok(usaEmissorNacional({ city: 'Cipó', state: 'BA' }, tabela) === 'nao', 'Cipo-BA: sistema proprio da prefeitura');
ok(usaEmissorNacional({ city: 'Antas', state: 'BA' }, tabela) === 'sim', 'Antas-BA: Emissor Nacional');
ok(usaEmissorNacional({ city: 'Salvador', state: 'BA' }, tabela) === 'nao', 'Salvador: sistema proprio');
ok(usaEmissorNacional({ city: 'Brasília', state: 'DF' }, tabela) !== null, 'Brasilia e achada');
ok(usaEmissorNacional({ city: 'Cidade Inventada', state: 'BA' }, tabela) === null, 'nome desconhecido: sem resposta (nao chuta)');
ok(usaEmissorNacional({ city: 'Cipó' }, tabela) === null, 'sem UF: sem resposta');

console.log('--- O aviso ---');
const aviso = avisoEmissorNacional({ city: 'Cipó', state: 'ba' }, tabela);
ok(/Cipó\/BA não emite NFS-e pelo Emissor Nacional/.test(aviso || ''), 'diz o municipio');
ok(/recusada/.test(aviso) && /prefeitura ou o contador/.test(aviso), 'diz a consequencia e com quem confirmar');
ok(/lista oficial de \d{2}\/\d{2}\/\d{4}/.test(aviso), 'diz de quando e a lista');
ok(avisoEmissorNacional({ city: 'Antas', state: 'BA' }, tabela) === null, 'municipio aderente: sem aviso');
ok(avisoEmissorNacional({ city: 'Cipó', state: 'BA' }, null) === null, 'sem a tabela carregada: sem aviso');

console.log(f === 0 ? '\n✅ EMISSOR NACIONAL OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
