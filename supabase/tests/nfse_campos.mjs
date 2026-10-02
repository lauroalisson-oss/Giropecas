// Campos digitados pelo lojista, nos limites do schema da NFS-e.
// (A prova contra o XSD de verdade está em nfse_xsd.mjs; aqui, cada regra.)

import {
  textoLeiaute, telefoneLeiaute, emailLeiaute, codigoTributacaoMunicipal, inscricaoMunicipal, descricaoServico,
} from '../../shared/nfse-campos.js';
import { pendenciasNfse } from '../../src/lib/nfse-dados.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

console.log('--- Texto de uma linha (TSString) ---');
ok(textoLeiaute('  Rua A  ') === 'Rua A', 'sem espaco nas pontas');
ok(textoLeiaute('São João – Centro') === 'São João - Centro', 'travessao vira hifen, acento fica');
ok(textoLeiaute('“Oficina” d’Ávila') === '"Oficina" d\'Ávila', 'aspas curvas viram retas');
ok(textoLeiaute('Casa 🚗 2') === 'Casa 2', 'emoji sai e o espaco duplo junta');
ok(textoLeiaute('linha1\nlinha2') === 'linha1 linha2', 'quebra de linha vira espaco');
ok(textoLeiaute('🚗') === '', 'so emoji: vazio');
ok(textoLeiaute('x'.repeat(70), 60).length === 60, 'corta no limite');
ok(textoLeiaute(null) === '' && textoLeiaute(undefined) === '', 'nulo vira vazio');
ok(/^[\x20-\xFF]*$/.test(textoLeiaute('Ação nº 5 — “ok” …')), 'resultado so tem caracteres aceitos');

console.log('--- Telefone e e-mail (opcionais) ---');
ok(telefoneLeiaute('(75) 99999-0000') === '75999990000', 'telefone com DDD');
ok(telefoneLeiaute('9999') === '', 'curto demais: fica de fora');
ok(telefoneLeiaute('') === '', 'vazio');
ok(emailLeiaute(' joao@oficina.com ') === 'joao@oficina.com', 'e-mail valido');
ok(emailLeiaute('joao@') === '' && emailLeiaute('joao') === '', 'e-mail invalido fica de fora');
ok(emailLeiaute(`${'a'.repeat(75)}@x.com`) === '', 'e-mail acima de 80 fica de fora');

console.log('--- Codigo de tributacao do municipio ---');
ok(codigoTributacaoMunicipal('001').codigo === '001', '3 digitos');
ok(codigoTributacaoMunicipal(' 015 ').codigo === '015', 'com espaco');
ok(codigoTributacaoMunicipal('').codigo === '' && codigoTributacaoMunicipal(null).codigo === '', 'vazio e permitido');
ok(/3 dígitos/.test(codigoTributacaoMunicipal('14.01').erro), 'item da LC 116 no lugar: erro explicando');
ok(codigoTributacaoMunicipal('1401').erro && codigoTributacaoMunicipal('1').erro, '4 digitos e 1 digito: erro');

console.log('--- Inscricao Municipal ---');
ok(inscricaoMunicipal('12345').im === '12345', 'curta passa como esta');
ok(inscricaoMunicipal('123.456.789/0001-1').im === '12345678900011', 'longa com pontuacao: so os digitos');
ok(inscricaoMunicipal('1234567890123456').erro, '16 digitos: erro');
ok(inscricaoMunicipal('').erro, 'vazia: erro');

console.log('--- Descricao (ate 2000) ---');
ok(descricaoServico('Troca de oleo') === 'Troca de oleo', 'curta passa');
const longa = descricaoServico('x'.repeat(2500));
ok(longa.length === 2000 && longa.endsWith('...'), 'longa e cortada com reticencias');

console.log('--- Pendencias na tela de emissao ---');
const base = { cnpj: '12345678000199', im: '12345', city_ibge_code: '2907905', iss_rate: 5 };
ok(pendenciasNfse(base).length === 0, 'cadastro completo: nada pendente');
ok(pendenciasNfse({ ...base, im: '1234567890123456' }).some(p => /15 caracteres/.test(p)), 'IM longa aparece antes de emitir');
ok(pendenciasNfse({ ...base, iss_rate: 50 }).some(p => /5%/.test(p)), 'ISS de 50% (digitou errado) aparece antes de emitir');

console.log(f === 0 ? '\n✅ CAMPOS DA NFS-e OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
