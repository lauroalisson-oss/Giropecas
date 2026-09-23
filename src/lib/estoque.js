// Devolução de estoque ao desfazer uma venda ou uma OS.
//
// O estoque só é baixado no PAGAMENTO — antes disso a OS pode ter peças
// lançadas sem nada ter saído da prateleira. Por isso "desfazer" não pode
// simplesmente somar de volta o que está na lista de peças: numa OS nunca
// paga, isso inventaria peças que a oficina não tem.
//
// A fonte da verdade é o que foi de fato movimentado. Cada baixa grava um
// StockMovement 'saida' com reference_id do documento; cada devolução
// grava um 'devolucao' com o mesmo reference_id. O que falta devolver é a
// diferença entre os dois.

// Quanto ainda há para devolver, por peça.
//
// Devolver duas vezes seria tão errado quanto não devolver: a oficina
// passaria a contar peça que não existe. Descontar o que já voltou é o
// que torna a operação repetível sem estragar a contagem.
export function saldoADevolver(movimentos) {
  const saldo = new Map();

  for (const m of movimentos || []) {
    const id = m?.part_id;
    if (!id) continue;
    const qtd = Number(m.quantity) || 0;
    if (qtd <= 0) continue;

    if (m.type === 'saida') {
      saldo.set(id, (saldo.get(id) || 0) + qtd);
    } else if (m.type === 'devolucao') {
      saldo.set(id, (saldo.get(id) || 0) - qtd);
    }
  }

  return [...saldo.entries()]
    .filter(([, qtd]) => qtd > 0)
    .map(([part_id, quantity]) => ({ part_id, quantity }));
}

// Houve baixa de estoque por este documento?
export const temBaixaDeEstoque = (movimentos) => saldoADevolver(movimentos).length > 0;
