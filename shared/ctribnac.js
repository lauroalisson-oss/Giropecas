// Código de tributação nacional (cTribNac) — tabela oficial, 338 códigos.
//
// Fica em shared/ porque duas pontas precisam concordar: o cadastro do
// serviço (que avisa o lojista na hora de digitar) e a montagem da DPS
// (que recusa o que o Sefin recusaria). Duas implementações acabariam
// divergindo, e a divergência só apareceria na hora de emitir.
//
// Formato: item (2) + subitem (2) + desdobro nacional (2).
//
// O desdobro NÃO segue regra. Uma versão anterior completava com '00'
// (14.01 -> 140100), e isso dava código inexistente nos 338 casos — nenhuma
// nota seria aceita. Por isso aqui é consulta, nunca dedução.

import TABELA from './ctribnac.json' with { type: 'json' };

export { TABELA as TABELA_CTRIBNAC };

const dig = (v) => String(v ?? '').replace(/\D/g, '');

/**
 * Resolve o que o lojista digitou, sem lançar exceção.
 *
 * @returns {{
 *   ok: boolean, codigo?: string, descricao?: string,
 *   motivo?: 'vazio'|'inexistente'|'ambiguo'|'desconhecido',
 *   opcoes?: Array<{codigo: string, descricao: string}>,
 *   mensagem?: string,
 * }}
 */
export function resolverCTribNac(entrada) {
  const d = dig(entrada);

  if (!d) {
    return { ok: false, motivo: 'vazio', mensagem: 'Informe o item da lista de serviços (ex.: 14.01).' };
  }

  // Código completo de 6 dígitos.
  if (d.length === 6) {
    if (!TABELA[d]) {
      return {
        ok: false,
        motivo: 'inexistente',
        mensagem: `O código ${d} não existe na tabela oficial de tributação nacional.`,
      };
    }
    return { ok: true, codigo: d, descricao: TABELA[d] };
  }

  // Item da LC 116 (ex.: "14.01"): procura os desdobros existentes.
  if (d.length === 4) {
    const desdobros = Object.keys(TABELA).filter(k => k.startsWith(d));

    if (desdobros.length === 1) {
      return { ok: true, codigo: desdobros[0], descricao: TABELA[desdobros[0]] };
    }
    if (desdobros.length > 1) {
      return {
        ok: false,
        motivo: 'ambiguo',
        opcoes: desdobros.map(c => ({ codigo: c, descricao: TABELA[c] })),
        mensagem: `O item ${entrada} tem ${desdobros.length} códigos nacionais. `
          + 'Escolha o código de 6 dígitos que corresponde ao serviço.',
      };
    }
  }

  return {
    ok: false,
    motivo: 'desconhecido',
    mensagem: `Não foi possível determinar o código nacional a partir de "${entrada}". `
      + 'Informe o código de 6 dígitos (ex.: 140101 para conserto de veículos).',
  };
}

// Mesma resolução, lançando — é o que a montagem da DPS precisa, porque
// ali não há tela para mostrar aviso: ou sai o código certo, ou não sai nota.
export function codigoTributacaoNacional(itemLc116) {
  const r = resolverCTribNac(itemLc116);
  if (!r.ok) {
    throw new Error(r.motivo === 'ambiguo'
      ? `${r.mensagem} Opções: ${r.opcoes.map(o => o.codigo).join(', ')}.`
      : r.mensagem);
  }
  return r.codigo;
}

export function descricaoCTribNac(codigo) {
  return TABELA[dig(codigo)] || null;
}

// Desdobros de um item da LC 116, para a tela oferecer a escolha.
export function desdobrosDoItem(itemLc116) {
  const d = dig(itemLc116).slice(0, 4);
  if (d.length !== 4) return [];
  return Object.keys(TABELA)
    .filter(k => k.startsWith(d))
    .map(c => ({ codigo: c, descricao: TABELA[c] }));
}
