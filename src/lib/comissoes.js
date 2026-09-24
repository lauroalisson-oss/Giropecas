// Comissão do mecânico: quanto ele gerou, quanto já recebeu, quanto falta.
//
// O painel de Técnicos fazia essa conta dentro da própria tela, e ela
// divergia do relatório em quase tudo: aceitava outros estados de OS, não
// protegia o percentual ausente, somava em ponto flutuante, e — o pior —
// reconhecia o pagamento pelo NOME do mecânico dentro do texto do
// lançamento.
//
// Três armadilhas que isso abria, todas caras porque o resultado é
// dinheiro saindo do bolso do dono para o bolso de um funcionário:
//
//   1. Nome que é pedaço de outro. Pagar "Ana Paula" fazia a "Ana"
//      aparecer como paga: `description.includes('Ana')` casa com
//      "Comissão paga: Ana Paula". A Ana ficava sem receber.
//
//   2. Mecânico renomeado. Corrigir "Joao" para "João" desligava todos os
//      pagamentos anteriores dele: o pendente voltava ao valor cheio e o
//      dono pagava de novo.
//
//   3. Pagamento em mês diferente do serviço. A comissão de setembro paga
//      em 2 de outubro não aparecia em setembro (o lançamento não é de
//      setembro) e aparecia como saldo negativo em outubro (os serviços
//      não são de outubro). A mesma comissão ficava eternamente a pagar
//      numa tela e negativa na outra.
//
// Por isso o pagamento agora aponta para o mecânico por ID e carrega a
// COMPETÊNCIA — o mês que ele está quitando, que não é o mês em que foi
// pago. É a mesma separação já feita em Compras: o fato e a data do
// dinheiro são coisas diferentes.

const centavos = (v) => Math.round((Number(v) || 0) * 100);
const reais = (c) => Math.round(c) / 100;

export const REFERENCIA_COMISSAO = 'commission';

// Estados de OS que geram comissão: serviço concluído e não cancelado.
//
// Uma OS ainda aberta ou em andamento NÃO gera comissão — o serviço não
// terminou. O relatório contava todas menos as canceladas, o que colocava
// no DRE a comissão de trabalho que ainda estava na bancada.
export const ESTADOS_COM_COMISSAO = ['finalizada', 'faturada'];

export function geraComissao(ordem) {
  return ESTADOS_COM_COMISSAO.includes(ordem?.status);
}

// 'YYYY-MM' — a competência é o mês do serviço, não o do pagamento.
export function competenciaDe(data) {
  if (!data) return null;
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// A data que vale para a OS é a do fechamento; sem ela, a da abertura.
export function competenciaDaOrdem(ordem) {
  return competenciaDe(ordem?.closed_at || ordem?.created_date);
}

/**
 * Comissão gerada por mecânico numa competência, e quanto dela já foi paga.
 *
 * @param {object} p
 * @param {Array} p.ordens       ordens de serviço
 * @param {Array} p.tecnicos     mecânicos cadastrados
 * @param {Array} p.pagamentos   lançamentos de comissão já feitos
 * @param {string} p.competencia 'YYYY-MM'; null = todo o período
 */
export function resumoComissoes({ ordens = [], tecnicos = [], pagamentos = [], competencia = null }) {
  const daCompetencia = (ordem) =>
    !competencia || competenciaDaOrdem(ordem) === competencia;

  return (tecnicos || []).filter(Boolean).map((tecnico) => {
    const minhas = (ordens || []).filter(o =>
      o && o.mechanic_id === tecnico.id && geraComissao(o) && daCompetencia(o));

    const maoDeObraC = minhas.reduce((s, o) =>
      s + (o.service_items || []).reduce((si, sv) => si + centavos(sv?.total_price), 0), 0);

    // Percentual ausente ou zero não vira NaN: vira comissão zero.
    const percentual = Number(tecnico.commission_percent) || 0;
    const geradoC = percentual > 0 ? Math.round(maoDeObraC * percentual / 100) : 0;

    // O pagamento é reconhecido pelo ID do mecânico e pela competência que
    // ele quita — nunca pelo nome escrito na descrição.
    const pagoC = (pagamentos || []).filter(e =>
      e && e.reference_type === REFERENCIA_COMISSAO
      && String(e.reference_id) === String(tecnico.id)
      && (!competencia || e.competencia === competencia),
    ).reduce((s, e) => s + centavos(e.amount), 0);

    const metaC = centavos(tecnico.monthly_goal);
    const metaAtingida = metaC > 0 && maoDeObraC >= metaC;

    return {
      tecnico,
      ordens: minhas.length,
      maoDeObra: reais(maoDeObraC),
      percentual,
      gerado: reais(geradoC),
      pago: reais(pagoC),
      pendente: reais(geradoC - pagoC),
      meta: reais(metaC),
      metaAtingida,
      metaPct: metaC > 0 ? Math.min(100, (maoDeObraC / metaC) * 100) : 0,
    };
  });
}

/**
 * Totais do painel.
 *
 * `pago` não é somado às cegas: um pagamento a mais do que o devido
 * (clique duplo, valor digitado errado) inflava o "total gerado", porque
 * ele era pago + pendente e só o pendente tinha piso zero. O gerado sai
 * do que foi gerado.
 */
export function totaisComissoes(linhas = []) {
  const soma = (f) => (linhas || []).reduce((s, l) => s + centavos(f(l)), 0);
  return {
    gerado: reais(soma(l => l.gerado)),
    pago: reais(soma(l => l.pago)),
    aPagar: reais((linhas || []).reduce((s, l) => s + Math.max(0, centavos(l.pendente)), 0)),
    pagoAMais: reais((linhas || []).reduce((s, l) => s + Math.max(0, -centavos(l.pendente)), 0)),
  };
}

/**
 * Pode registrar o pagamento desta comissão?
 *
 * Marcar como paga cria uma saída no caixa e não se desfaz sozinha. O
 * botão só sumia DEPOIS de a tela recarregar — tempo de sobra para o
 * segundo clique lançar a despesa em dobro.
 */
export function podePagarComissao(linha, competencia) {
  if (!linha?.tecnico?.id) return { erro: 'Mecânico não identificado.' };
  if (!competencia) {
    return {
      erro: 'Escolha um mês para pagar. A comissão é quitada mês a mês — '
        + 'sem isso não há como saber qual período está sendo pago.',
    };
  }
  if (centavos(linha.gerado) <= 0) return { erro: 'Não há comissão gerada neste mês.' };
  if (centavos(linha.pendente) <= 0) {
    return {
      erro: `A comissão de ${linha.tecnico.name || 'este mecânico'} neste mês já foi paga. `
        + 'A saída no caixa já foi lançada.',
    };
  }
  return null;
}

/**
 * O lançamento de caixa do pagamento.
 *
 * Aponta para o mecânico por ID e guarda a competência: é o que permite
 * saber, depois, qual mês aquele dinheiro quitou.
 */
export function lancamentoComissao({ tecnico, valor, competencia, data, companyId }) {
  return {
    company_id: companyId,
    date: data,
    type: 'debit',
    category: 'Comissões',
    description: `Comissão ${competencia} — ${tecnico?.name || 'mecânico'}`,
    amount: reais(centavos(valor)),
    reference_type: REFERENCIA_COMISSAO,
    reference_id: tecnico?.id || null,
    competencia,
  };
}
