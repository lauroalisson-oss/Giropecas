// O que de fato entra no caixa no momento da venda.
//
// Uma venda no crediário NÃO é dinheiro em caixa. O valor financiado vira
// dívida do cliente (CreditTitle) e só entra quando cada parcela é paga.
//
// Sem essa separação, a mesma venda era somada duas vezes ao caixa: uma
// pelo total no fechamento, outra parcela a parcela conforme o cliente
// pagava. O relatório mostrava faturamento que nunca existiu.

const centavos = (v) => Math.round((Number(v) || 0) * 100);
const reais = (c) => Math.round(c) / 100;

export const CREDIARIO = 'crediario';
export const METODOS_CARTAO = ['cartao_credito', 'cartao_debito'];

// Os tipos de referência que o banco aceita num lançamento de caixa.
//
// Espelha a regra accounting_entries_reference_type_chk. Quando a
// comissão passou a gravar 'commission' sem que a regra aceitasse, todo
// pagamento de comissão falhou em produção — e a suíte, que testava a
// função e não o banco, passou verde. A suíte lancamentos.mjs lê a última
// migração que define a regra e confere contra esta lista.
export const REFERENCIAS_LANCAMENTO = [
  'sale', 'payment', 'purchase', 'manual', 'tax', 'commission', 'refund',
];

export const VENDA_CANCELADA = 'cancelado';

// Venda cancelada não é receita.
//
// Cancelar uma OS paga devolve o dinheiro ao cliente. A venda continua no
// banco — é o histórico —, mas somá-la no faturamento contaria como
// receita um dinheiro que voltou para o bolso do cliente.
export function vendaValida(venda) {
  return !!venda && venda.status !== VENDA_CANCELADA;
}

// Os nomes do cadastro de taxas. Moram aqui para que o cadastro e as duas
// telas de pagamento ofereçam a MESMA lista — as telas de pagamento
// listavam 5 bandeiras e o cadastro 7: um cartão Banricompras não tinha
// como ser escolhido na hora de cobrar.
export const MAQUINA_GERAL = 'Geral (todas)';
export const BANDEIRA_OUTRAS = 'Outras';
export const BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard', 'Banricompras', BANDEIRA_OUTRAS];
export const MAQUINAS = [MAQUINA_GERAL, 'Stone', 'Cielo', 'PagSeguro', 'Rede', 'GetNet', 'Mercado Pago', 'InfinitePay'];

const percentualDa = (linha, p) => (p.method === 'cartao_debito'
  ? Number(linha.debit_rate) || 0
  : Number(linha.credit_rates?.[String(p.installments || 1)]) || 0);

/**
 * As linhas do cadastro que PODEM valer para um pagamento.
 *
 * A versão anterior escolhia uma linha só, e quando o pagamento não dizia
 * a bandeira ("Qualquer") ficava com a primeira linha da maquininha — a
 * ordem do SELECT decidia se a venda pagava 3% (Visa) ou 5% (Amex). E as
 * telas de pagamento nem deixavam escolher a maquininha: tudo saía como
 * "Geral (todas)", e a oficina que cadastrou as taxas como "Stone" ficava
 * com taxa ZERO em toda venda no cartão.
 *
 * Agora: a maquininha informada; sem linha para ela, a coringa "Geral
 * (todas)"; sem coringa, nenhuma (falta cadastrar). Maquininha NÃO
 * informada: a coringa, ou todas se não houver coringa. Dentro disso, a
 * bandeira informada; sem ela, "Outras"; sem nenhuma, todas.
 */
export function linhasDaTaxa(pagamento, taxas = []) {
  const p = pagamento || {};
  const lista = (taxas || []).filter(Boolean);
  if (!lista.length) return [];

  const informada = p.machine && p.machine !== MAQUINA_GERAL;
  const daMaquina = informada ? lista.filter(r => r.machine === p.machine) : [];
  const geral = lista.filter(r => r.machine === MAQUINA_GERAL);
  // Maquininha informada e sem taxa própria nem coringa: nenhuma linha. Usar
  // a taxa de OUTRA maquininha seria chutar — a tela avisa que falta
  // cadastrar. Só quando a maquininha NÃO foi dita é que todas entram.
  const base = daMaquina.length ? daMaquina : (geral.length ? geral : (informada ? [] : lista));
  if (!base.length) return [];

  if (p.brand) {
    // Todas as que casam, não a primeira: sem maquininha informada, a
    // mesma bandeira aparece uma vez por maquininha — e escolher a primeira
    // devolvia a decisão à ordem do SELECT.
    for (const grupo of [base, geral]) {
      const exata = grupo.filter(r => r.brand === p.brand);
      if (exata.length) return exata;
      const outras = grupo.filter(r => r.brand === BANDEIRA_OUTRAS);
      if (outras.length) return outras;
    }
  }
  return base;
}

