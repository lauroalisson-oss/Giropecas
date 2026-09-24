// O dia do calendário da oficina.
//
// Esta suíte só prova alguma coisa num fuso diferente de UTC — por isso
// o rodar.mjs executa tudo em America/Sao_Paulo além de UTC. Rodando só
// em UTC, "hoje em UTC" e "hoje na oficina" são o mesmo dia e qualquer
// conta de data passa, certa ou errada.

import { diaLocal, hoje, diaDoRegistro, somarDias, somarMeses } from '/home/user/Giropecas/src/lib/datas.js';
import { competenciaDe } from '/home/user/Giropecas/src/lib/comissoes.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const fuso = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
const noBrasil = fuso === 'America/Sao_Paulo';
console.log(`(fuso: ${fuso})`);

// O jeito antigo, para comparar.
const antigo = (d) => d.toISOString().split('T')[0];

console.log('--- 21h30 do ultimo dia do mes ---');
// 30/09 21:30 em Brasilia = 01/10 00:30 UTC.
const fechamento = new Date('2026-09-30T21:30:00-03:00');
ok(diaLocal(fechamento) === (noBrasil ? '2026-09-30' : '2026-10-01'),
  `o dia e o do relogio da oficina (deu ${diaLocal(fechamento)})`);
if (noBrasil) {
  // A prova de que o bug existia: o jeito antigo jogava a venda em outubro.
  ok(antigo(fechamento) === '2026-10-01', 'o jeito antigo dava 01/10 — receita de setembro no DRE de outubro');
  ok(diaLocal(fechamento) !== antigo(fechamento), 'e o novo discorda dele exatamente nessa hora');
}

console.log('--- created_date do banco ---');
// Timestamp UTC: tem de virar o dia LOCAL.
ok(diaDoRegistro('2026-10-01T00:30:00Z') === (noBrasil ? '2026-09-30' : '2026-10-01'),
  'venda das 21h30 e do dia 30 no Brasil');
ok(diaDoRegistro('2026-10-01T00:30:00+00:00') === diaDoRegistro('2026-10-01T00:30:00Z'),
  'formato +00:00 do Postgres da o mesmo');
// Coluna date pura NAO pode ser convertida: new Date('2026-10-01') e
// meia-noite UTC, que no Brasil e 30/09 as 21h.
ok(diaDoRegistro('2026-10-01') === '2026-10-01', 'coluna date passa direto, sem conversao');
ok(diaDoRegistro(null) === null, 'sem data');
ok(diaDoRegistro('lixo') === null, 'lixo vira nulo, nao "NaN-NaN-NaN"');

console.log('--- hoje ---');
ok(/^\d{4}-\d{2}-\d{2}$/.test(hoje()), 'formato YYYY-MM-DD');
ok(hoje() === diaLocal(new Date()), 'e o dia local de agora');

console.log('--- Somar dias ---');
ok(somarDias('2026-09-30', 1) === '2026-10-01', 'vira o mes');
ok(somarDias('2026-12-31', 1) === '2027-01-01', 'vira o ano');
ok(somarDias('2026-03-01', -1) === '2026-02-28', 'volta para fevereiro');
ok(somarDias('2028-03-01', -1) === '2028-02-29', 'ano bissexto');
ok(somarDias('2026-09-30', 0) === '2026-09-30', 'zero dias');
ok(somarDias('nada', 1) === null, 'data invalida');

console.log('--- Vencimento de parcela: dia 31 ---');
// setMonth cru: 31/01 + 1 mes = "31/02" = 03/03. A parcela de fevereiro
// sumia e o cliente recebia duas cobrancas em marco.
ok(somarMeses('2026-01-31', 1) === '2026-02-28', `31/01 + 1 mes = 28/02 (deu ${somarMeses('2026-01-31', 1)})`);
ok(somarMeses('2026-01-31', 2) === '2026-03-31', '31/01 + 2 meses = 31/03');
ok(somarMeses('2026-01-31', 3) === '2026-04-30', '31/01 + 3 meses = 30/04');
ok(somarMeses('2028-01-31', 1) === '2028-02-29', 'bissexto: 29/02');
ok(somarMeses('2026-08-31', 1) === '2026-09-30', '31/08 + 1 = 30/09');
ok(somarMeses('2026-11-15', 2) === '2027-01-15', 'vira o ano');
ok(somarMeses('2026-09-24', 1) === '2026-10-24', 'dia comum nao muda');

// A serie inteira: um vencimento por mes, nenhum mes pulado ou repetido.
const serie = [1, 2, 3, 4].map(i => somarMeses('2026-01-31', i).slice(0, 7));
ok(new Set(serie).size === 4, `4 parcelas em 4 meses diferentes (${serie.join(', ')})`);
ok(serie.join() === '2026-02,2026-03,2026-04,2026-05', 'fevereiro, marco, abril, maio — nessa ordem');

// O comportamento antigo, para registrar o que se corrigiu.
const velho = (i) => { const d = new Date(2026, 0, 31, 12); d.setMonth(d.getMonth() + i); return diaLocal(d).slice(0, 7); };
ok([1, 2].map(velho).join() === '2026-03,2026-03', 'o jeito antigo punha as parcelas 1 e 2 em marco');

console.log('--- Competencia da comissao ---');
// Codigo da rodada anterior. Passava em UTC e falhava no Brasil:
// new Date('2026-01-01') e 31/12 as 21h aqui.
ok(competenciaDe('2026-01-01') === '2026-01', `dia 1 fica no proprio mes (deu ${competenciaDe('2026-01-01')})`);
ok(competenciaDe('2026-10-01') === '2026-10', 'outubro fica em outubro');
ok(competenciaDe('2026-10-01T00:30:00Z') === (noBrasil ? '2026-09' : '2026-10'),
  'OS fechada as 21h30 de 30/09 e comissao de setembro');

console.log(f === 0 ? '\n✅ DATAS OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
