// Indicadores gerenciais.
//
// São os números que o dono da oficina usa para decidir preço, compra e
// comissão. Um indicador errado aqui não dá erro em lugar nenhum — ele
// só leva a uma decisão ruim.

import { emAberto, estaVencido, estaQuitado } from './crediario';
import { geraComissao } from './comissoes';
import { hoje as hojeLocal } from './datas';
import { vendaValida } from './caixa';

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
    // Só serviço concluído gera comissão. Antes bastava não estar
    // cancelada, o que punha no DRE a comissão de OS ainda na bancada —
    // e divergia do painel de Técnicos, que já exigia a conclusão.
    if (!geraComissao(o)) continue;

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
export function inadimplencia(titulos, hoje = hojeLocal()) {
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
  // Venda cancelada teve o dinheiro devolvido ao cliente: não é receita, e
  // a peça voltou ao estoque, então também não é custo.
  const validas = (vendas || []).filter(vendaValida);
  const receita = reais(validas.reduce((s, v) => s + centavos(v?.total), 0));
  const cmv = custoDasVendas(validas, pecaPorId);
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

// Os baldes do painel "vendas por forma de pagamento".
const BALDE = {
  dinheiro: 'dinheiro', pix: 'pix', cartao_debito: 'debito',
  cartao_credito: 'credito', crediario: 'crediario',
};

/**
 * Como o valor de UMA venda se divide entre as formas de pagamento.
 *
 * O painel jogava a venda inteira no método principal, e o que não
 * reconhecia — venda 'misto', cartão + dinheiro — ia para "dinheiro" como
 * fallback. Uma venda de R$1.000 com R$600 no crédito aparecia como R$1.000
 * em espécie, e o lojista procurava na gaveta um dinheiro que foi para a
 * maquininha.
 *
 * Troco não é venda: o dinheiro entregue a mais é limitado ao que faltava.
 * No crediário, a entrada vai para dinheiro e o financiado para crediário.
 * O que não dá para atribuir fica em "outros" — à vista, não escondido.
 */
export function vendaPorMeio(venda) {
  const baldes = { dinheiro: 0, debito: 0, credito: 0, pix: 0, crediario: 0, outros: 0 };
  const totalC = centavos(venda?.total);
  if (totalC <= 0) return Object.fromEntries(Object.keys(baldes).map(k => [k, 0]));

  const det = venda.payment_details || {};
  const pags = (det.payments || []).filter(Boolean);
  let restante = totalC;
  const por = (balde, c) => { const v = Math.max(0, Math.min(c, restante)); baldes[balde] += v; restante -= v; };

  if (!pags.length) {
    por(BALDE[venda.payment_method] || 'outros', totalC);
  } else {
    const temCred = pags.some(p => p.method === 'crediario');
    const naoCred = pags.filter(p => p.method !== 'crediario');
    // Primeiro o que tem valor exato; dinheiro por último, porque é ele que
    // leva o troco.
    for (const p of naoCred.filter(p => p.method !== 'dinheiro')) por(BALDE[p.method] || 'outros', centavos(p.amount));
    for (const p of naoCred.filter(p => p.method === 'dinheiro')) por('dinheiro', centavos(p.amount));
    if (temCred) {
      por('dinheiro', centavos(det.downPayment));
      por('crediario', restante);
    }
    por('outros', restante);
  }
  return Object.fromEntries(Object.entries(baldes).map(([k, c]) => [k, reais(c)]));
}

/**
 * O resultado de um conjunto de vendas — o "lucro de hoje" do painel.
 *
 * O painel financeiro tinha contas próprias, e cada uma divergia do DRE:
 *
 *   - custo das peças pelo CADASTRO ATUAL antes do custo gravado no item
 *     (`part.cost_price ?? item.cost_price`): a margem de ontem mudava
 *     quando chegava compra nova — o mesmo bug já corrigido no DRE;
 *   - comissão por UMA taxa única digitada no próprio painel e guardada no
 *     navegador, em vez do percentual de cada mecânico: o celular do dono e
 *     o computador do balcão mostravam lucros diferentes para o mesmo dia;
 *   - somas em ponto flutuante.
 *
 * Agora custo e comissão saem das mesmas funções do DRE.
 *
 * @param {Array} vendas        vendas do período (as canceladas são ignoradas)
 * @param {Array} ordens        OS — as ligadas a estas vendas geram comissão
 */
export function resumoDeVendas({ vendas = [], ordens = [], pecaPorId = {}, tecnicoPorId = {} }) {
  const validas = (vendas || []).filter(vendaValida);
  const faturamentoC = validas.reduce((s, v) => s + centavos(v.total), 0);
  const taxasC = validas.reduce((s, v) => s + centavos(v.payment_details?.totalFees), 0);
  const cmv = custoDasVendas(validas, pecaPorId);

  const ids = new Set(validas.map(v => v.work_order_id).filter(Boolean));
  const com = comissoes((ordens || []).filter(o => o && ids.has(o.id)), tecnicoPorId);

  const porMeio = { dinheiro: 0, debito: 0, credito: 0, pix: 0, crediario: 0, outros: 0 };
  for (const v of validas) {
    for (const [k, val] of Object.entries(vendaPorMeio(v))) porMeio[k] = reais(centavos(porMeio[k]) + centavos(val));
  }

  // Lucro pode ser negativo, e aparece negativo. O gráfico tinha
  // Math.max(0, lucro): dia de prejuízo virava dia "zerado".
  const lucroC = faturamentoC - taxasC - centavos(cmv.total) - centavos(com.total);

  return {
    faturamento: reais(faturamentoC),
    taxas: reais(taxasC),
    cmv: cmv.total,
    cmvEstimado: cmv.estimado,
    comissoes: com.total,
    lucro: reais(lucroC),
    porMeio,
  };
}
