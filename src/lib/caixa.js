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

// Linha coringa do cadastro de taxas: vale para qualquer maquininha.
const MAQUINA_GERAL = 'Geral (todas)';
const BANDEIRA_GERAL = 'Outras';

/**
 * A taxa que a maquininha desconta de UM pagamento.
 *
 * A escolha da linha é explícita e vai do mais específico ao mais geral.
 * Nunca cai numa linha qualquer: se nada casa, a taxa é zero e o lojista
 * vê que falta cadastrar — melhor do que cobrar 4,2% da Stone numa venda
 * feita na Cielo porque aquela linha voltou primeiro do banco.
 *
 * @param {object} pagamento  { method, brand, machine, installments, amount }
 * @param {Array}  taxas      linhas de card_rates
 */
export function taxaDeCartao(pagamento, taxas = []) {
  const p = pagamento || {};
  if (!METODOS_CARTAO.includes(p.method)) return 0;

  const lista = (taxas || []).filter(Boolean);
  const casaMaquina = r => r.machine === p.machine || r.machine === MAQUINA_GERAL;
  const casaBandeira = r => r.brand === p.brand || r.brand === BANDEIRA_GERAL;

  const linha =
    // 1. bandeira e maquininha exatas
    lista.find(r => r.brand === p.brand && r.machine === p.machine)
    // 2. a maquininha certa, bandeira coringa (ou pagamento sem bandeira)
    || lista.find(r => r.machine === p.machine && (casaBandeira(r) || !p.brand))
    // 3. a bandeira certa na linha coringa de maquininha
    || lista.find(r => r.machine === MAQUINA_GERAL && casaBandeira(r))
    // 4. qualquer linha coringa de maquininha
    || lista.find(casaMaquina);

  if (!linha) return 0;

  const percentual = p.method === 'cartao_debito'
    ? Number(linha.debit_rate) || 0
    : Number(linha.credit_rates?.[String(p.installments || 1)]) || 0;

  if (percentual <= 0) return 0;
  return reais(Math.round(centavos(p.amount) * percentual) / 100);
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
