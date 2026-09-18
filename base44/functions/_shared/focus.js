// Helpers compartilhados da integração fiscal (gateway Focus NFe).
// Usado pelas functions emitirNota / consultarNota / cancelarNota.
//
// IMPORTANTE: as regras tributárias (CFOP, NCM, CST/CSOSN, alíquotas) aqui são
// PADRÕES para varejo de autopeças no Simples Nacional. Elas DEVEM ser
// validadas com o contador do cliente antes do uso em produção.

// Base da API conforme o ambiente configurado na empresa.
export function focusBaseUrl(ambiente) {
  return ambiente === 'producao'
    ? 'https://api.focusnfe.com.br'
    : 'https://homologacao.focusnfe.com.br';
}

// Código do regime tributário no padrão do gateway/SEFAZ.
// 1 = Simples Nacional | 3 = Regime Normal (Lucro Presumido/Real)
export function regimeTributarioCodigo(taxRegime) {
  return taxRegime === 'simples_nacional' ? '1' : '3';
}

// Base64 de um Uint8Array (para enviar o certificado .pfx ao gateway).
export function toBase64(uint8) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < uint8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const digits = (s) => String(s || '').replace(/\D/g, '');

// Monta o corpo de cadastro/atualização de empresa (emitente) no gateway.
// Envia os dados fiscais + certificado A1 + CSC — tudo o que a oficina
// preencheu DENTRO do sistema, sem precisar acessar o painel do provedor.
export function buildEmpresaPayload({ company, certificadoBase64, senhaCertificado }) {
  return {
    nome: company.name,
    nome_fantasia: company.name,
    cnpj: digits(company.cnpj),
    inscricao_estadual: company.ie || 'ISENTO',
    ...(company.im ? { inscricao_municipal: company.im } : {}),
    regime_tributario: regimeTributarioCodigo(company.tax_regime),
    email: company.email || undefined,
    telefone: company.phone ? digits(company.phone) : undefined,
    logradouro: company.address || undefined,
    municipio: company.city || undefined,
    uf: company.state || undefined,
    cep: company.zip_code ? digits(company.zip_code) : undefined,

    // Certificado digital A1 (.pfx) — enviado ao gateway, não guardado aqui
    arquivo_certificado_base64: certificadoBase64,
    senha_certificado: senhaCertificado,

    // CSC da NFC-e (para os dois ambientes)
    ...(company.csc ? {
      csc_nfce_producao: company.csc,
      csc_nfce_homologacao: company.csc,
    } : {}),
    ...(company.csc_id ? {
      id_token_nfce_producao: company.csc_id,
      id_token_nfce_homologacao: company.csc_id,
    } : {}),

    habilita_nfce: true,
    habilita_nfe: true,
    enviar_email_destinatario: false,
  };
}

// Cabeçalho de autenticação HTTP Basic (token como usuário, senha vazia).
export function focusAuthHeader(token) {
  const b64 = btoa(`${token}:`);
  return `Basic ${b64}`;
}

// Mapeia a forma de pagamento interna para o código do gateway/SEFAZ.
export function mapPagamento(metodo) {
  const map = {
    dinheiro: '01',
    cartao_credito: '03',
    cartao_debito: '04',
    pix: '17',
    crediario: '05',
    misto: '99',
  };
  return map[metodo] || '99';
}

// CST (regime normal) ou CSOSN (Simples Nacional) padrão para revenda.
function icmsSituacao(taxRegime) {
  // Simples Nacional -> CSOSN 102 (tributada sem permissão de crédito)
  // Regime normal    -> CST 102 não existe; usa 00 (tributada integralmente)
  return taxRegime === 'simples_nacional' ? '102' : '00';
}

const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');

// Origem da mercadoria (0-8) cadastrada na peça. Fora da faixa -> 0 (nacional).
// Importante para autopeça importada, que não pode sair como nacional.
function icmsOrigemItem(part) {
  const o = soDigitos(part && part.origin);
  return /^[0-8]$/.test(o) ? o : '0';
}

