// As rotas de API sobem?
//
// Um erro de import numa rota de /api não aparece em lugar nenhum até
// alguém chamá-la — e a primeira chamada de nfsePreparar seria a
// primeira emissão de nota da oficina, com o cliente esperando.
//
// Este teste carrega cada rota e a exercita com um pedido de mentira,
// sem rede e sem banco. Não prova que a emissão funciona; prova que o
// caminho até ela existe: módulos resolvem, JSON carrega, o handler
// responde em vez de estourar.

const ROTAS = [
  'nfsePreparar', 'nfseRegistrar', 'nfseCancelar', 'provisionarEmpresa',
];

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };

// Resposta de mentira, no formato que a Vercel entrega ao handler.
function resposta() {
  const r = { statusCode: null, corpo: null };
  r.status = (s) => { r.statusCode = s; return r; };
  r.json = (c) => { r.corpo = c; return r; };
  return r;
}

const pedido = (extra = {}) => ({ method: 'POST', headers: {}, body: {}, ...extra });

console.log('--- Cada rota carrega ---');
const handlers = {};
for (const nome of ROTAS) {
  try {
    const mod = await import(`/home/user/Giropecas/api/${nome}.js`);
    handlers[nome] = mod.default;
    ok(typeof mod.default === 'function', `${nome}: carrega e exporta o handler`);
  } catch (e) {
    ok(false, `${nome}: NAO CARREGA — ${e.message}`);
  }
}

console.log('--- Metodo errado e recusado sem tocar em nada ---');
for (const nome of ROTAS) {
  if (!handlers[nome]) continue;
  const res = resposta();
  await handlers[nome](pedido({ method: 'GET' }), res);
  ok(res.statusCode === 405, `${nome}: GET devolve 405`);
}

console.log('--- Servidor sem configuracao ---');
// Sem as variaveis do Supabase, a rota nao pode nem tentar. O erro tem
// de dizer isso — uma falha generica mandaria o lojista procurar no
// lugar errado.
for (const nome of ROTAS) {
  if (!handlers[nome]) continue;
  const res = resposta();
  await handlers[nome](pedido(), res);
  ok(res.statusCode === 500, `${nome}: sem configuracao devolve 500 (deu ${res.statusCode})`);
  ok(/configura/i.test(res.corpo?.error || ''),
    `${nome}: e a mensagem aponta a configuracao`);
}

console.log('--- Com configuracao, mas sem token: 401 ---');
// Aqui e o que acontece em producao. Sem preencher o ambiente, TODAS as
// rotas davam 500 por falta de configuracao e o teste nunca chegava a
// conferir a autenticacao — a asserção passava sem provar nada.
process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
process.env.SUPABASE_ANON_KEY = 'chave-de-mentira';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-mentira';

for (const nome of ROTAS) {
  if (!handlers[nome]) continue;
  const res = resposta();
  await handlers[nome](pedido(), res);
  ok(res.statusCode === 401, `${nome}: sem token devolve 401 (deu ${res.statusCode})`);
  ok(typeof res.corpo?.error === 'string' && res.corpo.error.length > 0,
    `${nome}: devolve mensagem, nao corpo vazio`);
  ok(!/undefined|null|\[object/.test(res.corpo?.error || ''),
    `${nome}: a mensagem e legivel, sem lixo de programacao`);
}

console.log('--- Token invalido nao passa por token ausente ---');
for (const nome of ROTAS) {
  if (!handlers[nome]) continue;
  const res = resposta();
  await handlers[nome](pedido({ headers: { authorization: 'Bearer nao-e-um-token' } }), res);
  ok(res.statusCode === 401, `${nome}: token invalido nao autoriza (deu ${res.statusCode})`);
}

console.log('--- A tabela de codigos chega junto com a rota ---');
// nfsePreparar importa nfse-dps, que importa shared/ctribnac.json. Se o
// JSON nao subir junto no pacote da funcao, a rota carrega e so quebra
// na hora de montar a nota.
const dps = await import('/home/user/Giropecas/api/_lib/nfse-dps.js');
ok(typeof dps.montarDps === 'function', 'nfse-dps carrega');
ok(dps.codigoTributacaoNacional('14.01') === '140101',
  'a tabela de 338 codigos esta acessivel a partir da rota');
ok(dps.descricaoCTribNac('140101')?.length > 10, 'e traz as descricoes');

const evento = await import('/home/user/Giropecas/shared/nfse-evento.js');
ok(typeof evento.montarCancelamento === 'function', 'shared/nfse-evento carrega a partir de api/');

console.log('--- A rota monta uma nota de ponta a ponta ---');
// Sem rede: so o pedaco que nao depende do banco.
const xml = dps.montarDps({
  empresa: { cnpj: '12345678000199', im: '123', city_ibge_code: '2907905',
             tax_regime: 'simples_nacional', iss_rate: 5 },
  servicos: [{ description: 'Troca de oleo', hours: 1, total_price: 150,
               servico: { service_code_lc116: '14.01', iss_rate: 5 } }],
  numero: 1, serie: '1',
});
ok(xml.xml.includes('<cTribNac>140101</cTribNac>'),
  'o XML sai com o codigo certo usando so o que a rota tem em maos');

console.log(f === 0 ? '\n✅ ROTAS DE API OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