/**
 * A faixa de percentuais possível para o pagamento. min === max quando não
 * há dúvida (uma linha só, ou todas com a mesma taxa).
 */
export function faixaDaTaxa(pagamento, taxas = []) {
  const p = pagamento || {};
  if (!METODOS_CARTAO.includes(p.method)) return { min: 0, max: 0 };
  const pcts = linhasDaTaxa(p, taxas).map(l => percentualDa(l, p));
  if (!pcts.length) return { min: 0, max: 0 };
  return { min: Math.min(...pcts), max: Math.max(...pcts) };
}

// Quando a taxa depende de algo que o pagamento não disse. A tela mostra
// e pede a bandeira ou a maquininha.
export function taxaIncerta(pagamento, taxas = []) {
  const { min, max } = faixaDaTaxa(pagamento, taxas);
  return min !== max ? { min, max } : null;
}

/**
 * A taxa que a maquininha desconta de UM pagamento.
 *
 * Havendo dúvida, usa a MAIOR taxa possível: melhor o lucro aparecer um
 * pouco menor, com aviso na tela, do que maior do que foi.
 *
 * @param {object} pagamento  { method, brand, machine, installments, amount }
 * @param {Array}  taxas      linhas de card_rates
 */
export function taxaDeCartao(pagamento, taxas = []) {
  const p = pagamento || {};
  const { max } = faixaDaTaxa(p, taxas);
  if (max <= 0) return 0;
  return reais(Math.round(centavos(p.amount) * max) / 100);
}

// A maquininha que o pagamento começa marcando: a única cadastrada, se for
// uma só; a coringa, se existir; senão nenhuma — e a tela pede.
export function maquinasCadastradas(taxas = []) {
  return [...new Set((taxas || []).filter(Boolean).map(r => r.machine).filter(Boolean))];
}

export function maquinaPadrao(taxas = []) {
  const ms = maquinasCadastradas(taxas);
  if (ms.length === 1) return ms[0];
  return ms.includes(MAQUINA_GERAL) ? MAQUINA_GERAL : '';
}

/**
 * A soma das taxas de todos os pagamentos da venda.
 *
 * Existe porque as duas telas que cobram cartão — o PDV e o modal de
 * faturar OS — tinham cada uma a sua cópia desta conta, e as cópias
 * divergiram. A do modal era:
 *
 *     payments.reduce((s, p) => getCardFee(p), 0)
 *
 * O acumulador `s` não é usado: o resultado era a taxa do ÚLTIMO
 * pagamento, não a soma. Numa OS paga com cartão + dinheiro, a taxa do
 * cartão sumia inteira — o caixa ficava com o valor cheio e o lucro
 * aparecia maior do que foi.
 */
export function totalDeTaxas(pagamentos = [], taxas = []) {
  const totalC = (pagamentos || [])
    .reduce((s, p) => s + centavos(taxaDeCartao(p, taxas)), 0);
  return reais(totalC);
}

/**
 * Separa o que entrou agora do que ficou financiado.
 *
 * @param {object} p
 * @param {number} p.total       valor da venda
 * @param {Array}  p.pagamentos  [{ method, amount }]
 * @param {number} p.entrada     entrada do crediário
 * @returns {{ recebidoAgora: number, financiado: number }}
 */
export function dividirPagamento({ total, pagamentos = [], entrada = 0 }) {
  const totalC = centavos(total);

  const temCrediario = (pagamentos || []).some(p => p?.method === CREDIARIO);

  // Sem crediário, tudo o que foi cobrado entrou agora. O valor pago em
  // dinheiro pode passar do total (troco) — e troco não é faturamento.
  if (!temCrediario) {
    return { recebidoAgora: reais(totalC), financiado: 0 };
  }

  // Com crediário: entra a entrada, mais o que foi pago por outro meio
  // na mesma venda (cartão, pix, dinheiro).
  const outrosC = (pagamentos || [])
    .filter(p => p && p.method !== CREDIARIO)
    .reduce((s, p) => s + centavos(p.amount), 0);

  const recebidoC = Math.min(totalC, Math.max(0, centavos(entrada) + outrosC));

  return {
    recebidoAgora: reais(recebidoC),
    financiado: reais(Math.max(0, totalC - recebidoC)),
  };
}