// CSOSN (Simples, 3 dígitos) ou CST (regime normal, 2 dígitos) cadastrado na peça.
// Se estiver ausente ou incompatível com o regime, cai no padrão do regime —
// evita rejeição por enviar CST de regime errado.
function icmsSituacaoItem(part, taxRegime) {
  const cst = soDigitos(part && part.cst_icms);
  const simples = taxRegime === 'simples_nacional';
  if (simples && /^\d{3}$/.test(cst)) return cst;
  if (!simples && /^\d{2}$/.test(cst)) return cst;
  return icmsSituacao(taxRegime);
}

// Constrói a lista de itens no formato do gateway a partir dos itens da venda.
// Apenas mercadorias (peças) entram na NF-e/NFC-e; serviços (mão de obra) são
// municipais (NFS-e) e ficam fora deste documento.
export function buildItens(saleItems, partsById, taxRegime) {
  const itens = [];
  let numero = 1;
  for (const it of saleItems || []) {
    if (it.type && it.type !== 'part') continue; // ignora serviços
    const part = it.id ? partsById[it.id] : null;
    const qtd = Number(it.quantity) || 1;
    const unit = Number(it.unit_price) || 0;
    const bruto = Number(it.total_price) || +(qtd * unit).toFixed(2);
    const ncm = soDigitos(part && part.ncm);
    const item = {
      numero_item: String(numero++),
      codigo_produto: (part && (part.sku || part.internal_code)) || it.id || String(numero),
      descricao: it.description || (part && part.description) || 'Item',
      cfop: (part && part.cfop_default) || '5102',
      unidade_comercial: (part && part.unit ? part.unit.toUpperCase() : 'UN'),
      quantidade_comercial: qtd,
      valor_unitario_comercial: +unit.toFixed(2),
      valor_bruto: +bruto.toFixed(2),
      unidade_tributavel: (part && part.unit ? part.unit.toUpperCase() : 'UN'),
      quantidade_tributavel: qtd,
      valor_unitario_tributavel: +unit.toFixed(2),
      // NCM tem 8 dígitos; se vier inválido usa o genérico de autopeças
      ncm: ncm.length === 8 ? ncm : '87089900',
      icms_origem: icmsOrigemItem(part),
      icms_situacao_tributaria: icmsSituacaoItem(part, taxRegime),
    };

    // CEST (7 dígitos) — obrigatório quando o produto está sujeito a ICMS-ST,
    // caso comum em autopeças. Só envia se estiver completo e válido.
    const cest = soDigitos(part && part.cest);
    if (cest.length === 7) item.cest = cest;

    // CST de PIS/COFINS (2 dígitos) cadastrado na peça
    const cstPis = soDigitos(part && part.cst_pis);
    if (cstPis.length >= 1 && cstPis.length <= 2) {
      const v = cstPis.padStart(2, '0');
      item.pis_situacao_tributaria = v;
      item.cofins_situacao_tributaria = v;
    }

    itens.push(item);
  }
  return itens;
}

const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

// Agrega os serviços da OS numa única NFS-e: o RPS do Focus tem UM bloco
// "servico", então a discriminação lista cada linha de mão de obra e o valor
// é a soma. Os códigos fiscais vêm do primeiro serviço que os tiver, caindo
// no padrão da empresa quando o serviço não define.
export function buildServicoNFSe(serviceItems, servicesById, company) {
  const linhas = [];
  let totalServicos = 0;
  let lc116 = '';
  let codMunicipio = '';
  let aliquota = null;
  let issRetido = false;

  for (const it of serviceItems || []) {
    const svc = it.service_id ? servicesById[it.service_id] : null;
    const valor = Number(it.total_price) || 0;
    totalServicos += valor;
    const desc = it.description || (svc && svc.name) || 'Serviço';
    const qtd = Number(it.hours) || 1;
    linhas.push(`${desc} - ${qtd}h - R$ ${valor.toFixed(2)}`);

    if (svc) {
      if (!lc116 && svc.service_code_lc116) lc116 = svc.service_code_lc116;
      if (!codMunicipio && svc.municipal_service_code) codMunicipio = svc.municipal_service_code;
      if (aliquota == null && Number(svc.iss_rate) > 0) aliquota = Number(svc.iss_rate);
      if (svc.iss_retido) issRetido = true;
    }
  }

  if (aliquota == null) aliquota = Number(company.iss_rate) || 0;
  if (!lc116) lc116 = '14.01'; // oficina: conserto e manutenção de veículos

  return {
    // Alguns municípios esperam o item sem ponto (1401); normalizamos para dígitos.
    item_lista_servico: onlyDigits(lc116),
    ...(codMunicipio ? { codigo_tributario_municipio: codMunicipio } : {}),
    discriminacao: linhas.join(' | ') || 'Serviços prestados',
    valor_servicos: +totalServicos.toFixed(2),
    aliquota,
    iss_retido: issRetido,
  };
}

