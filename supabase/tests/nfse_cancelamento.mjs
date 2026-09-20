// Pedido de cancelamento de NFS-e (evento e101101).
//
// Cancelar não apaga a nota: registra um evento ligado a ela. Se o XML
// sair errado, o Sefin recusa — o que é uma falha segura (nenhum
// documento ruim é criado), mas deixa a oficina com uma nota errada no
// ar e o cliente sem resposta.

import { createRequire } from 'module';
import {
  montarCancelamento, montarIdEvento, MOTIVOS_CANCELAMENTO, TIPO_EVENTO_CANCELAMENTO,
} from '/home/user/Giropecas/shared/nfse-evento.js';
import { DOMParser } from '/home/user/Giropecas/node_modules/@xmldom/xmldom/lib/index.js';
import { SignedXml } from '/home/user/Giropecas/node_modules/xml-crypto/lib/index.js';

const _req = createRequire(import.meta.url);
const { lerCertificado, assinarEvento, compactarParaEnvio } = _req('/home/user/Giropecas/desktop/nfse/assinatura.js');
const { garantir } = _req('/home/user/Giropecas/supabase/tests/_cert_teste.cjs');

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };
const recusa = (fn, oque) => { try { fn(); ok(false, oque + ' deveria falhar'); } catch { ok(true, oque + ' e recusado'); } };
const tag = (xml, n) => { const m = xml.match(new RegExp(`<${n}>([^<]*)</${n}>`)); return m ? m[1] : null; };

// Chave de acesso de NFS-e tem 50 digitos.
const CHAVE = '52119091212053489000149000000000002725115338';
const CHAVE50 = CHAVE.padEnd(50, '7').slice(0, 50);
const base = {
  chaveAcesso: CHAVE50,
  cnpjAutor: '12.345.678/0001-99',
  motivo: 1,
  justificativa: 'Valor do servico lancado errado na ordem',
};

console.log('--- Id do evento (62 caracteres) ---');
const id = montarIdEvento({ chaveAcesso: CHAVE50 });
ok(id.length === 62, `Id com 62 caracteres (deu ${id.length})`);
ok(id.startsWith('PRE'), 'comeca com PRE');
ok(id.slice(3, 53) === CHAVE50, 'carrega a chave de acesso inteira');
ok(id.slice(53, 59) === TIPO_EVENTO_CANCELAMENTO, 'tipo do evento 101101');
ok(id.slice(59) === '001', 'sequencia com 3 digitos');
ok(montarIdEvento({ chaveAcesso: CHAVE50, sequencia: 12 }).slice(59) === '012', 'sequencia 12 vira 012');
recusa(() => montarIdEvento({ chaveAcesso: '123' }), 'chave curta');
recusa(() => montarIdEvento({ chaveAcesso: CHAVE50 + '9' }), 'chave longa');
recusa(() => montarIdEvento({ chaveAcesso: CHAVE50, sequencia: 1000 }), 'sequencia acima de 999');
// A chave e longa; o lojista pode cola-la com espacos ou pontos.
const comEspacos = CHAVE50.replace(/(.{4})/g, '$1 ').trim();
ok(montarIdEvento({ chaveAcesso: comEspacos }) === id, 'chave colada com espacos da o mesmo Id');

console.log('--- Estrutura do pedido ---');
const p = montarCancelamento(base);
ok(p.xml.startsWith('<?xml'), 'declaracao XML');
ok(p.xml.includes('<pedRegEvento'), 'elemento pedRegEvento');
ok(p.xml.includes('xmlns="http://www.sped.fazenda.gov.br/nfse"'), 'namespace do Sistema Nacional');
ok(p.xml.includes(`<infPedReg Id="${p.id}">`), 'infPedReg com o Id');
ok(tag(p.xml, 'tpAmb') === '2', 'homologacao = tpAmb 2');
ok(montarCancelamento({ ...base, producao: true }).xml.includes('<tpAmb>1</tpAmb>'), 'producao = tpAmb 1');
ok(tag(p.xml, 'chNFSe') === CHAVE50, 'chave da nota que sera cancelada');
ok(tag(p.xml, 'CNPJAutor') === '12345678000199', 'CNPJ do autor sem pontuacao');
ok(tag(p.xml, 'nPedRegEvento') === '1', 'numero do pedido');
ok(tag(p.xml, 'cMotivo') === '1', 'codigo do motivo');
ok(tag(p.xml, 'xDesc') === 'Cancelamento de NFS-e', 'descricao do evento');
ok(p.xml.includes('<e101101>'), 'bloco do evento e101101');
ok(/[+-]\d{2}:\d{2}</.test(p.xml), 'dhEvento leva o fuso');

console.log('--- XML bem formado ---');
let erro = null;
new DOMParser({ onError: (l, m) => { if (l !== 'warning') erro = m; } }).parseFromString(p.xml, 'text/xml');
ok(!erro, 'XML valido' + (erro ? ': ' + erro : ''));

