// O relógio da oficina, para o que vai na nota fiscal.
//
// As rotas de NFS-e rodam na Vercel, cujo relógio é UTC. Com getDate() e
// getHours() do servidor, uma nota emitida às 21h30 de 30/09 em Cipó saía
// com dCompet 01/10 — competência de outubro para um serviço de setembro,
// ISS no mês errado — e com dhEmi em +00:00. Nos testes passava, porque
// eles rodam no fuso de quem os executa.
//
// Aqui a data é a do relógio da OFICINA, pelo estado dela, seja qual for o
// fuso do servidor. O Brasil não tem horário de verão desde 2019, mas o
// cálculo usa a tabela de fusos do sistema (Intl): se voltar, continua certo.

// Estados fora do horário de Brasília. Os demais usam America/Sao_Paulo.
// (O oeste do Amazonas é -05, mas o estado é um só no cadastro; Manaus
// cobre quase toda a população.)
const FUSO_POR_UF = {
  AC: 'America/Rio_Branco',
  AM: 'America/Manaus',
  RR: 'America/Boa_Vista',
  RO: 'America/Porto_Velho',
  MT: 'America/Cuiaba',
  MS: 'America/Campo_Grande',
};

export function fusoDaOficina(uf) {
  return FUSO_POR_UF[String(uf || '').trim().toUpperCase()] || 'America/Sao_Paulo';
}

const formatadores = new Map();
function partes(d, fuso) {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatadores.set(fuso, f);
  }
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return {
    ano: Number(p.year), mes: Number(p.month), dia: Number(p.day),
    hora: Number(p.hour), minuto: Number(p.minute), segundo: Number(p.second),
  };
}

// Minutos a somar ao UTC para chegar à hora local (Brasília: -180).
function deslocamento(d, fuso) {
  const l = partes(d, fuso);
  const comoUtc = Date.UTC(l.ano, l.mes - 1, l.dia, l.hora, l.minuto, l.segundo);
  return Math.round((comoUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

const p2 = (n) => String(n).padStart(2, '0');

/** "2026-09-30" — o dia do calendário da oficina. */
export function dataDaOficina(d = new Date(), uf) {
  const l = partes(d, fusoDaOficina(uf));
  return `${l.ano}-${p2(l.mes)}-${p2(l.dia)}`;
}

/** "2026-09-30T21:30:00-03:00" — a hora da oficina, com o fuso dela. */
export function dataHoraDaOficina(d = new Date(), uf) {
  const fuso = fusoDaOficina(uf);
  const l = partes(d, fuso);
  const off = deslocamento(d, fuso);
  const abs = Math.abs(off);
  return `${l.ano}-${p2(l.mes)}-${p2(l.dia)}T${p2(l.hora)}:${p2(l.minuto)}:${p2(l.segundo)}`
    + `${off >= 0 ? '+' : '-'}${p2(Math.floor(abs / 60))}:${p2(abs % 60)}`;
}

/** O instante em que começou o mês corrente no relógio da oficina. */
export function inicioDoMesDaOficina(d = new Date(), uf) {
  const fuso = fusoDaOficina(uf);
  const l = partes(d, fuso);
  const meiaNoiteComoUtc = Date.UTC(l.ano, l.mes - 1, 1);
  // O deslocamento é o da meia-noite do dia 1, não o de agora — difere se
  // houver mudança de horário no meio do mês. Duas passadas bastam.
  let t = meiaNoiteComoUtc - deslocamento(new Date(meiaNoiteComoUtc), fuso) * 60000;
  t = meiaNoiteComoUtc - deslocamento(new Date(t), fuso) * 60000;
  return new Date(t);
}
