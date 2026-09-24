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

// Peças cuja baixa vai deixar o estoque negativo.
//
// Isso acontece de verdade: a peça foi instalada na moto do cliente, mas
// o cadastro dizia ter menos do que havia — ou alguém vendeu a mesma peça
// no balcão enquanto a OS estava aberta.
//
// O que NÃO serve é esconder. `Math.max(0, saldo - qtd)` deixava o
// estoque em zero e engolia a diferença: a oficina continuava achando
// que a contagem batia, e só descobriria no balanço, sem saber onde
// procurar. É melhor registrar o negativo e avisar na hora — negativo é
// um recado de que a contagem precisa de conferência.
export function faltaEmEstoque(itens, pecaPorId) {
  const faltas = [];

  for (const item of itens || []) {
    const id = item?.part_id;
    if (!id) continue;

    const peca = pecaPorId?.[id];
    if (!peca) continue;

    const saldo = Number(peca.stock_quantity) || 0;
    const qtd = Number(item.quantity) || 0;
    if (qtd <= 0) continue;

    if (qtd > saldo) {
      faltas.push({
        part_id: id,
        descricao: peca.description || item.description || 'peça',
        saldo,
        pedido: qtd,
        falta: qtd - saldo,
      });
    }
  }

  return faltas;
}

// Frase pronta para o aviso na tela.
export function avisoFaltaEmEstoque(faltas) {
  if (!faltas?.length) return null;
  const lista = faltas
    .map(f => `${f.descricao} (tinha ${f.saldo}, saiu ${f.pedido})`)
    .join('; ');
  return `O estoque ficou negativo em ${faltas.length} peça(s): ${lista}. `
    + 'Confira a contagem — a baixa foi registrada como aconteceu.';
}

// Os tipos que o banco aceita num movimento de estoque — espelho das regras
// stock_movements_type_chk e stock_movements_reference_type_chk. Conferidos
// contra as migrações pela suíte lancamentos.mjs.
export const TIPOS_MOVIMENTO = ['entrada', 'saida', 'ajuste', 'devolucao'];
export const REFERENCIAS_MOVIMENTO = ['work_order', 'sale', 'purchase', 'manual'];

/**
 * A devolução ao estoque do que saiu por conta de uma OS ou venda.
 *
 * Existia duas vezes — no cancelamento da OS e na exclusão do Histórico —
 * e as duas gravavam reference_type = 'estorno', que o banco NÃO aceita.
 * Pior, somavam a peça no estoque ANTES de gravar o movimento: o movimento
 * era recusado, a operação falhava, e o estoque já tinha subido. Tentar de
 * novo somava outra vez, porque a devolução nunca ficava registrada. Cada
 * tentativa de cancelar uma OS paga inflava o estoque, e o cancelamento
 * nunca concluía.
 *
 * Aqui o tipo é o mesmo da saída — o id aponta para uma OS ou uma venda, e
 * o reference_type diz qual. Que é devolução, quem diz é o type.
 *
 * Devolve os passos na ORDEM de gravação: movimento primeiro, saldo
 * depois. O movimento é o registro; o saldo na peça é derivado dele. Se o
 * saldo falhar, a conferência acha a diferença — o contrário não deixava
 * rastro nenhum.
 *
 * @param {object} p
 * @param {Array}  p.movimentos     movimentos já gravados com este reference_id
 * @param {object} p.estoqueAtual   { part_id: quantidade atual }
 * @param {string} p.referenceId    id da OS ou da venda
 * @param {'work_order'|'sale'} p.referenceType
 */
export function devolucaoDeEstoque({ movimentos, estoqueAtual = {}, referenceId, referenceType, motivo, companyId }) {
  if (!REFERENCIAS_MOVIMENTO.includes(referenceType)) {
    throw new Error(`Tipo de referência inválido para movimento de estoque: ${referenceType}`);
  }
  return saldoADevolver(movimentos).map(({ part_id, quantity }) => {
    const antes = Number(estoqueAtual[part_id]) || 0;
    const depois = antes + quantity;
    return {
      part_id,
      quantity,
      movimento: {
        company_id: companyId, part_id, type: 'devolucao', quantity, reason: motivo,
        reference_id: referenceId, reference_type: referenceType,
        previous_stock: antes, new_stock: depois,
      },
      novoEstoque: depois,
    };
  });
}
