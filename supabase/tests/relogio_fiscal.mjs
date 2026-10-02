// Data e hora da nota fiscal no relógio da OFICINA, não no do servidor.
//
// As rotas de NFS-e rodam na Vercel, em UTC. A DPS usava getDate() do
// servidor: nota emitida às 21h30 de 30/09 em Cipó saía com competência
// 01/10 — ISS de setembro declarado em outubro. Os testes passavam porque
// cada um roda no fuso de quem executa. Aqui o resultado tem de ser o
// MESMO nos dois fusos em que o rodar.mjs executa (UTC e São Paulo).

import {
  fusoDaOficina, dataDaOficina, dataHoraDaOficina, inicioDoMesDaOficina,
} from '../../shared/relogio-fiscal.js';
import { montarDps } from '../../api/_lib/nfse-dps.js';
import { montarCancelamento } from '../../shared/nfse-evento.js';
import { inicioDoMes } from '../../api/_lib/nfse-regras.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };
const tag = (xml, n) => { const m = xml.match(new RegExp(`<${n}>([^<]*)</${n}>`)); return m ? m[1] : null; };

console.log(`(fuso do processo: ${process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone})`);

// 30/09 21:30 em Cipó = 01/10 00:30 UTC.
const NOITE = new Date('2026-10-01T00:30:00Z');

console.log('--- Fuso pelo estado ---');
ok(fusoDaOficina('BA') === 'America/Sao_Paulo', 'BA: horario de Brasilia');
ok(fusoDaOficina('ac') === 'America/Rio_Branco', 'AC: Rio Branco (minuscula tambem)');
ok(fusoDaOficina('MT') === 'America/Cuiaba', 'MT: Cuiaba');
ok(fusoDaOficina(null) === 'America/Sao_Paulo' && fusoDaOficina('') === 'America/Sao_Paulo',
  'sem estado: Brasilia');

console.log('--- Dia e hora ---');
ok(dataDaOficina(NOITE, 'BA') === '2026-09-30', `21h30 de 30/09 e dia 30 (deu ${dataDaOficina(NOITE, 'BA')})`);
ok(dataHoraDaOficina(NOITE, 'BA') === '2026-09-30T21:30:00-03:00',
  `com o fuso de Brasilia (deu ${dataHoraDaOficina(NOITE, 'BA')})`);
ok(dataHoraDaOficina(NOITE, 'AC') === '2026-09-30T19:30:00-05:00', 'Acre: -05:00');
ok(dataHoraDaOficina(NOITE, 'MS') === '2026-09-30T20:30:00-04:00', 'Mato Grosso do Sul: -04:00');
ok(dataDaOficina(new Date('2026-10-01T03:00:00Z'), 'BA') === '2026-10-01', 'meia-noite em ponto ja e o dia 1');
ok(dataDaOficina(new Date('2026-10-01T02:59:59Z'), 'BA') === '2026-09-30', 'um segundo antes ainda e dia 30');
// O instante descrito tem de ser o mesmo: so a forma de escrever muda.
ok(new Date(dataHoraDaOficina(NOITE, 'BA')).getTime() === NOITE.getTime(), 'dhEmi aponta o mesmo instante');
ok(new Date(dataHoraDaOficina(NOITE, 'AC')).getTime() === NOITE.getTime(), 'em qualquer fuso');
ok(dataHoraDaOficina(new Date('2026-10-01T00:30:00.987Z'), 'BA') === '2026-09-30T21:30:00-03:00',
  'milissegundos nao viram minuto de deslocamento');

console.log('--- A DPS ---');
const empresa = {
  cnpj: '12.345.678/0001-99', im: '12345', city_ibge_code: '2907905', state: 'BA',
  tax_regime: 'simples_nacional', iss_rate: 5,
};
const servicos = [{ description: 'Troca de oleo', total_price: 150, servico: { service_code_lc116: '14.01', iss_rate: 5 } }];
const dps = montarDps({ empresa, servicos, numero: 1, agora: NOITE });
ok(tag(dps.xml, 'dCompet') === '2026-09-30', `competencia de setembro (deu ${tag(dps.xml, 'dCompet')})`);
ok(tag(dps.xml, 'dhEmi') === '2026-09-30T21:30:00-03:00', `dhEmi na hora da oficina (deu ${tag(dps.xml, 'dhEmi')})`);
// O Sefin recusa competência posterior à emissão: as duas datas têm de
// ser do mesmo relógio.
ok(tag(dps.xml, 'dhEmi').startsWith(tag(dps.xml, 'dCompet')), 'dCompet e o dia de dhEmi');
const semEstado = montarDps({ empresa: { ...empresa, state: undefined }, servicos, numero: 2, agora: NOITE });
ok(tag(semEstado.xml, 'dCompet') === '2026-09-30', 'oficina sem estado cadastrado: Brasilia');

console.log('--- O cancelamento ---');
const canc = montarCancelamento({
  chaveAcesso: '2'.repeat(50), cnpjAutor: '12345678000199', motivo: 1,
  justificativa: 'Valor do servico digitado errado', agora: NOITE, uf: 'BA',
});
ok(tag(canc.xml, 'dhEvento') === '2026-09-30T21:30:00-03:00', `dhEvento na hora da oficina (deu ${tag(canc.xml, 'dhEvento')})`);

console.log('--- Limite de notas: onde comeca o mes ---');
// Antes: setHours(0) do servidor = 21h do ultimo dia do mes anterior.
// Nota das 21h as 24h do dia 30 contava no limite de outubro.
const inicio = inicioDoMesDaOficina(NOITE, 'BA');
ok(inicio.toISOString() === '2026-09-01T03:00:00.000Z', `21h30 de 30/09: mes comecou 01/09 00h de Brasilia (deu ${inicio.toISOString()})`);
ok(inicioDoMes(new Date('2026-10-01T03:00:00Z'), 'BA').toISOString() === '2026-10-01T03:00:00.000Z',
  'meia-noite de 01/10: o mes ja e outubro');
ok(inicioDoMesDaOficina(new Date('2026-01-15T12:00:00Z'), 'AC').toISOString() === '2026-01-01T05:00:00.000Z',
  'Acre: 01/01 00h = 05h UTC');
ok(inicioDoMesDaOficina(new Date('2027-01-01T01:00:00Z'), 'BA').toISOString() === '2026-12-01T03:00:00.000Z',
  'virada do ano: 31/12 22h ainda e dezembro');

console.log(f === 0 ? '\n✅ RELOGIO FISCAL OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
