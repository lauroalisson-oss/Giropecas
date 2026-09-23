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
