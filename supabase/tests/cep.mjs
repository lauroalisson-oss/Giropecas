// CEP → endereço e código IBGE (ViaCEP).
//
// O código IBGE é o que a NFS-e usa para dizer a cidade. Digitado à mão,
// um dígito trocado vira outra cidade sem erro nenhum aparecer. As
// respostas abaixo são as reais do ViaCEP, conferidas em 02/10/2026.

import { soDigitos, cepValido, interpretarViaCep, buscarCep, camposDoCep } from '../../src/lib/cep.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const CIPO = { cep: '48450-000', logradouro: '', complemento: '', unidade: '', bairro: '', localidade: 'Cipó', uf: 'BA', estado: 'Bahia', regiao: 'Nordeste', ibge: '2907905', gia: '', ddd: '75', siafi: '3457' };
const ANTAS = { ...CIPO, cep: '48420-000', localidade: 'Antas', ibge: '2901601', siafi: '3331' };
const RUA = { ...CIPO, cep: '40010-000', logradouro: 'Avenida da França', bairro: 'Comércio', localidade: 'Salvador', ibge: '2927408' };

console.log('--- CEP valido ---');
ok(cepValido('48450-000') === '48450000', 'com hifen');
ok(cepValido('48450000') === '48450000', 'so digitos');
ok(cepValido('4845') === null, 'curto');
ok(cepValido('') === null && cepValido(null) === null, 'vazio');
ok(soDigitos('48.450-000') === '48450000', 'tira pontuacao');

console.log('--- Resposta do ViaCEP ---');
const c = interpretarViaCep(CIPO);
ok(c.ibge === '2907905' && c.cidade === 'Cipó' && c.uf === 'BA', 'Cipó: IBGE 2907905');
ok(interpretarViaCep(ANTAS).ibge === '2901601', '48420-000 e Antas, nao Cipó — por isso o IBGE nao se digita');
ok(interpretarViaCep({ erro: 'true' }).erro === 'CEP não encontrado.', 'nao encontrado (formato atual: "true" em texto)');
ok(interpretarViaCep({ erro: true }).erro, 'nao encontrado (formato antigo: booleano)');
ok(interpretarViaCep({ ...CIPO, ibge: '' }).erro, 'sem IBGE na resposta: erro, nao municipio vazio');
ok(interpretarViaCep(null).erro && interpretarViaCep('x').erro, 'resposta invalida');

console.log('--- Busca (rede simulada) ---');
const resp = (json, status = 200) => async () => ({ ok: status === 200, status, json: async () => json });
ok((await buscarCep('48450-000', { fetchImpl: resp(CIPO) })).ibge === '2907905', 'busca e devolve o IBGE');
let url = '';
await buscarCep('48450-000', { fetchImpl: async (u) => { url = u; return { ok: true, json: async () => CIPO }; } });
ok(url === 'https://viacep.com.br/ws/48450000/json/', 'consulta o endereco certo, so com digitos');
ok((await buscarCep('123', { fetchImpl: resp(CIPO) })).erro, 'CEP curto nem consulta');
ok(/indisponível/.test((await buscarCep('48450000', { fetchImpl: resp({}, 500) })).erro), 'servico fora: erro, sem quebrar');
ok(/à mão/.test((await buscarCep('48450000', { fetchImpl: async () => { throw new Error('rede'); } })).erro),
  'sem internet: erro com instrucao, sem quebrar a tela');

console.log('--- O que preencher ---');
const r = interpretarViaCep(RUA);
const vazio = camposDoCep({}, r);
ok(vazio.city === 'Salvador' && vazio.state === 'BA' && vazio.city_ibge_code === '2927408', 'cidade, UF e IBGE sempre');
ok(vazio.address === 'Avenida da França' && vazio.neighborhood === 'Comércio', 'rua e bairro quando vazios');

// O que a pessoa ja digitou nao some.
const digitado = camposDoCep({ address: 'Rua que eu digitei', neighborhood: 'Meu bairro' }, r);
ok(!('address' in digitado) && !('neighborhood' in digitado), 'nao sobrescreve rua e bairro ja digitados');

// CEP de cidade pequena vem sem rua: so o municipio.
const pequeno = camposDoCep({}, c);
ok(!('address' in pequeno) && pequeno.city_ibge_code === '2907905', 'CEP sem rua: so o municipio');

// A empresa nao tem coluna de bairro: mandar o campo faria o banco recusar.
ok(!('neighborhood' in camposDoCep({}, r, { comBairro: false })), 'comBairro: false nao manda bairro');
ok(Object.keys(camposDoCep({}, { erro: 'x' })).length === 0, 'resultado com erro nao muda nada');

console.log(f === 0 ? '\n✅ CEP OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
