// Cancelar uma venda paga devolvendo o dinheiro ao cliente — da OS e do PDV.
//
// A OS ganhou isso primeiro, com a lógica inteira dentro da tela. O PDV
// precisava do mesmo, e uma segunda cópia seria o começo de duas regras
// diferentes para a mesma devolução: foi assim que a taxa de cartão, a
// comissão e o custo das peças divergiram entre telas. As duas telas
// chamam daqui.
//
// Duas etapas, porque entre elas o lojista confirma vendo o valor:
//
//   planejarCancelamento  — só LÊ: nota fiscal, parcelas, lançamentos,
//                           movimentos de estoque. Devolve o plano ou o
//                           motivo do bloqueio.
//   executarCancelamento  — GRAVA, nesta ordem:
//                             1. saída de caixa da devolução
//                             2. parcelas em aberto canceladas
//                             3. peças de volta ao estoque (movimento antes do saldo)
//                             4. a venda marcada como cancelada — POR ÚLTIMO
//
// A venda cancelada é o que esconde o botão. Marcada por último, uma falha
// no meio deixa o botão à mostra, e repetir termina o serviço sem duplicar:
// a devolução desconta o que já foi devolvido e o estoque desconta o que já
// voltou.
//
// `api` são as entidades do base44 (Sale, CreditTitle, AccountingEntry,
// StockMovement, Part, NFeRecord). Injetadas para que a suíte rode o fluxo
// inteiro contra um banco em memória.

import { estornoDaVenda, VENDA_CANCELADA } from './caixa';
import { saldoADevolver, devolucaoDeEstoque } from './estoque';
import { notaAutorizadaDe, motivoNaoExcluir } from './nfse-dados';

const semErro = (p) => Promise.resolve(p).catch(() => []);

/**
 * @param {object} p
 * @param {object} p.api
 * @param {string} p.companyId
 * @param {object} p.venda             a venda (pode ser null: OS nunca paga)
 * @param {object} p.estoque           { id, tipo: 'work_order' | 'sale' } — a quem a baixa foi ligada
 * @param {string} [p.workOrderId]     para achar nota ligada à OS
 * @param {string} p.hoje              dia do cancelamento
 * @param {string} p.descricao         'OS #12' / 'PDV #34'
 */
export async function planejarCancelamento({ api, companyId, venda, estoque, workOrderId = null, hoje, descricao }) {
  if (venda?.status === VENDA_CANCELADA) {
    return { bloqueio: 'Esta venda já está cancelada.' };
  }

  // Nota autorizada trava tudo: ela continuaria valendo no governo.
  const notas = [
    ...(workOrderId ? await semErro(api.NFeRecord.filter({ company_id: companyId, work_order_id: workOrderId })) : []),
    ...(venda?.id ? await semErro(api.NFeRecord.filter({ company_id: companyId, sale_id: venda.id })) : []),
  ];
  const nota = notaAutorizadaDe(notas, { workOrderId, saleId: venda?.id });
  if (nota) return { bloqueio: motivoNaoExcluir(nota), nota };

  let titulos = [];
  let estorno = { valor: 0, lancamentos: [], titulosACancelar: [] };
  if (venda?.id) {
    titulos = await semErro(api.CreditTitle.filter({ company_id: companyId, sale_id: venda.id }));
    const daVenda = await semErro(api.AccountingEntry.filter({ company_id: companyId, reference_id: venda.id }));
    const dasParcelas = (await Promise.all(titulos.map(t =>
      semErro(api.AccountingEntry.filter({ company_id: companyId, reference_id: t.id })),
    ))).flat();
    estorno = estornoDaVenda({
      venda, titulos, lancamentos: [...daVenda, ...dasParcelas], data: hoje, descricao, companyId,
    });
  }

  let devolucoes = [];
  if (estoque?.id) {
    const movimentos = await semErro(api.StockMovement.filter({ reference_id: estoque.id }));
    // O saldo de agora, do banco — nunca o de uma lista carregada antes.
    const estoqueAtual = {};
    for (const { part_id } of saldoADevolver(movimentos)) {
      const peca = await api.Part.get(part_id).catch(() => null);
      if (peca) estoqueAtual[part_id] = peca.stock_quantity || 0;
    }
    devolucoes = devolucaoDeEstoque({
      movimentos, estoqueAtual, referenceId: estoque.id, referenceType: estoque.tipo,
      motivo: `Cancelamento — ${descricao}`, companyId,
    }).filter(d => d.part_id in estoqueAtual);
  }

  return { estorno, devolucoes, titulos };
}

// O texto da confirmação — igual nas duas telas.
export function avisoDeCancelamento(plano, { oque = 'esta venda', formatar = (v) => `R$ ${v}` } = {}) {
  const linhas = [`Cancelar ${oque}?`];
  if (plano.estorno.valor > 0) {
    linhas.push('', `O cliente recebe ${formatar(plano.estorno.valor)} de volta. A saída é lançada no caixa hoje.`);
  }
  if (plano.estorno.titulosACancelar.length) {
    linhas.push(`${plano.estorno.titulosACancelar.length} parcela(s) em aberto serão canceladas.`);
  }
  if (plano.devolucoes.length) {
    linhas.push(`${plano.devolucoes.length} peça(s) voltam ao estoque.`);
  }
  return linhas.join('\n');
}

export async function executarCancelamento({ api, venda, plano }) {
  for (const l of plano.estorno.lancamentos) await api.AccountingEntry.create(l);
  for (const tid of plano.estorno.titulosACancelar) {
    await api.CreditTitle.update(tid, { status: 'cancelado' });
  }
  for (const passo of plano.devolucoes) {
    await api.StockMovement.create(passo.movimento);
    await api.Part.update(passo.part_id, { stock_quantity: passo.novoEstoque });
  }
  // Por último: é o que esconde o botão. Ver o cabeçalho.
  if (venda?.id && venda.status !== VENDA_CANCELADA) {
    await api.Sale.update(venda.id, { status: VENDA_CANCELADA });
  }
  return {
    devolvido: plano.estorno.valor,
    pecas: plano.devolucoes.length,
    parcelas: plano.estorno.titulosACancelar.length,
  };
}
