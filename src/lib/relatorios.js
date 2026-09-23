// Indicadores gerenciais.
//
// São os números que o dono da oficina usa para decidir preço, compra e
// comissão. Um indicador errado aqui não dá erro em lugar nenhum — ele
// só leva a uma decisão ruim.

import { emAberto, estaVencido, estaQuitado } from './crediario';

const centavos = (v) => Math.round((Number(v) || 0) * 100);
const reais = (c) => Math.round(c) / 100;

/**
 * Custo das mercadorias vendidas.
 *
 * Usa o custo GRAVADO NO ITEM da venda — o que a peça custava quando foi
 * vendida. Cair no cadastro atual da peça faz a margem de um mês passado
 * MUDAR toda vez que chega uma compra nova, porque o cadastro guarda o
 * último custo. O mesmo relatório daria números diferentes a cada semana.
 *
 * Quando o item não guardou o custo (vendas antigas), cai para o cadastro
 * e avisa — melhor um número aproximado e sinalizado do que um exato e
 * falso.
 */
export function custoDasVendas(vendas, pecaPorId) {
  let comCustoNoItem = 0;
  let semCustoNoItem = 0;

  const total = (vendas || []).reduce((soma, venda) => {
    const itens = venda?.items || [];
    return soma + itens.reduce((s, it) => {
      if (!it) return s;
      const ehPeca = it.type === 'part' || it.part_id;
      if (!ehPeca) return s;

      const qtd = Number(it.quantity) || 0;
      if (qtd <= 0) return s;

      const custoNoItem = Number(it.cost_price);
      let unitario;
      if (Number.isFinite(custoNoItem) && custoNoItem > 0) {
        unitario = custoNoItem;
        comCustoNoItem += 1;
      } else {
        const peca = pecaPorId?.[it.part_id || it.id];
        unitario = Number(peca?.cost_price) || 0;
        semCustoNoItem += 1;
      }
      return s + centavos(unitario) * qtd;
    }, 0);
  }, 0);

  return {
    total: reais(total),
    comCustoNoItem,
    semCustoNoItem,
    // Quando parte do custo veio do cadastro atual, a margem é estimada.
    estimado: semCustoNoItem > 0,
  };
}

/**
 * Comissão dos mecânicos sobre a mão de obra.
 *
 * OS cancelada não gera comissão: o serviço não foi cobrado.
 */
export function comissoes(ordens, tecnicoPorId) {
  const porTecnico = new Map();

  for (const o of ordens || []) {
    if (!o?.mechanic_id) continue;
    if (o.status === 'cancelada') continue;

    const tecnico = tecnicoPorId?.[o.mechanic_id];
    const percentual = Number(tecnico?.commission_percent) || 0;
    if (percentual <= 0) continue;

    const maoDeObra = (o.service_items || [])
      .reduce((s, sv) => s + centavos(sv?.total_price), 0);
    if (maoDeObra <= 0) continue;

    const valor = Math.round(maoDeObra * percentual / 100);
    porTecnico.set(o.mechanic_id, (porTecnico.get(o.mechanic_id) || 0) + valor);
  }

  const detalhe = [...porTecnico.entries()].map(([id, c]) => ({
    tecnico_id: id,
    nome: tecnicoPorId?.[id]?.name || '—',
    valor: reais(c),
  })).sort((a, b) => b.valor - a.valor);

  return { total: reais(detalhe.reduce((s, d) => s + centavos(d.valor), 0)), detalhe };
}

/**
 * Inadimplência do crediário.
 *
 * O vencimento sai da DATA, não do status gravado: o status 'vencido' é
 * calculado em memória pelas telas e nunca chega ao banco, então quem
 * filtrava por ele encontrava SEMPRE zero — o indicador ficava parado em
 * 0% com qualquer carteira atrasada.
 *
 * A taxa é sobre o que está EM ABERTO, não sobre tudo o que já foi
 * vendido a prazo: dividir pelo histórico faz a taxa encolher sozinha a
 * cada venda nova, escondendo a piora.
 */
export function inadimplencia(titulos, hoje = new Date().toISOString().split('T')[0]) {
  const abertos = (titulos || []).filter(t => t && t.status !== 'cancelado' && !estaQuitado(t));

  const emAbertoC = abertos.reduce((s, t) => s + centavos(emAberto(t)), 0);
  const vencidos = abertos.filter(t => estaVencido(t, hoje));
  const vencidoC = vencidos.reduce((s, t) => s + centavos(emAberto(t)), 0);

  return {
    aReceber: reais(emAbertoC),
    vencido: reais(vencidoC),
    parcelasVencidas: vencidos.length,
    taxa: emAbertoC > 0 ? Math.round((vencidoC / emAbertoC) * 10000) / 100 : 0,
  };
}

/**
 * DRE simplificado do período.
 */
export function dre({ vendas, ordens, pecaPorId, tecnicoPorId }) {
  const receita = reais((vendas || []).reduce((s, v) => s + centavos(v?.total), 0));
  const cmv = custoDasVendas(vendas, pecaPorId);
  const com = comissoes(ordens, tecnicoPorId);

  const lucroBrutoC = centavos(receita) - centavos(cmv.total);
  const operacionalC = lucroBrutoC - centavos(com.total);

  return {
    receita,
    cmv: cmv.total,
    cmvEstimado: cmv.estimado,
    lucroBruto: reais(lucroBrutoC),
    margemBruta: centavos(receita) > 0
      ? Math.round((lucroBrutoC / centavos(receita)) * 10000) / 100
      : 0,
    comissoes: com.total,
    lucroOperacional: reais(operacionalC),
  };
}