/**
 * Lançamentos de caixa de uma venda.
 *
 * Um só crédito, pelo que entrou; a taxa de cartão entra como débito
 * separado, porque é despesa e não redução de faturamento.
 */
export function lancamentosDaVenda({
  total, pagamentos, entrada = 0, taxas = 0,
  categoria = 'Vendas', descricao = 'Venda', data, saleId, companyId,
}) {
  const { recebidoAgora, financiado } = dividirPagamento({ total, pagamentos, entrada });
  const lancamentos = [];

  if (centavos(recebidoAgora) > 0) {
    lancamentos.push({
      company_id: companyId, date: data, type: 'credit', category: categoria,
      description: financiado > 0 ? `${descricao} (entrada)` : descricao,
      amount: recebidoAgora, reference_id: saleId, reference_type: 'sale',
    });
  }

  if (centavos(taxas) > 0) {
    lancamentos.push({
      company_id: companyId, date: data, type: 'debit', category: 'Taxas de Cartão',
      description: `Taxa de cartão — ${descricao}`,
      amount: reais(centavos(taxas)), reference_id: saleId, reference_type: 'sale',
    });
  }

  return { lancamentos, recebidoAgora, financiado };
}

/**
 * Estorno de uma venda paga, quando a OS é cancelada.
 *
 * O lojista devolve ao cliente o que ele pagou. No caixa isso é uma SAÍDA,
 * na data do cancelamento. A entrada original não é apagada: ela aconteceu,
 * num mês que pode já estar fechado, e apagá-la reescreveria aquele mês.
 *
 * O valor devolvido é o que ENTROU de verdade por conta desta venda:
 *   - o que foi recebido no fechamento (lançamentos 'sale' de crédito);
 *   - as parcelas de crediário já pagas (lançamentos 'payment' dos títulos);
 *   - menos o que já foi estornado antes, para que cancelar duas vezes não
 *     devolva duas vezes.
 *
 * A taxa de cartão NÃO volta: a maquininha não a devolve no cancelamento,
 * e o débito dela continua sendo custo real.
 *
 * As parcelas ainda em aberto são canceladas — o cliente não deve mais.
 *
 * @param {object} p
 * @param {object} p.venda        a venda da OS
 * @param {Array}  p.titulos      parcelas de crediário da venda
 * @param {Array}  p.lancamentos  lançamentos ligados à venda e às parcelas
 * @param {string} p.data         dia do cancelamento (YYYY-MM-DD)
 * @param {string} p.descricao    ex.: 'OS #123'
 */
export function estornoDaVenda({ venda, titulos = [], lancamentos = [], data, descricao = 'Venda', companyId }) {
  if (!venda?.id) return { valor: 0, lancamentos: [], titulosACancelar: [] };

  const idsTitulos = new Set((titulos || []).filter(Boolean).map(t => t.id));
  const lista = (lancamentos || []).filter(Boolean);

  const entrou = lista.filter(l => l.type === 'credit' && (
    (l.reference_type === 'sale' && l.reference_id === venda.id)
    || (l.reference_type === 'payment' && idsTitulos.has(l.reference_id))
  )).reduce((s, l) => s + centavos(l.amount), 0);

  const jaDevolvido = lista.filter(l =>
    l.type === 'debit' && l.reference_type === 'refund' && l.reference_id === venda.id,
  ).reduce((s, l) => s + centavos(l.amount), 0);

  const devolverC = Math.max(0, entrou - jaDevolvido);

  const titulosACancelar = (titulos || []).filter(t =>
    t && t.status !== 'cancelado' && centavos(t.total_amount) - centavos(t.paid_amount) > 1,
  ).map(t => t.id);

  const saida = devolverC > 0 ? [{
    company_id: companyId,
    date: data,
    type: 'debit',
    category: 'Estornos',
    description: `Devolução ao cliente — ${descricao} cancelada`,
    amount: reais(devolverC),
    reference_type: 'refund',
    reference_id: venda.id,
  }] : [];

  return { valor: reais(devolverC), lancamentos: saida, titulosACancelar };
}
