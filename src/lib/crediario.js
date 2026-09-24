// Crediário: o que pode e o que não pode ser feito com um título.
//
// Dinheiro que entra vira lançamento no caixa, e lançamento errado não se
// desfaz sozinho — some no meio do relatório do mês. Por isso as
// conferências ficam aqui, separadas da tela, onde dá para olhar caso a
// caso.

import { hoje as hojeLocal } from './datas';

const dinheiro = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Comparações de dinheiro são feitas em CENTAVOS, como número inteiro.
// Comparar reais em ponto flutuante dá resultado por acaso: 0.1 + 0.2 não
// é 0.3, e "um centavo de folga" vira 0.010000000000005.
const centavos = (v) => Math.round((Number(v) || 0) * 100);

// Um centavo de diferença aparece ao dividir um total em parcelas
// (100 / 3); não é dívida de verdade.
const FOLGA = 1; // centavo

export function emAberto(titulo) {
  const total = dinheiro(titulo?.total_amount);
  const pago = dinheiro(titulo?.paid_amount);
  return dinheiro(total - pago);
}

export const estaQuitado = (titulo) => centavos(emAberto(titulo)) <= FOLGA;

// Título vencido: sai da DATA, não do status gravado.
//
// O status 'vencido' é calculado em memória pelas telas de Crediário e
// Contas a Pagar e NUNCA é gravado no banco. Quem lê o status direto do
// banco — como o relatório gerencial fazia — encontra sempre 'a_vencer'
// e conclui que não há inadimplência nenhuma.
export function estaVencido(titulo, hoje = hojeLocal()) {
  if (!titulo?.due_date) return false;
  if (titulo.status === 'cancelado') return false;
  if (estaQuitado(titulo)) return false;
  return String(titulo.due_date) < hoje;
}

/**
 * Confere um recebimento antes de gravar.
 *
 * @returns {null} quando pode receber, ou { erro } com o motivo.
 */
export function validarPagamento({ titulo, valor }) {
  if (!titulo) return { erro: 'Título não encontrado.' };

  const v = dinheiro(valor);
  if (!(v > 0)) return { erro: 'Informe um valor maior que zero.' };

  if (titulo.status === 'cancelado') {
    return { erro: 'Este título foi cancelado.' };
  }

  // Sem isto, clicar duas vezes em "receber" lançava a entrada de novo e
  // inflava o faturamento do mês.
  if (estaQuitado(titulo)) {
    return { erro: 'Este título já está quitado.' };
  }

  const falta = emAberto(titulo);
  if (centavos(v) - centavos(falta) > FOLGA) {
    return {
      erro: `Valor acima do que falta neste título (${falta.toFixed(2)}). `
        + 'Receba até esse valor; o troco não é registrado aqui.',
      maximo: falta,
    };
  }

  return null;
}

// Como fica o título depois de receber `valor`.
export function aplicarPagamento({ titulo, valor, data }) {
  const pago = dinheiro(dinheiro(titulo?.paid_amount) + dinheiro(valor));
  const total = dinheiro(titulo?.total_amount);
  const resta = dinheiro(Math.max(0, total - pago));

  return {
    paid_amount: pago,
    remaining_amount: resta,
    status: centavos(resta) <= FOLGA ? 'pago' : 'pago_parcial',
    payment_date: data,
  };
}

/**
 * Resumo do crediário de uma venda — para avisar antes de excluí-la.
 *
 * Apagar títulos com pagamento em andamento apaga a dívida: o cliente
 * deve e o sistema esquece. O lojista precisa ver isso antes de
 * confirmar.
 */
export function resumoCrediario(titulos) {
  const lista = (titulos || []).filter(Boolean);

  const total = dinheiro(lista.reduce((s, t) => s + dinheiro(t.total_amount), 0));
  const recebido = dinheiro(lista.reduce((s, t) => s + dinheiro(t.paid_amount), 0));

  return {
    titulos: lista.length,
    total,
    recebido,
    aReceber: dinheiro(total - recebido),
    quitados: lista.filter(estaQuitado).length,
    comPagamento: lista.filter(t => dinheiro(t.paid_amount) > 0).length,
  };
}
