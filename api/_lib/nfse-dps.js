// Monta o XML da DPS (Declaração de Prestação de Serviços) no layout do
// Sistema Nacional NFS-e, a partir de uma ordem de serviço.
//
// A ordem dos elementos dentro de infDPS é definida pelo XSD e NÃO pode
// mudar — XML Schema valida sequência.

// O código de tributação nacional vem de shared/: é a MESMA resolução
// que o cadastro do serviço usa para avisar o lojista na hora de
// digitar. Duas implementações divergiriam, e a divergência só
// apareceria na hora de emitir a nota.
import { codigoTributacaoNacional, descricaoCTribNac } from '../../shared/ctribnac.js';
import { dataDaOficina, dataHoraDaOficina } from '../../shared/relogio-fiscal.js';
export { codigoTributacaoNacional, descricaoCTribNac };

export const NS_NFSE = 'http://www.sped.fazenda.gov.br/nfse';

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


const dig = (v) => String(v ?? '').replace(/\D/g, '');

// Escapa o que vai dentro de um elemento. Descrição de serviço vem digitada
// pelo lojista e pode conter & ou <, que quebrariam o XML.
function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Valores monetários vão com 2 casas, ponto decimal e sem separador de milhar.
const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);

// Data e hora no relógio da OFICINA (pelo estado dela), não no do
// servidor — a Vercel roda em UTC. Ver shared/relogio-fiscal.js.
export const dataHoraComFuso = (d = new Date(), uf) => dataHoraDaOficina(d, uf);
export const dataSimples = (d = new Date(), uf) => dataDaOficina(d, uf);

// Regime no Simples Nacional, conforme o cadastro da empresa.
// 1 = optante MEI | 2 = optante ME/EPP | 3 = não optante
function opSimpNac(empresa) {
  if (empresa?.tax_regime !== 'simples_nacional') return '3';
  return empresa?.mei === true ? '1' : '2';
}

// O endereço do tomador, se estiver COMPLETO para o leiaute nacional;
// senão, null — e a nota vai sem endereço, que é permitido. Nunca completa
// com dado da oficina.
export function enderecoDoTomador(cliente) {
  const c = cliente || {};
  const cMun = dig(c.city_ibge_code);
  const cep = dig(c.zip_code);
  const logradouro = String(c.address || '').trim();
  const numero = String(c.address_number || '').trim();
  const bairro = String(c.neighborhood || '').trim();
  if (cMun.length !== 7 || cep.length !== 8 || !logradouro || !numero || !bairro) return null;
  return { cMun, cep, logradouro, numero, bairro, complemento: String(c.address_complement || '').trim() };
}

/**
 * Monta a DPS de uma OS.
 *
 * @param {object} p
 * @param {object} p.empresa   prestador (company)
 * @param {object} p.cliente   tomador (customer) — opcional
 * @param {Array}  p.servicos  itens de serviço da OS, já com o cadastro junto
 * @param {number} p.numero    número sequencial da DPS
 * @param {string} p.serie     série do RPS
 * @param {boolean} p.producao ambiente (false = homologação)
 */
