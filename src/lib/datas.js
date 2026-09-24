// O dia do calendário DA OFICINA.
//
// O sistema inteiro usava `new Date().toISOString().split('T')[0]` para
// dizer "hoje" — 27 lugares. Só que toISOString é UTC, e o Brasil está
// três horas atrás. A partir das 21h, "hoje" já era amanhã:
//
//   * a venda fechada às 21h30 de 30/09 era lançada no caixa em 01/10 —
//     receita de setembro caindo no DRE de outubro, justamente no
//     fechamento do mês;
//   * a parcela que vence hoje aparecia como VENCIDA a partir das 21h;
//   * "Vendas hoje" zerava às 21h, e o que se vendia depois ia para o
//     dia seguinte no gráfico da semana;
//   * a Agenda pulava para amanhã, e o botão "Hoje" também.
//
// Aqui "dia" é sempre o dia local, no formato YYYY-MM-DD — o mesmo formato
// das colunas date do banco.

const pad = (n) => String(n).padStart(2, '0');

// O dia local de uma data. Sem argumento, hoje.
export function diaLocal(d = new Date()) {
  const data = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(data.getTime())) return null;
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`;
}

export function hoje() {
  return diaLocal(new Date());
}

// O dia local em que um registro foi criado.
//
// created_date vem do banco como timestamp UTC ("2026-10-01T00:30:00Z").
// Comparar com `startsWith(hoje)` olha o dia em Londres. Uma venda às
// 21h30 aqui tem created_date do dia seguinte.
//
// Coluna date pura ("2026-09-30", sem hora) passa direto: ela já é o dia
// do calendário e não pode ser convertida — new Date("2026-09-30") seria
// meia-noite UTC, que no Brasil ainda é 29/09.
export function diaDoRegistro(valor) {
  if (!valor) return null;
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  return diaLocal(new Date(valor));
}

// Soma dias a um dia do calendário. Ancora ao meio-dia para que nenhuma
// virada de horário de verão, em nenhum fuso, empurre para o dia vizinho.
export function somarDias(dia, n) {
  const base = new Date(`${dia}T12:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + n);
  return diaLocal(base);
}

// Soma meses a uma data, para vencimento de parcela. Dia 31 em mês de 30
// dias cai no último dia do mês, em vez de pular para o mês seguinte
// (31/01 + 1 mês = 28/02, não 03/03).
export function somarMeses(dia, n) {
  const [a, m, d] = String(dia).split('-').map(Number);
  if (!a || !m || !d) return null;
  const alvo = new Date(a, m - 1 + n, 1, 12);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimo));
  return diaLocal(alvo);
}
