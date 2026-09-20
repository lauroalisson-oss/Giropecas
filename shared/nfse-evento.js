// Evento de cancelamento de NFS-e (e101101), layout do Sistema Nacional.
//
// Cancelar não apaga a nota: registra um EVENTO ligado a ela. A nota
// continua existindo, agora com a marca de cancelada — é assim que o
// fisco enxerga, e é assim que o contador precisa ver.
//
// O que está CONFIRMADO no manual oficial do Sefin Nacional
// (manual-contribuintes-emissor-publico-api v1.2, out/2025):
//   - endpoint POST /nfse/{chaveAcesso}/eventos
//   - o evento de cancelamento é o e101101
//   - a ordem dos elementos de infPedReg (abaixo)
//   - cMotivo: 1 = erro na emissão | 2 = serviço não prestado | 9 = outros
//
// O que foi montado a partir de exemplos publicados, e por isso precisa
// passar por HOMOLOGAÇÃO antes de valer em produção:
//   - a composição exata do Id (PRE + chave + tipo + sequência = 62)
//   - o nome do campo JSON do corpo (pedidoRegistroEventoXmlGZipB64)
// Se o Sefin recusar, o código do erro dirá qual dos dois está errado —
// e o conserto é de uma linha em cada caso.

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

function dataHoraComFuso(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sinal = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    + `${sinal}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

/**
 * Id do pedido de registro de evento: 62 caracteres.
 * "PRE" + chave de acesso (50) + tipo do evento (6) + sequência (3).
 */
export function montarIdEvento({ chaveAcesso, tipoEvento = TIPO_EVENTO_CANCELAMENTO, sequencia = 1 }) {
  const chave = dig(chaveAcesso);
  if (chave.length !== 50) {
    throw new Error(`Chave de acesso da NFS-e inválida: esperado 50 dígitos, veio ${chave.length}.`);
  }
  const seq = String(Number(sequencia) || 1);
  if (seq.length > 3) throw new Error('Sequência do evento acima de 999.');

  const id = 'PRE' + chave + dig(tipoEvento).padStart(6, '0') + seq.padStart(3, '0');
  if (id.length !== 62) throw new Error(`Id do evento ficou com ${id.length} caracteres (esperado 62).`);
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
 * @param {number} p.sequencia    nº do pedido para esta nota
 */
export function montarCancelamento({
  chaveAcesso, cnpjAutor, motivo = 1, justificativa = '',
  producao = false, sequencia = 1, agora = new Date(),
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

  const id = montarIdEvento({ chaveAcesso, sequencia });

  // A ordem dos elementos é definida pelo XSD e NÃO pode mudar.
  const partes = [];
  partes.push('<?xml version="1.0" encoding="UTF-8"?>');
  partes.push('<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">');
  partes.push(`<infPedReg Id="${id}">`);
  partes.push(`<tpAmb>${producao ? '1' : '2'}</tpAmb>`);
  partes.push('<verAplic>GiroPecas-1.0</verAplic>');
  partes.push(`<dhEvento>${dataHoraComFuso(agora)}</dhEvento>`);
  partes.push(doc.length === 14 ? `<CNPJAutor>${doc}</CNPJAutor>` : `<CPFAutor>${doc}</CPFAutor>`);
  partes.push(`<chNFSe>${dig(chaveAcesso)}</chNFSe>`);
  partes.push(`<nPedRegEvento>${Number(sequencia) || 1}</nPedRegEvento>`);
  partes.push('<e101101>');
  partes.push('<xDesc>Cancelamento de NFS-e</xDesc>');
  partes.push(`<cMotivo>${cod}</cMotivo>`);
  partes.push(`<xMotivo>${esc(texto)}</xMotivo>`);
  partes.push('</e101101>');
  partes.push('</infPedReg>');
  partes.push('</pedRegEvento>');

  return { xml: partes.join(''), id, motivo: cod, justificativa: texto };
}
