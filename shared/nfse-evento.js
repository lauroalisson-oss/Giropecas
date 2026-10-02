// Evento de cancelamento de NFS-e (e101101), layout do Sistema Nacional.
//
// Cancelar não apaga a nota: registra um EVENTO ligado a ela. A nota
// continua existindo, agora com a marca de cancelada — é assim que o
// fisco enxerga, e é assim que o contador precisa ver.
//
// Conferido contra os XSD oficiais (pedRegEvento_v1.00.xsd e
// tiposEventos_v1.00.xsd, cópia em supabase/tests/_xsd/) — e o teste
// nfse_xsd.mjs valida o XML montado aqui contra eles:
//   - endpoint POST /nfse/{chaveAcesso}/eventos (manual da API v1.2)
//   - infPedReg: tpAmb, verAplic, dhEvento, CNPJAutor|CPFAutor, chNFSe, e101101
//   - Id = "PRE" + chave de acesso (50) + tipo do evento (6) = 59
//   - cMotivo: 1 = erro na emissão | 2 = serviço não prestado | 9 = outros
//   - xMotivo: de 15 a 255 caracteres
//
// Na versão anterior do leiaute o Id levava também uma sequência de 3 dígitos (62) e o XML
// um <nPedRegEvento>. O Sefin tirou os dois do leiaute; com eles, todo
// pedido de cancelamento seria recusado na validação do schema.
//
// Ainda sem conferência oficial: o nome do campo JSON do corpo
// (pedidoRegistroEventoXmlGZipB64). Se o Sefin recusar, o erro dirá.

import { dataHoraDaOficina } from './relogio-fiscal.js';

export const TIPO_EVENTO_CANCELAMENTO = '101101';

export const MOTIVOS_CANCELAMENTO = {
  1: 'Erro na emissão',
  2: 'Serviço não prestado',
  9: 'Outros',
};

const dig = (v) => String(v ?? '').replace(/\D/g, '');

function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Id do pedido de registro de evento: 59 caracteres.
 * "PRE" + chave de acesso (50) + tipo do evento (6). Padrão do XSD:
 * PRE[0-9]{56}.
 */
export function montarIdEvento({ chaveAcesso, tipoEvento = TIPO_EVENTO_CANCELAMENTO }) {
  const chave = dig(chaveAcesso);
  if (chave.length !== 50) {
    throw new Error(`Chave de acesso da NFS-e inválida: esperado 50 dígitos, veio ${chave.length}.`);
  }
  const id = 'PRE' + chave + dig(tipoEvento).padStart(6, '0');
  if (!/^PRE[0-9]{56}$/.test(id)) throw new Error(`Id do evento ficou fora do padrão (${id.length} caracteres, esperado 59).`);
  return id;
}

/**
 * Monta o XML do pedido de cancelamento (ainda sem assinatura).
 *
 * @param {object} p
 * @param {string} p.chaveAcesso  chave da NFS-e a cancelar (50 dígitos)
 * @param {string} p.cnpjAutor    CNPJ (ou CPF) de quem pede — a própria oficina
 * @param {number} p.motivo       1 | 2 | 9
 * @param {string} p.justificativa texto livre do lojista
 * @param {boolean} p.producao
 * @param {string} p.uf           estado da oficina (define o fuso de dhEvento)
 */
export function montarCancelamento({
  chaveAcesso, cnpjAutor, motivo = 1, justificativa = '',
  producao = false, agora = new Date(), uf,
}) {
  const doc = dig(cnpjAutor);
  if (doc.length !== 11 && doc.length !== 14) {
    throw new Error('CNPJ/CPF da oficina inválido para pedir o cancelamento.');
  }

  const cod = Number(motivo);
  if (!MOTIVOS_CANCELAMENTO[cod]) {
    throw new Error('Motivo do cancelamento inválido. Use 1 (erro na emissão), 2 (serviço não prestado) ou 9 (outros).');
  }

  // O Sefin não aceita justificativa vazia, e "Outros" sem explicação não
  // diz nada a quem for auditar depois.
  const texto = String(justificativa || '').trim();
  if (texto.length < 15) {
    throw new Error('Escreva a justificativa do cancelamento com pelo menos 15 caracteres.');
  }
  if (texto.length > 255) {
    throw new Error('A justificativa do cancelamento passa de 255 caracteres.');
  }

  const id = montarIdEvento({ chaveAcesso });

  // A ordem dos elementos é definida pelo XSD e NÃO pode mudar.
  const partes = [];
  partes.push('<?xml version="1.0" encoding="UTF-8"?>');
  partes.push('<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">');
  partes.push(`<infPedReg Id="${id}">`);
  partes.push(`<tpAmb>${producao ? '1' : '2'}</tpAmb>`);
  partes.push('<verAplic>GiroPecas-1.0</verAplic>');
  // Hora da oficina, não a do servidor (UTC). Ver relogio-fiscal.js.
  partes.push(`<dhEvento>${dataHoraDaOficina(agora, uf)}</dhEvento>`);
  partes.push(doc.length === 14 ? `<CNPJAutor>${doc}</CNPJAutor>` : `<CPFAutor>${doc}</CPFAutor>`);
  partes.push(`<chNFSe>${dig(chaveAcesso)}</chNFSe>`);
  partes.push('<e101101>');
  partes.push('<xDesc>Cancelamento de NFS-e</xDesc>');
  partes.push(`<cMotivo>${cod}</cMotivo>`);
  partes.push(`<xMotivo>${esc(texto)}</xMotivo>`);
  partes.push('</e101101>');
  partes.push('</infPedReg>');
  partes.push('</pedRegEvento>');

  return { xml: partes.join(''), id, motivo: cod, justificativa: texto };
}
