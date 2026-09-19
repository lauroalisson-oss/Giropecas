import fs from 'fs';
import { gunzipSync } from 'node:zlib';
import { montarDps } from '/home/user/Giropecas/api/_lib/nfse-dps.js';
import { lerCertificado, assinarDps, compactarParaEnvio } from '/home/user/Giropecas/api/_lib/nfse-assinatura.js';
import { SignedXml } from '/home/user/Giropecas/node_modules/xml-crypto/lib/index.js';
import { DOMParser } from '/home/user/Giropecas/node_modules/@xmldom/xmldom/lib/index.js';

let f=0; const ok=(c,m)=>{ if(!c){f++;console.log('FAIL:',m)} else console.log('ok:',m) };

// Cenario real: oficina de Cipo-BA, troca de oleo de R$150 na moto do cliente
const empresa={ cnpj:'12345678000199', im:'12345', city_ibge_code:'2907905',
  tax_regime:'simples_nacional', iss_rate:5, nfse_series:'1' };
const cliente={ tax_id:'529.982.247-25', name:'Joao da Silva', phone:'7598887777',
  address:'Rua das Flores, 100', city:'Cipo', zip_code:'48440-000' };
const servicos=[{ description:'Troca de oleo', hours:1, total_price:150,
  servico:{ id:'s1', name:'Troca de oleo', service_code_lc116:'14.01', iss_rate:5 } }];

console.log('1) Montar a DPS a partir da OS');
const dps=montarDps({empresa,cliente,servicos,numero:1,serie:'1',producao:false});
ok(dps.xml.length>400,`XML gerado (${dps.xml.length} chars)`);
console.log(`   ISS: R$ ${dps.iss.toFixed(2)} sobre R$ ${dps.total.toFixed(2)}`);

console.log('2) Assinar com o certificado local');
const cert=lerCertificado(fs.readFileSync('cert/teste.pfx'),'senha123');
const assinado=assinarDps(dps.xml,cert,dps.id);
ok(assinado.includes('Signature'),'assinado');

console.log('3) VERIFICAR como o governo verifica');
const pem=`-----BEGIN CERTIFICATE-----\n${cert.certificateBase64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
const doc=new DOMParser().parseFromString(assinado,'text/xml');
const sig=doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#','Signature')[0];
const v=new SignedXml({publicCert:pem}); v.loadSignature(sig);
const valida=v.checkSignature(assinado);
ok(valida,'ASSINATURA CONFERE'+(valida?'':' -> '+JSON.stringify(v.validationErrors)));

console.log('4) Compactar para envio');
const b64=compactarParaEnvio(assinado);
const corpo={ dpsXmlGZipB64: b64 };
ok(typeof corpo.dpsXmlGZipB64==='string','corpo no formato do Sefin');
ok(gunzipSync(Buffer.from(b64,'base64')).toString('utf8')===assinado,'round-trip integro');
console.log(`   ${assinado.length} chars -> ${b64.length} base64 (${Math.round(100-b64.length/assinado.length*100)}% menor)`);

console.log('5) Adulteracao no caminho e detectada');
const mal=assinado.replace('<vServ>150.00</vServ>','<vServ>1.00</vServ>');
const v2=new SignedXml({publicCert:pem});
v2.loadSignature(new DOMParser().parseFromString(mal,'text/xml').getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#','Signature')[0]);
ok(v2.checkSignature(mal)===false,'valor alterado invalida a assinatura');

console.log(f===0?'\n✅ FLUXO COMPLETO: OS -> DPS -> ASSINADA -> PRONTA PARA O SEFIN':`\n❌ ${f} falha(s)`);
process.exit(f?1:0);
