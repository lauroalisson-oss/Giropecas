// O XML que vai ao Sefin, validado contra os XSD OFICIAIS da NFS-e
// Nacional (cópia em _xsd/).
//
// Os outros testes de NFS-e conferem o XML campo a campo, contra o que se
// sabia do leiaute — e o que se sabia estava desatualizado: o Id do pedido
// de cancelamento tinha 62 caracteres e levava <nPedRegEvento>, que saíram
// do leiaute. Todo cancelamento seria recusado. Só apareceu validando
// contra o schema de verdade, que é o que o Sefin faz antes de tudo.
//
// O validador é o libxml2 (o mesmo do xmllint) compilado para WebAssembly:
// roda igual no Linux do CI e no Windows, sem instalar nada no sistema.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { validateXML } from 'xmllint-wasm';
import { montarDps } from '../../api/_lib/nfse-dps.js';
import { montarCancelamento } from '../../shared/nfse-evento.js';

const _req = createRequire(import.meta.url);
const { lerCertificado, assinarDps, assinarEvento } = _req('../../desktop/nfse/assinatura.js');
const { garantir } = _req('./_cert_teste.cjs');

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const XSD = new URL('./_xsd/', import.meta.url);
const ler = (nome) => readFileSync(new URL(nome, XSD), 'utf8').replace(/^﻿/, '');
const DEPENDENCIAS = ['tiposComplexos_v1.00.xsd', 'tiposEventos_v1.00.xsd', 'tiposSimples_v1.00.xsd', 'xmldsig-core-schema.xsd']
  .map(fileName => ({ fileName, contents: ler(fileName) }));

async function valida(xml, principal) {
  const r = await validateXML({
    xml: [{ fileName: 'documento.xml', contents: xml }],
    schema: [{ fileName: principal, contents: ler(principal) }],
    preload: DEPENDENCIAS,
  });
  return { valido: r.valid, erros: r.errors.map(e => e.message.replace(/^.*?Schemas validity error : /, '')) };
}
async function confere(xml, principal, oque) {
  const r = await valida(xml, principal);
  ok(r.valido, `${oque}${r.valido ? '' : ' — ' + r.erros.join(' | ')}`);
}

const empresa = {
  cnpj: '12.345.678/0001-99', im: '12345', city_ibge_code: '2907905', state: 'BA',
  tax_regime: 'simples_nacional', iss_rate: 5,
};
const oleo = { service_code_lc116: '14.01', iss_rate: 5 };
const servicos = [{ description: 'Troca de óleo & filtro <motor>', hours: 1, total_price: 150, servico: oleo }];
const cliente = {
  name: 'João da Silva', tax_id: '529.982.247-25', phone: '(75) 99999-0000', email: 'joao@exemplo.com',
  zip_code: '48450-000', address: 'Rua Principal', address_number: '10', neighborhood: 'Centro',
  city_ibge_code: '2907905', address_complement: 'casa 2',
};

console.log('--- DPS ---');
const DPS = 'DPS_v1.00.xsd';
await confere(montarDps({ empresa, servicos, numero: 1 }).xml, DPS, 'sem cliente (consumidor)');
await confere(montarDps({ empresa, cliente, servicos, numero: 2 }).xml, DPS, 'cliente com CPF e endereço completo');
await confere(montarDps({ empresa, cliente: { ...cliente, zip_code: '' }, servicos, numero: 3 }).xml, DPS,
  'cliente com endereço incompleto (vai sem <end>)');
await confere(montarDps({
  empresa: { ...empresa, tax_regime: 'lucro_presumido' },
  cliente: { ...cliente, tax_id: '11.222.333/0001-81', address_complement: '' },
  servicos: [{ ...servicos[0], servico: { ...oleo, iss_retido: true, municipal_service_code: '001' } }],
  numero: 4, producao: true,
}).xml, DPS, 'Lucro Presumido, tomador CNPJ, ISS retido, código municipal, produção');
await confere(montarDps({
  empresa, servicos: [servicos[0], { description: 'Alinhamento', total_price: 80.5, servico: oleo }],
  numero: 999999999999999, serie: '49999',
}).xml, DPS, 'vários serviços, número e série no máximo');

