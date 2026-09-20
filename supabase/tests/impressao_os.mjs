// O que sai impresso na OS entregue ao cliente.
//
// Duas coisas: os avisos de próxima revisão (o cliente precisa saber
// quando voltar) e o escape do HTML — tudo ali é digitado na oficina e
// entra numa string de HTML.

import { revisoesDaOrdem } from '/home/user/Giropecas/src/lib/crm.js';
import { buildPrintHtml } from '/home/user/Giropecas/src/components/PrintReceipt.js';

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

const oleo = { id: 's1', name: 'Troca de óleo', interval_months: 6, interval_km: 5000 };
const freio = { id: 's2', name: 'Revisão de freios', interval_months: 12, interval_km: null };
const lavagem = { id: 's3', name: 'Lavagem' }; // não se repete
const porId = { s1: oleo, s2: freio, s3: lavagem };

const ordem = (extra) => ({
  closed_at: '2026-09-20T10:00:00',
  vehicle_km: 14000,
  service_items: [{ service_id: 's1', description: 'Troca de óleo' }],
  ...extra,
});

console.log('--- Caso da moto Biz 125 (6 meses ou 5.000 km) ---');
const r = revisoesDaOrdem({ ordem: ordem(), servicosPorId: porId });
ok(r.length === 1, 'um aviso para um serviço');
ok(/Troca de óleo/.test(r[0]), 'diz qual serviço');
ok(/20\/03\/2027/.test(r[0]), `soma 6 meses a partir do atendimento (${r[0]})`);
ok(/19\.000 km/.test(r[0]), 'soma 5.000 km ao km do atendimento');

console.log('--- Serviços sem intervalo ---');
ok(revisoesDaOrdem({ ordem: ordem({ service_items: [{ service_id: 's3' }] }), servicosPorId: porId }).length === 0,
  'serviço que nao se repete nao gera aviso');
ok(revisoesDaOrdem({ ordem: ordem({ service_items: [{ service_id: 'nao-existe' }] }), servicosPorId: porId }).length === 0,
  'serviço fora do cadastro nao quebra nem inventa aviso');

console.log('--- Só tempo, sem km ---');
const soTempo = revisoesDaOrdem({
  ordem: ordem({ service_items: [{ service_id: 's2' }] }), servicosPorId: porId,
});
ok(soTempo.length === 1 && /20\/09\/2027/.test(soTempo[0]), 'serviço só por tempo avisa a data');
ok(!/km/.test(soTempo[0]), 'nao inventa km para serviço que so tem prazo');

console.log('--- Veículo sem km registrado ---');
// Number(null) e 0: sem cuidado, a moto ganharia "proxima aos 5.000 km"
// sem nunca ter tido km anotado.
const semKm = revisoesDaOrdem({ ordem: ordem({ vehicle_km: null }), servicosPorId: porId });
ok(semKm.length === 1, 'ainda avisa pelo tempo');
ok(!/km/.test(semKm[0]), `sem km no veiculo nao imprime km (${semKm[0]})`);
const km0 = revisoesDaOrdem({ ordem: ordem({ vehicle_km: 0 }), servicosPorId: porId });
ok(/5\.000 km/.test(km0[0]), 'km zero de verdade (moto nova) conta como zero');

console.log('--- Varios serviços na mesma OS ---');
const varios = revisoesDaOrdem({
  ordem: ordem({ service_items: [{ service_id: 's1' }, { service_id: 's2' }, { service_id: 's3' }] }),
  servicosPorId: porId,
});
ok(varios.length === 2, `dois avisos, a lavagem fica de fora (deu ${varios.length})`);

// O mesmo serviço lançado duas vezes na OS nao pode imprimir duas linhas.
const repetido = revisoesDaOrdem({
  ordem: ordem({ service_items: [{ service_id: 's1' }, { service_id: 's1' }] }),
  servicosPorId: porId,
});
ok(repetido.length === 1, 'serviço repetido na OS imprime uma vez so');

console.log('--- Qual data manda ---');
// A conta parte da data do atendimento, nao de hoje: o papel entregue
// ao cliente nao pode mudar depois.
const antiga = revisoesDaOrdem({
  ordem: ordem({ closed_at: null, opened_at: '2026-01-10T09:00:00' }), servicosPorId: porId,
});
ok(/10\/07\/2026/.test(antiga[0]), `usa opened_at quando nao ha closed_at (${antiga[0]})`);
const soCriacao = revisoesDaOrdem({
  ordem: ordem({ closed_at: null, opened_at: null, created_date: '2026-02-01T09:00:00' }), servicosPorId: porId,
});
ok(/01\/08\/2026/.test(soCriacao[0]), 'cai para created_date');
ok(revisoesDaOrdem({ ordem: ordem({ closed_at: null, opened_at: null, created_date: null }), servicosPorId: porId }).length === 0,
  'OS sem data nenhuma nao gera aviso');

