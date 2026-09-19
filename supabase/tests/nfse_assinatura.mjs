import fs from 'fs';
import { gunzipSync } from 'node:zlib';
import { lerCertificado, montarIdDps, assinarDps, compactarParaEnvio, NS_NFSE }
  from '/home/user/Giropecas/api/_lib/nfse-assinatura.js';
import { SignedXml } from '/home/user/Giropecas/node_modules/xml-crypto/lib/index.js';
import { DOMParser } from '/home/user/Giropecas/node_modules/@xmldom/xmldom/lib/index.js';

let f=0; const ok=(c,m)=>{ if(!c){f++;console.log('FAIL:',m)} else console.log('ok:',m) };

console.log('--- 1. Ler o certificado .pfx ---');
const pfx = fs.readFileSync('cert/teste.pfx');
const cert = lerCertificado(pfx, 'senha123');
ok(cert.privateKeyPem.includes('PRIVATE KEY'),'extraiu a chave privada');
ok(cert.certificateBase64.length > 500,'extraiu o certificado em base64');
ok(!cert.expirado,'detecta que o certificado esta valido');
ok(/OFICINA TESTE/.test(cert.titular),'le o titular: '+cert.titular.slice(0,40));
try { lerCertificado(pfx,'senha-errada'); ok(false,'senha errada deveria falhar'); }
catch(e){ ok(/senha/i.test(e.message),'senha errada da mensagem clara'); }

console.log('--- 2. Id da DPS (45 caracteres) ---');
const id = montarIdDps({codigoMunicipio:'2907707',cnpjCpf:'12.345.678/0001-99',serie:1,numero:1});
ok(id.length===45,`Id tem 45 caracteres (deu ${id.length})`);
ok(id.startsWith('DPS2907707'),'comeca com DPS + municipio');
ok(id[10]==='2','tipo de inscricao 2 = CNPJ (E0004 se inverter)');
console.log('   Id:', id);
const idCpf = montarIdDps({codigoMunicipio:'2907707',cnpjCpf:'52998224725',serie:1,numero:1});
ok(idCpf[10]==='1','tipo de inscricao 1 = CPF');
try { montarIdDps({codigoMunicipio:'123',cnpjCpf:'12345678000199',serie:1,numero:1}); ok(false,'municipio invalido deveria falhar'); }
catch { ok(true,'municipio invalido e recusado'); }

console.log('--- 3. Assinar a DPS ---');
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="${NS_NFSE}" versao="1.00"><infDPS Id="${id}"><tpAmb>2</tpAmb><dhEmi>2026-09-19T10:00:00-03:00</dhEmi><verAplic>GiroPecas1.0</verAplic><serie>00001</serie><nDPS>1</nDPS><dCompet>2026-09-19</dCompet><tpEmit>1</tpEmit><cLocEmi>2907707</cLocEmi><prest><CNPJ>12345678000199</CNPJ></prest><serv><cServ><cTribNac>140101</cTribNac><xDescServ>Troca de oleo</xDescServ></cServ></serv><valores><vServPrest><vServ>150.00</vServ></vServPrest></valores></infDPS></DPS>`;
const assinado = assinarDps(xml, cert, id);
ok(assinado.includes('<Signature') || assinado.includes(':Signature'),'gerou o bloco Signature');
ok(assinado.includes('X509Certificate'),'incluiu o certificado');
ok(assinado.includes(`URI="#${id}"`),'Reference aponta para o Id do infDPS');

console.log('--- 4. VERIFICACAO INDEPENDENTE (o que o governo faz) ---');
const doc = new DOMParser().parseFromString(assinado,'text/xml');
const sigNode = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#','Signature')[0];
ok(!!sigNode,'Signature localizada no documento');
const v = new SignedXml({ publicCert: `-----BEGIN CERTIFICATE-----\n${cert.certificateBase64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----` });
v.loadSignature(sigNode);
const valida = v.checkSignature(assinado);
ok(valida, 'ASSINATURA CONFERE'+(valida?'':' — erros: '+JSON.stringify(v.validationErrors)));

console.log('--- 5. A armadilha do E0714: namespace herdado ---');
// O digest precisa ter sido calculado sobre o infDPS COM o xmlns herdado.
const ref = assinado.match(/<(?:\w+:)?DigestValue>([^<]+)</)?.[1];
ok(!!ref && ref.length>20,'DigestValue presente');
// Adulterar o conteudo tem que invalidar
const adulterado = assinado.replace('<xDescServ>Troca de oleo</xDescServ>','<xDescServ>Troca de oleo ADULTERADO</xDescServ>');
const v2 = new SignedXml({ publicCert: `-----BEGIN CERTIFICATE-----\n${cert.certificateBase64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----` });
v2.loadSignature(new DOMParser().parseFromString(adulterado,'text/xml').getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#','Signature')[0]);
ok(v2.checkSignature(adulterado)===false,'conteudo adulterado invalida a assinatura');

console.log('--- 6. GZip + Base64 para envio ---');
const b64 = compactarParaEnvio(assinado);
ok(b64.length>0 && !/\s/.test(b64),'gerou base64 sem espacos');
const voltou = gunzipSync(Buffer.from(b64,'base64')).toString('utf8');
ok(voltou===assinado,'descompacta identico (round-trip)');
console.log(`   XML ${assinado.length} chars -> base64 ${b64.length} chars`);

console.log(f===0?'\n✅ PIPELINE DE ASSINATURA VALIDADO':`\n❌ ${f} falha(s)`);
process.exit(f?1:0);
