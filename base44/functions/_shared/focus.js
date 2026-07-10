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
    itens.push({
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
      ncm: (part && part.ncm) || '87089900', // NCM genérico de autopeças — ajustar por produto
      icms_origem: '0',
      icms_situacao_tributaria: icmsSituacao(taxRegime),
    });
  }
  return itens;
}

const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

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