console.log('--- Entradas estranhas ---');
ok(revisoesDaOrdem({ ordem: null, servicosPorId: porId }).length === 0, 'ordem nula');
ok(revisoesDaOrdem({ ordem: ordem({ service_items: null }), servicosPorId: porId }).length === 0, 'service_items nulo');
ok(revisoesDaOrdem({ ordem: ordem() }).length === 0, 'sem catalogo de serviços nao inventa');
ok(revisoesDaOrdem({ ordem: ordem({ service_items: [null] }), servicosPorId: porId }).length === 0, 'item nulo na lista');

console.log('--- Os avisos saem no papel ---');
const empresa = { name: 'RR Motopecas', cnpj: '12.345.678/0001-99' };
const docOS = { ...ordem(), order_number: '101', total: 150, parts_total: 0, services_total: 150 };
const avisos = revisoesDaOrdem({ ordem: docOS, servicosPorId: porId });

for (const formato of ['a4', 'cupom']) {
  const html = buildPrintHtml({ type: 'os', doc: docOS, company: empresa, customer: null, revisoes: avisos, format: formato });
  ok(/PR[ÓO]XIMAS? REVIS/i.test(html), `${formato}: tem o bloco de proximas revisoes`);
  ok(html.includes('19.000 km'), `${formato}: imprime o km da proxima revisao`);
  ok(html.includes('20/03/2027'), `${formato}: imprime a data da proxima revisao`);
}

// Venda de balcao nao tem revisao.
const pdv = buildPrintHtml({ type: 'pdv', doc: { id: 'v1', items: [], total: 50 }, company: empresa, customer: null, revisoes: avisos, format: 'a4' });
ok(!/PR[ÓO]XIMAS REVIS/i.test(pdv), 'venda de balcao nao imprime revisao');

// OS sem servico repetitivo nao ganha um bloco vazio.
const semAviso = buildPrintHtml({ type: 'os', doc: docOS, company: empresa, customer: null, revisoes: [], format: 'a4' });
ok(!/PR[ÓO]XIMAS REVIS/i.test(semAviso), 'sem avisos, o bloco nao aparece');

console.log('--- Escape do HTML (texto digitado na oficina) ---');
// O documento e montado como string de HTML e escrito numa janela que
// herda a origem do sistema. Um nome com "<script>" nao pode virar codigo.
const ataque = '<script>window.top.roubou=1<\/script>';
const perigoso = buildPrintHtml({
  type: 'os',
  doc: { ...docOS, complaint: ataque, diagnosis: '5 < 10 & "aspas"',
         service_items: [{ service_id: 's1', description: ataque }],
         vehicle: { brand: ataque, plate: 'ABC-1234' } },
  company: { name: ataque, cnpj: '1' },
  customer: { name: ataque, tax_id: '1', phone: '1', address: ataque },
  technician: { name: ataque },
  revisoes: ['Troca de óleo <b>ja</b>'],
  format: 'a4',
});
ok(!perigoso.includes('<script>window.top'), 'tag do nome do cliente nao vira script');
ok(perigoso.includes('&lt;script&gt;'), 'a tag aparece escapada, como texto');
ok(perigoso.includes('&amp;'), 'o & do diagnostico e escapado');
ok(!/<b>ja<\/b>/.test(perigoso), 'nem o texto do aviso de revisao escapa do escape');

const perigosoCupom = buildPrintHtml({
  type: 'os',
  doc: { ...docOS, service_items: [{ service_id: 's1', description: ataque }] },
  company: { name: ataque }, customer: { name: ataque }, revisoes: [ataque], format: 'cupom',
});
ok(!perigosoCupom.includes('<script>window.top'), 'cupom tambem escapa');

// So o script proprio da impressao pode existir no documento.
const scripts = (perigoso.match(/<script/g) || []).length;
ok(scripts === 1, `so um <script> no documento, o da impressao (achou ${scripts})`);

console.log(f === 0 ? '\n✅ REVISOES NA OS OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
