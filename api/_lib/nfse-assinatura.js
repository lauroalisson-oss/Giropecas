// Assinatura da DPS no padrão do Sistema Nacional NFS-e.
//
// É a parte que mais derruba integração. O erro E0714 ("arquivo enviado com
// erro na assinatura") quase sempre vem de UM detalhe: ao canonicalizar o
// elemento <infDPS>, ele perde o xmlns que herdava do <DPS> pai. Assina-se
// `<infDPS Id="...">` enquanto o governo calcula o digest sobre
// `<infDPS xmlns="http://www.sped.fazenda.gov.br/nfse" Id="...">` — e os
// digests não batem.
//
// Por isso NÃO escrevemos canonicalização à mão: usamos xml-crypto, que
// materializa os namespaces herdados corretamente.

import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';
import { gzipSync } from 'node:zlib';

export const NS_NFSE = 'http://www.sped.fazenda.gov.br/nfse';

// Extrai chave privada e certificado de um .pfx (PKCS#12).
// O Web Crypto não abre .pfx; por isso node-forge.
export function lerCertificado(pfxBuffer, senha) {
  const p12Der = forge.util.createBuffer(
    Buffer.isBuffer(pfxBuffer) ? pfxBuffer.toString('binary') : pfxBuffer,
  );
  const p12Asn1 = forge.asn1.fromDer(p12Der);

  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);
  } catch {
    // Mensagem própria: a do forge não diz que o problema é a senha.
    throw new Error('Não foi possível abrir o certificado. Verifique a senha.');
  }

  // Chave privada
  const bagsChave = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]
    || p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];
  const bagChave = (bagsChave || [])[0];
  if (!bagChave?.key) throw new Error('Certificado sem chave privada utilizável.');

  // Certificado do titular: o que tem a chave correspondente.
  const bagsCert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  if (!bagsCert.length) throw new Error('Certificado não encontrado no arquivo.');

  const publicoDaChave = forge.pki.setRsaPublicKey(bagChave.key.n, bagChave.key.e);
  const pemPublicoDaChave = forge.pki.publicKeyToPem(publicoDaChave);
  const bagCert = bagsCert.find(
    b => forge.pki.publicKeyToPem(b.cert.publicKey) === pemPublicoDaChave,
  ) || bagsCert[0];

  const cert = bagCert.cert;
  const agora = new Date();

  return {
    privateKeyPem: forge.pki.privateKeyToPem(bagChave.key),
    certificatePem: forge.pki.certificateToPem(cert),
    // Sem cabeçalho/rodapé e sem quebras — é assim que vai no X509Certificate.
    certificateBase64: forge.util.encode64(
      forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),
    ),
    validoDe: cert.validity.notBefore,
    validoAte: cert.validity.notAfter,
    expirado: cert.validity.notAfter < agora,
    titular: cert.subject.attributes.map(a => `${a.shortName}=${a.value}`).join(', '),
  };
}

// Monta o Id da DPS: 45 caracteres.
// "DPS" + município (7) + tipo de inscrição (1) + CNPJ/CPF (14, com zeros à
// esquerda) + série (5) + número (15).
//
// ATENÇÃO: aqui 2 = CNPJ e 1 = CPF. Trocar isso gera o erro E0004, e a
// documentação de terceiros diverge nesse ponto — confira contra o XSD
// oficial antes de mudar.
export function montarIdDps({ codigoMunicipio, cnpjCpf, serie, numero }) {
  const doc = String(cnpjCpf || '').replace(/\D/g, '');
  if (doc.length !== 11 && doc.length !== 14) {
    throw new Error('CNPJ/CPF do emitente inválido para montar o Id da DPS.');
  }
  const tipoInscricao = doc.length === 14 ? '2' : '1';
  // Código IBGE tem exatamente 7 dígitos. NÃO completar com zeros: '123'
  // viraria '0000123', que é outro município — a nota sairia atribuída à
  // cidade errada em vez de falhar.
  const mun = String(codigoMunicipio || '').replace(/\D/g, '');
  if (mun.length !== 7) {
    throw new Error(`Código IBGE do município inválido: "${codigoMunicipio}" (precisa ter exatamente 7 dígitos).`);
  }

  const id = 'DPS'
    + mun
    + tipoInscricao
    + doc.padStart(14, '0')
    + String(serie || '1').replace(/\D/g, '').padStart(5, '0')
    + String(numero || '1').replace(/\D/g, '').padStart(15, '0');

  if (id.length !== 45) throw new Error(`Id da DPS ficou com ${id.length} caracteres (esperado 45).`);
  return id;
}

// Assina o <infDPS> e insere a <Signature> como último filho do <DPS>.
export function assinarDps(xmlDps, { privateKeyPem, certificateBase64 }, idInfDps) {
  const doc = new DOMParser().parseFromString(xmlDps, 'text/xml');
  const infDps = doc.getElementsByTagName('infDPS')[0];
  if (!infDps) throw new Error('XML da DPS sem elemento infDPS.');

  const id = idInfDps || infDps.getAttribute('Id');
  if (!id) throw new Error('infDPS sem atributo Id — a assinatura precisa referenciá-lo.');

  const sig = new SignedXml({
    privateKey: privateKeyPem,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certificateBase64}</X509Certificate></X509Data>`,
  });

  sig.addReference({
    xpath: `//*[local-name(.)='infDPS']`,
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    uri: `#${id}`,
  });

  // A Signature entra dentro de <DPS>, depois de <infDPS> — enveloped.
  sig.computeSignature(xmlDps, {
    location: { reference: `//*[local-name(.)='infDPS']`, action: 'after' },
  });

  return sig.getSignedXml();
}

// O Sefin recebe o XML assinado compactado em GZip e codificado em Base64.
export function compactarParaEnvio(xmlAssinado) {
  return gzipSync(Buffer.from(xmlAssinado, 'utf8')).toString('base64');
}
