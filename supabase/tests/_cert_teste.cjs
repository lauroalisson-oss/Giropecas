// Certificado A1 de teste, gerado na hora.
//
// As suítes de NFS-e precisam de um .pfx real para exercitar a leitura da
// chave privada e a assinatura XMLDSig. Gerar aqui em vez de versionar o
// arquivo tem duas vantagens: nenhuma chave privada entra no repositório, e
// o teste roda em qualquer máquina sem preparo manual.
//
// Este certificado é autoassinado — serve para o nosso teste de assinatura,
// NÃO para emitir nota. A emissão de verdade exige um A1 da ICP-Brasil.

const fs = require('fs');
const path = require('path');
const os = require('os');
const forge = require('node-forge');

const SENHA = 'senha123';
const TITULAR = 'OFICINA TESTE LTDA:12345678000199';

function gerar() {
  const chaves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = chaves.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);

  const nome = [
    { name: 'commonName', value: TITULAR },
    { name: 'countryName', value: 'BR' },
    { name: 'organizationName', value: 'ICP-Brasil (TESTE)' },
  ];
  cert.setSubject(nome);
  cert.setIssuer(nome);
  cert.sign(chaves.privateKey, forge.md.sha256.create());

  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], SENHA, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

// Guarda em disco para não pagar a geração da chave RSA a cada suíte.
function garantir() {
  const arquivo = path.join(os.tmpdir(), 'giropecas-cert-teste.pfx');
  if (!fs.existsSync(arquivo)) fs.writeFileSync(arquivo, gerar());
  return { pfx: fs.readFileSync(arquivo), senha: SENHA, arquivo };
}

module.exports = { garantir, gerar, SENHA, TITULAR };
