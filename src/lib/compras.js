// Compras e contas a pagar.
//
// RECEBIMENTO e PAGAMENTO são dois fatos separados, em datas que podem
// estar a 30 dias de distância:
//
//   receber  →  a peça entra no estoque. Não move o caixa.
//   pagar    →  o dinheiro sai. É AQUI que o custo entra, e na DATA em
//               que o pagamento aconteceu de verdade.
//
// Lançar o custo no recebimento jogaria a despesa no mês errado para
// quem compra a prazo. Não lançar nunca — como era antes — mostrava a
// receita da peça sem o custo dela. Cada oficina informa quando pagou.
//
// Receber uma compra soma ao estoque; marcar uma conta como paga lança
// uma saída no caixa. As duas são operações que não se desfazem sozinhas,
// e as duas estavam ao alcance de um clique duplo — a tela só escondia o
// botão DEPOIS de recarregar, e o recarregamento leva alguns segundos.

const centavos = (v) => Math.round((Number(v) || 0) * 100);

/**
 * A compra pode ser recebida?
 * @returns {null} quando pode, ou { erro } com o motivo.
 */
export function podeReceber(compra) {
  if (!compra) return { erro: 'Ordem de compra não encontrada.' };
  if (compra.status === 'recebida') {
    return { erro: 'Esta compra já foi recebida — o estoque já foi somado.' };
  }
  if (compra.status === 'cancelada') {
    return { erro: 'Esta compra foi cancelada.' };
  }
  if (!(compra.items || []).some(i => i?.part_id)) {
    return { erro: 'Esta compra não tem peças para dar entrada.' };
  }
  return null;
}

/**
 * A conta pode ser marcada como paga?
 */
export function podePagar(conta) {
  if (!conta) return { erro: 'Conta não encontrada.' };
  if (conta.status === 'pago') {
    return { erro: 'Esta conta já está paga — o lançamento no caixa já foi feito.' };
  }
  if (conta.status === 'cancelado') {
    return { erro: 'Esta conta foi cancelada.' };
  }
  if (centavos(conta.amount) <= 0) {
    return { erro: 'Conta sem valor.' };
  }
  return null;
}

/**
 * O que a exclusão de uma conta vai atingir.
 *
 * Excluir uma conta JÁ PAGA deixava a saída no caixa sem nada atrás dela:
 * o relatório mostrava a despesa e ninguém sabia de onde vinha.
 */
export function impactoExclusaoConta(conta) {
  const paga = conta?.status === 'pago';
  return {
    paga,
    valor: Math.round(centavos(conta?.amount)) / 100,
    // Quando a conta foi paga, o lançamento de caixa sai junto: o lojista
    // está dizendo que esse registro não deveria existir.
    removeLancamento: paga,
  };
}


/**
 * A compra pode ter o pagamento registrado?
 */
export function podeRegistrarPagamento(compra) {
  if (!compra) return { erro: 'Ordem de compra não encontrada.' };
  if (compra.payment_status === 'pago') {
    return { erro: 'Esta compra já está paga — o custo já entrou no caixa.' };
  }
  if (compra.status === 'cancelada') {
    return { erro: 'Esta compra foi cancelada.' };
  }
  if (centavos(compra.total) <= 0) {
    return { erro: 'Compra sem valor para pagar.' };
  }
  return null;
}

// Data informada pelo lojista, ou hoje. É ela que define em qual mês o
// custo aparece no relatório — por isso não pode ser "quando cliquei".
export function dataDePagamento(informada) {
  const texto = String(informada || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  return new Date().toISOString().split('T')[0];
}

/**
 * Lançamento de saída no caixa pelo pagamento de uma compra.
 *
 * A data do lançamento é a do PAGAMENTO, não a de hoje: é isso que faz o
 * custo cair no mês certo quando a oficina registra um pagamento
 * atrasado.
 */
export function lancamentoPagamentoCompra({ compra, data, companyId }) {
  const quando = dataDePagamento(data);
  return {
    company_id: companyId,
    date: quando,
    type: 'debit',
    category: 'Compra de Peças',
    description: `Compra ${compra?.order_number || ''}`.trim(),
    amount: Math.round(centavos(compra?.total)) / 100,
    reference_type: 'purchase',
    reference_id: compra?.id,
  };
}

// Situação da compra para a tela: recebimento e pagamento lado a lado.
export function situacaoCompra(compra) {
  return {
    recebida: compra?.status === 'recebida',
    paga: compra?.payment_status === 'pago',
    cancelada: compra?.status === 'cancelada',
    // Peça no estoque sem o custo lançado: normal enquanto o prazo corre,
    // mas é o que a oficina precisa enxergar para não esquecer.
    custoPendente: compra?.status === 'recebida' && compra?.payment_status !== 'pago',
  };
}

// Quanto há de compras recebidas e ainda não pagas.
export function aPagarEmCompras(compras) {
  const pendentes = (compras || []).filter(c => situacaoCompra(c).custoPendente);
  const totalC = pendentes.reduce((s, c) => s + centavos(c.total), 0);
  return { quantidade: pendentes.length, total: Math.round(totalC) / 100 };
}