// O código municipal é digitado pelo lojista e o schema só aceita 3
// dígitos. Errado, o Sefin devolveria erro de schema sem dizer o campo;
// agora a montagem para antes, dizendo o que corrigir.
let erroCodigo = null;
try {
  montarDps({ empresa, servicos: [{ ...servicos[0], servico: { ...oleo, municipal_service_code: '14.01' } }], numero: 5 });
} catch (e) { erroCodigo = e.message; }
ok(/3 dígitos/.test(erroCodigo || ''), 'código municipal "14.01" é barrado antes do Sefin, com o motivo');

console.log('--- Cadastro "sujo" sai dentro do schema ---');
// O que o lojista digita no celular: travessão e aspas curvas, emoji,
// espaço sobrando, telefone sem DDD, e-mail errado, texto longo demais.
const sujo = {
  ...cliente,
  name: '  Maria “Mecânica” 🚗  ',
  address: 'Rua São José – trecho 2  ', address_number: ' 10 ', neighborhood: 'Centro\tHistórico',
  address_complement: '😀', phone: '9999', email: 'maria@',
};
const dpsSuja = montarDps({
  empresa: { ...empresa, im: '123.456.789/0001-1' },
  cliente: sujo,
  servicos: [{ description: 'Revisão – completa “premium” '.repeat(80), total_price: 300, servico: oleo }],
  numero: 7,
}).xml;
await confere(dpsSuja, DPS, 'nomes com aspas curvas, travessão, emoji, IM com pontuação, descrição de 2.400 caracteres');
ok(!dpsSuja.includes('<fone>') && !dpsSuja.includes('<email>'), 'telefone curto e e-mail inválido ficam de fora (são opcionais)');
ok(!dpsSuja.includes('<xCpl>'), 'complemento que era só emoji fica de fora');
ok(dpsSuja.includes('<xLgr>Rua São José - trecho 2</xLgr>'), 'travessão vira hífen, acento fica');

console.log('--- DPS assinada (como sai do aplicativo) ---');
const cert = lerCertificado(garantir().pfx, 'senha123');
const dps = montarDps({ empresa, cliente, servicos, numero: 6 });
await confere(assinarDps(dps.xml, cert, dps.id), DPS, 'DPS assinada');

console.log('--- Pedido de cancelamento ---');
const EVENTO = 'pedRegEvento_v1.00.xsd';
const CHAVE = '29079052212345678000199000000000000126100000000001';
const base = { chaveAcesso: CHAVE, cnpjAutor: '12.345.678/0001-99', justificativa: 'Valor do serviço digitado errado', uf: 'BA' };
const pedido = montarCancelamento({ ...base, motivo: 1 });
await confere(pedido.xml, EVENTO, 'cancelamento (motivo 1)');
await confere(montarCancelamento({ ...base, motivo: 9, producao: true }).xml, EVENTO, 'motivo 9, produção');
await confere(montarCancelamento({ ...base, cnpjAutor: '529.982.247-25', motivo: 2 }).xml, EVENTO, 'autor com CPF, motivo 2');
await confere(assinarEvento(pedido.xml, cert, pedido.id), EVENTO, 'cancelamento assinado');

// O formato antigo, para registrar o que se corrigiu: Id de 62 e
// <nPedRegEvento>. O schema recusa os dois.
const antigo = pedido.xml
  .replace(`Id="${pedido.id}"`, `Id="${pedido.id}001"`)
  .replace('<e101101>', '<nPedRegEvento>1</nPedRegEvento><e101101>');
const recusaAntigo = await valida(antigo, EVENTO);
ok(!recusaAntigo.valido, 'o formato antigo (Id 62 + nPedRegEvento) é recusado');
ok(recusaAntigo.erros.some(e => /maxLength|pattern/.test(e)) && recusaAntigo.erros.some(e => /nPedRegEvento/.test(e)),
  'pelos dois motivos');

console.log(f === 0 ? '\n✅ XML DENTRO DO SCHEMA OFICIAL' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