// Monta o corpo da NFS-e (nota de serviço municipal — ISS).
// Diferente da NF-e/NFC-e: quem recebe é a prefeitura, não a SEFAZ.
export function buildNFSePayload({ company, customer, servico }) {
  const doc = customer && onlyDigits(customer.tax_id);
  const isCnpj = doc && doc.length === 14;

  return {
    data_emissao: new Date().toISOString(),
    prestador: {
      cnpj: onlyDigits(company.cnpj),
      inscricao_municipal: company.im || '',
      codigo_municipio: onlyDigits(company.city_ibge_code),
    },
    ...(doc ? {
      tomador: {
        ...(isCnpj ? { cnpj: doc } : { cpf: doc }),
        razao_social: (customer && customer.name) || 'Consumidor',
        ...(customer && customer.email ? { email: customer.email } : {}),
        ...(customer && customer.address ? {
          endereco: {
            logradouro: customer.address,
            ...(customer.city ? { municipio: customer.city } : {}),
            ...(customer.state ? { uf: customer.state } : {}),
            ...(customer.zip_code ? { cep: onlyDigits(customer.zip_code) } : {}),
          },
        } : {}),
      },
    } : {}),
    servico,
  };
}

// Monta o corpo da NFC-e (modelo 65) — venda ao consumidor no balcão.
export function buildNFCePayload({ company, customer, items, total, pagamento }) {
  const cpf = customer && onlyDigits(customer.tax_id);
  return {
    cnpj_emitente: onlyDigits(company.cnpj),
    data_emissao: new Date().toISOString(),
    presenca_comprador: '1',
    modalidade_frete: '9',
    local_destino: '1',
    natureza_operacao: 'Venda ao consumidor',
    ...(cpf && cpf.length === 11 ? { cpf_destinatario: cpf } : {}),
    ...(customer && customer.name ? { nome_destinatario: customer.name } : {}),
    items,
    formas_pagamento: [{ forma_pagamento: mapPagamento(pagamento), valor_pagamento: +Number(total).toFixed(2) }],
  };
}

// Monta o corpo da NF-e (modelo 55) — venda para empresa/pessoa identificada.
export function buildNFePayload({ company, customer, items, total, pagamento }) {
  const doc = customer && onlyDigits(customer.tax_id);
  const isCnpj = doc && doc.length === 14;
  return {
    natureza_operacao: 'Venda de mercadoria',
    data_emissao: new Date().toISOString(),
    tipo_documento: '1', // 1 = saída
    local_destino: '1',
    finalidade_emissao: '1',
    consumidor_final: '1',
    presenca_comprador: '1',
    modalidade_frete: '9',
    cnpj_emitente: onlyDigits(company.cnpj),

    // Destinatário
    ...(isCnpj ? { cnpj_destinatario: doc } : {}),
    ...(!isCnpj && doc ? { cpf_destinatario: doc } : {}),
    nome_destinatario: (customer && customer.name) || 'Consumidor',
    ...(customer && customer.address ? { logradouro_destinatario: customer.address } : {}),
    ...(customer && customer.city ? { municipio_destinatario: customer.city } : {}),
    ...(customer && customer.state ? { uf_destinatario: customer.state } : {}),
    ...(customer && customer.zip_code ? { cep_destinatario: onlyDigits(customer.zip_code) } : {}),
    indicador_inscricao_estadual_destinatario: '9', // 9 = não contribuinte

    items,
    formas_pagamento: [{ forma_pagamento: mapPagamento(pagamento), valor_pagamento: +Number(total).toFixed(2) }],
  };
}