console.log('--- Ordem dos elementos (o XSD valida sequencia) ---');
const ordem = ['tpAmb', 'verAplic', 'dhEvento', 'CNPJAutor', 'chNFSe', 'nPedRegEvento', 'e101101'];
let pos = -1, ordemOk = true;
for (const t of ordem) { const i = p.xml.indexOf(`<${t}>`); if (i < pos) ordemOk = false; pos = i; }
ok(ordemOk, 'elementos de infPedReg na ordem do layout');
ok(p.xml.indexOf('<xDesc>') < p.xml.indexOf('<cMotivo>'), 'xDesc antes de cMotivo');
ok(p.xml.indexOf('<cMotivo>') < p.xml.indexOf('<xMotivo>'), 'cMotivo antes de xMotivo');

console.log('--- Autor pessoa fisica ---');
const cpf = montarCancelamento({ ...base, cnpjAutor: '529.982.247-25' });
ok(cpf.xml.includes('<CPFAutor>52998224725</CPFAutor>'), 'CPF usa CPFAutor');
ok(!cpf.xml.includes('CNPJAutor'), 'nao manda os dois');

console.log('--- Motivos ---');
ok(Object.keys(MOTIVOS_CANCELAMENTO).join(',') === '1,2,9', 'tres motivos: 1, 2 e 9');
for (const m of [1, 2, 9]) {
  ok(montarCancelamento({ ...base, motivo: m }).motivo === m, `motivo ${m} (${MOTIVOS_CANCELAMENTO[m]}) e aceito`);
}
ok(montarCancelamento({ ...base, motivo: '2' }).motivo === 2, 'motivo como texto e convertido');
recusa(() => montarCancelamento({ ...base, motivo: 3 }), 'motivo 3 (nao existe)');
recusa(() => montarCancelamento({ ...base, motivo: 0 }), 'motivo 0');
recusa(() => montarCancelamento({ ...base, motivo: null }), 'motivo nulo');

console.log('--- Justificativa ---');
recusa(() => montarCancelamento({ ...base, justificativa: 'errado' }), 'justificativa curta demais');
recusa(() => montarCancelamento({ ...base, justificativa: '' }), 'justificativa vazia');
recusa(() => montarCancelamento({ ...base, justificativa: '   ' }), 'justificativa so com espacos');
recusa(() => montarCancelamento({ ...base, justificativa: 'x'.repeat(256) }), 'justificativa acima de 255');
ok(montarCancelamento({ ...base, justificativa: 'x'.repeat(255) }).xml.includes('x'.repeat(255)), '255 caracteres passa');
ok(montarCancelamento({ ...base, justificativa: '  ' + base.justificativa + '  ' }).justificativa === base.justificativa,
  'apara espacos das pontas');

// Justificativa e texto livre digitado pelo lojista.
const comSimbolo = montarCancelamento({ ...base, justificativa: 'Peca & servico <errado> na "OS"' });
ok(comSimbolo.xml.includes('&amp;') && comSimbolo.xml.includes('&lt;'), 'escapa & e < da justificativa');
let e2 = null;
new DOMParser({ onError: (l, m) => { if (l !== 'warning') e2 = m; } }).parseFromString(comSimbolo.xml, 'text/xml');
ok(!e2, 'XML continua valido com simbolo na justificativa');

console.log('--- Autor invalido ---');
recusa(() => montarCancelamento({ ...base, cnpjAutor: '123' }), 'CNPJ curto');
recusa(() => montarCancelamento({ ...base, cnpjAutor: null }), 'sem CNPJ');

console.log('--- Assinatura do evento ---');
const cert = lerCertificado(garantir().pfx, 'senha123');
const assinado = assinarEvento(p.xml, cert, p.id);
ok(assinado.includes('Signature'), 'gerou o bloco Signature');
ok(assinado.includes(`URI="#${p.id}"`), 'Reference aponta para o Id do infPedReg');
ok(assinado.includes('X509Certificate'), 'incluiu o certificado');
ok(assinado.indexOf('</infPedReg>') < assinado.indexOf('<Signature'), 'Signature vem depois de infPedReg');

console.log('--- VERIFICACAO INDEPENDENTE (o que o governo faz) ---');
const pem = `-----BEGIN CERTIFICATE-----\n${cert.certificateBase64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
const doc = new DOMParser().parseFromString(assinado, 'text/xml');
const sig = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
ok(!!sig, 'Signature localizada no documento');
const v = new SignedXml({ publicCert: pem });
v.loadSignature(sig);
ok(v.checkSignature(assinado), 'ASSINATURA DO CANCELAMENTO CONFERE');

// Trocar o motivo depois de assinar tem de invalidar.
const adulterado = assinado.replace('<cMotivo>1</cMotivo>', '<cMotivo>2</cMotivo>');
const v2 = new SignedXml({ publicCert: pem });
v2.loadSignature(new DOMParser().parseFromString(adulterado, 'text/xml')
  .getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0]);
let valeu = false;
try { valeu = v2.checkSignature(adulterado); } catch { valeu = false; }
ok(!valeu, 'motivo trocado depois de assinar invalida a assinatura');

console.log('--- Compactacao para envio ---');
const corpo = compactarParaEnvio(assinado);
ok(/^[A-Za-z0-9+/]+={0,2}$/.test(corpo), 'base64 sem espacos');
ok(corpo.length < assinado.length, `compactou (${assinado.length} -> ${corpo.length})`);

console.log(f === 0 ? '\n✅ CANCELAMENTO DE NFS-e OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
