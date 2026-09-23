// Compras e contas a pagar: o que pode ser feito uma vez só.
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
