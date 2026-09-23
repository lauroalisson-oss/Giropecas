// Projeção de fluxo de caixa.
//
// Três coisas que a oficina precisa ver separadas, e que estavam
// misturadas ou faltando:
//
//   saldo atual   — o que já entrou menos o que já saiu
//   em atraso     — vencido e ainda não resolvido
//   a vencer      — o que está por vir, dia a dia
//
// O que vence hoje conta como a vencer; o que venceu ontem é atraso.

import { emAberto, estaQuitado } from './crediario';
import { situacaoCompra } from './compras';

const centavos = (v) => Math.round((Number(v) || 0) * 100);
const reais = (c) => Math.round(c) / 100;
const soma = (lista) => reais(lista.reduce((s, x) => s + centavos(x.valor), 0));

const hojeISO = () => new Date().toISOString().split('T')[0];

/**
 * Contas a receber: parcelas de crediário ainda em aberto.
 *
 * O valor sai de total menos pago, não da coluna remaining_amount: se
 * ela tiver ficado defasada, a projeção mostraria dinheiro que não vem.
 */
export function aReceber(titulos, hoje = hojeISO()) {
  const abertos = (titulos || []).filter(t =>
    t && t.status !== 'cancelado' && !estaQuitado(t) && centavos(emAberto(t)) > 0);

  const linha = (t) => ({
    data: t.due_date || null,
    valor: emAberto(t),
    descricao: `Crediário ${t.title_number || ''}`.trim(),
    tipo: 'receber',
  });

  return {
    // Parcela vencida NÃO some: é justamente a que a oficina precisa
    // enxergar. Antes o filtro `due_date >= hoje` a escondia da projeção.
    atraso: abertos.filter(t => t.due_date && t.due_date < hoje).map(linha),
    aVencer: abertos.filter(t => t.due_date && t.due_date >= hoje).map(linha),
    semData: abertos.filter(t => !t.due_date).map(linha),
  };
}

/**
 * Contas a pagar: despesas cadastradas + compras recebidas ainda não pagas.
 *
 * A compra recebida e não paga é dívida com o fornecedor tão real quanto
 * uma conta de luz — a peça já está na prateleira. Ficava de fora porque
 * a projeção só olhava a tela de Contas a Pagar.
 */
export function aPagar({ contas, compras }, hoje = hojeISO()) {
  const abertas = (contas || []).filter(b => b && b.status !== 'pago' && centavos(b.amount) > 0);

  const linhaConta = (b) => ({
    data: b.due_date || null,
    valor: reais(centavos(b.amount)),
    descricao: b.description || 'Conta',
    tipo: 'pagar',
  });

  // Compra não tem vencimento: o acerto é entre a oficina e o
  // fornecedor. Entra sem data, para somar no total sem inventar um dia.
  const comprasPendentes = (compras || [])
    .filter(c => situacaoCompra(c).custoPendente && centavos(c.total) > 0)
    .map(c => ({
      data: null,
      valor: reais(centavos(c.total)),
      descricao: `Compra ${c.order_number || ''}`.trim(),
      tipo: 'pagar',
      origem: 'compra',
    }));

  return {
    atraso: abertas.filter(b => b.due_date && b.due_date < hoje).map(linhaConta),
    aVencer: abertas.filter(b => b.due_date && b.due_date >= hoje).map(linhaConta),
    semData: [...abertas.filter(b => !b.due_date).map(linhaConta), ...comprasPendentes],
  };
}

// Saldo de caixa: o que entrou menos o que saiu, pelos lançamentos.
export function saldoAtual(lancamentos) {
  const c = (lancamentos || []).reduce((s, e) => {
    if (!e) return s;
    const v = centavos(e.amount);
    return e.type === 'credit' ? s + v : s - v;
  }, 0);
  return reais(c);
}

/**
 * Projeção dia a dia para os próximos `dias`.
 */
export function projetarFluxo({ titulos, contas, compras, lancamentos, hoje = hojeISO(), dias = 30 }) {
  const receber = aReceber(titulos, hoje);
  const pagar = aPagar({ contas, compras }, hoje);
  const saldo = saldoAtual(lancamentos);

  const base = new Date(`${hoje}T12:00:00`);
  const projecao = [];
  for (let i = 0; i < dias; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const dia = d.toISOString().split('T')[0];
    projecao.push({
      data: dia,
      rotulo: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      receber: soma(receber.aVencer.filter(x => x.data === dia)),
      pagar: soma(pagar.aVencer.filter(x => x.data === dia)),
    });
  }

  const ate = (janela) => {
    const d = new Date(base);
    d.setDate(d.getDate() + janela);
    const limite = d.toISOString().split('T')[0];
    const r = soma(receber.aVencer.filter(x => x.data <= limite));
    const p = soma(pagar.aVencer.filter(x => x.data <= limite));
    return { receber: r, pagar: p, saldo: reais(centavos(r) - centavos(p)) };
  };

  const atrasoReceber = soma(receber.atraso);
  const atrasoPagar = soma(pagar.atraso);
  const semDataPagar = soma(pagar.semData);

  return {
    saldoAtual: saldo,
    receber,
    pagar,
    projecao,
    atraso: {
      receber: atrasoReceber,
      pagar: atrasoPagar,
      saldo: reais(centavos(atrasoReceber) - centavos(atrasoPagar)),
    },
    semData: { receber: soma(receber.semData), pagar: semDataPagar },
    janelas: { d30: ate(30), d60: ate(60), d90: ate(90) },
  };
}