export function montarDps({ empresa, cliente, servicos = [], numero, serie = '1', producao = false, agora = new Date() }) {
  const cnpj = dig(empresa?.cnpj);
  if (!cnpj) throw new Error('CNPJ da oficina não configurado.');
  if (!empresa?.im) throw new Error('Inscrição Municipal não configurada (obrigatória para NFS-e).');

  const municipio = dig(empresa?.city_ibge_code);
  const id = montarIdDps({ codigoMunicipio: municipio, cnpjCpf: cnpj, serie, numero });

  const total = servicos.reduce((s, it) => s + (Number(it.total_price) || 0), 0);
  if (total <= 0) throw new Error('A OS não tem valor de serviço para emitir NFS-e.');

  // Descrição: uma linha por serviço, como o cliente vê na OS.
  const descricao = servicos
    .map(it => {
      const h = Number(it.hours) || 0;
      return h ? `${it.description} (${h}h)` : it.description;
    })
    .filter(Boolean).join(' | ') || 'Serviços prestados';

  // Códigos e alíquota: do serviço que os tiver; senão, o padrão da empresa.
  const comCodigo = servicos.find(it => it.servico?.service_code_lc116);
  const lc116 = comCodigo?.servico?.service_code_lc116 || '14.01';
  const cTribNac = codigoTributacaoNacional(lc116);
  const codMunicipal = servicos.find(it => it.servico?.municipal_service_code)?.servico?.municipal_service_code;

  const comAliquota = servicos.find(it => Number(it.servico?.iss_rate) > 0);
  const aliquota = Number(comAliquota?.servico?.iss_rate) || Number(empresa?.iss_rate) || 0;
  if (!aliquota) throw new Error('Alíquota de ISS não configurada (no serviço ou na empresa).');

  const issRetido = servicos.some(it => it.servico?.iss_retido === true);

  // Tomador é opcional na NFS-e, mas sem ele a nota sai "ao consumidor".
  const docTomador = dig(cliente?.tax_id);
  const tomadorCnpj = docTomador.length === 14;
  const temTomador = docTomador.length === 11 || tomadorCnpj;

  const partes = [];
  partes.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  partes.push(`<DPS xmlns="${NS_NFSE}" versao="1.00">`);
  partes.push(`<infDPS Id="${id}">`);
  partes.push(`<tpAmb>${producao ? '1' : '2'}</tpAmb>`);
  partes.push(`<dhEmi>${dataHoraComFuso(agora, empresa?.state)}</dhEmi>`);
  partes.push(`<verAplic>GiroPecas-1.0</verAplic>`);
  partes.push(`<serie>${dig(serie).padStart(5, '0')}</serie>`);
  partes.push(`<nDPS>${dig(numero) || '1'}</nDPS>`);
  // Competência = o dia do serviço na oficina. Com o relógio do servidor,
  // nota das 21h em diante saía no dia (e às vezes no mês) seguinte.
  partes.push(`<dCompet>${dataSimples(agora, empresa?.state)}</dCompet>`);
  partes.push(`<tpEmit>1</tpEmit>`);
  partes.push(`<cLocEmi>${municipio}</cLocEmi>`);

  // Prestador. Com tpEmit=1 o xNome NÃO entra: o governo já conhece o nome
  // pelo CNPJ, e mandá-lo gera o erro E0121.
  partes.push(`<prest>`);
  partes.push(`<CNPJ>${cnpj}</CNPJ>`);
  partes.push(`<IM>${esc(empresa.im)}</IM>`);
  partes.push(`<regTrib><opSimpNac>${opSimpNac(empresa)}</opSimpNac><regEspTrib>0</regEspTrib></regTrib>`);
  partes.push(`</prest>`);

  if (temTomador) {
    partes.push(`<toma>`);
    partes.push(tomadorCnpj ? `<CNPJ>${docTomador}</CNPJ>` : `<CPF>${docTomador}</CPF>`);
    partes.push(`<xNome>${esc(cliente.name || 'Consumidor')}</xNome>`);
    // Endereço do tomador: opcional na NFS-e, e só vai COMPLETO.
    //
    // Ia sempre que o cliente tinha endereço ou cidade, e saía errado de
    // dois jeitos. O município: o cadastro de cliente não tem código IBGE,
    // e caía no da oficina (`|| municipio`) — cliente de outra cidade saía
    // na nota como morador de Cipó. E o leiaute: dentro do endereço, número
    // e bairro são 1-1 (obrigatórios), e não eram enviados — a nota seria
    // recusada. Sem endereço, a nota vale com CPF/CNPJ e nome.
    const end = enderecoDoTomador(cliente);
    if (end) {
      partes.push(`<end><endNac>`);
      partes.push(`<cMun>${end.cMun}</cMun><CEP>${end.cep}</CEP>`);
      partes.push(`</endNac>`);
      partes.push(`<xLgr>${esc(end.logradouro)}</xLgr><nro>${esc(end.numero)}</nro>`);
      if (end.complemento) partes.push(`<xCpl>${esc(end.complemento)}</xCpl>`);
      partes.push(`<xBairro>${esc(end.bairro)}</xBairro>`);
      partes.push(`</end>`);
    }
    if (cliente.phone) partes.push(`<fone>${dig(cliente.phone)}</fone>`);
    if (cliente.email) partes.push(`<email>${esc(cliente.email)}</email>`);
    partes.push(`</toma>`);
  }

  partes.push(`<serv>`);
  partes.push(`<locPrest><cLocPrestacao>${municipio}</cLocPrestacao></locPrest>`);
  partes.push(`<cServ>`);
  partes.push(`<cTribNac>${cTribNac}</cTribNac>`);
  if (codMunicipal) partes.push(`<cTribMun>${esc(codMunicipal)}</cTribMun>`);
  partes.push(`<xDescServ>${esc(descricao)}</xDescServ>`);
  partes.push(`</cServ>`);
  partes.push(`</serv>`);

  partes.push(`<valores>`);
  partes.push(`<vServPrest><vServ>${money(total)}</vServ></vServPrest>`);
  partes.push(`<trib>`);
  partes.push(`<tribMun>`);
  partes.push(`<tribISSQN>1</tribISSQN>`);
  partes.push(`<pAliq>${money(aliquota)}</pAliq>`);
  partes.push(`<tpRetISSQN>${issRetido ? '2' : '1'}</tpRetISSQN>`);
  partes.push(`</tribMun>`);
  // O filho de totTrib depende do REGIME, não do valor — escolher pelo
  // critério errado gera o erro E0712.
  const simples = empresa?.tax_regime === 'simples_nacional';
  partes.push(simples
    ? `<totTrib><pTotTribSN>0</pTotTribSN></totTrib>`
    : `<totTrib><indTotTrib>0</indTotTrib></totTrib>`);
  partes.push(`</trib>`);
  partes.push(`</valores>`);

  partes.push(`</infDPS>`);
  partes.push(`</DPS>`);

  return { xml: partes.join(''), id, total, aliquota, iss: Math.round(total * aliquota) / 100 };
}
