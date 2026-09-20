// A ponte desktop: modo de abertura e, principalmente, QUEM pode pedir
// uma emissão.
//
// A janela do aplicativo carrega uma página da internet e tem, ao mesmo
// tempo, acesso ao certificado da oficina. Se o pino de origem falhar,
// qualquer página aberta ali dentro passa a poder assinar em nome da
// oficina. É o teste mais importante deste módulo.

const fs = require('fs'), path = require('path'), os = require('os'), Module = require('module');

const tmp = path.join(os.tmpdir(), 'giro-ponte-teste');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const electronFake = { app: { getPath: () => tmp }, ipcMain: { handle: () => {} } };
const orig = Module._load;
Module._load = function (req, ...a) { return req === 'electron' ? electronFake : orig.call(this, req, ...a); };

const config = require('/home/user/Giropecas/desktop/config.js');

let f = 0;
const ok = (c, m) => { if (!c) { f++; console.log('FAIL:', m); } else console.log('ok:', m); };
const recusa = (fn, oque) => { try { fn(); ok(false, oque + ' deveria falhar'); } catch { ok(true, oque + ' e recusado'); } };

console.log('--- Endereco informado pelo lojista ---');
ok(config.normalizarUrl('https://giro.vercel.app') === 'https://giro.vercel.app', 'aceita https');
ok(config.normalizarUrl('giro.vercel.app') === 'https://giro.vercel.app', 'completa https quando falta');
ok(config.normalizarUrl('https://giro.vercel.app/ordens?x=1') === 'https://giro.vercel.app',
  'guarda so a origem, sem caminho nem parametros');
ok(config.normalizarUrl('  giro.vercel.app  ') === 'https://giro.vercel.app', 'ignora espacos');
ok(config.normalizarUrl('http://localhost:5173') === 'http://localhost:5173', 'permite localhost para teste');
recusa(() => config.normalizarUrl('http://oficina.com.br'), 'http em endereco da internet');
recusa(() => config.normalizarUrl(''), 'endereco em branco');
recusa(() => config.normalizarUrl('   '), 'so espacos');
recusa(() => config.normalizarUrl('nao é um endereço'), 'texto que nao e endereco');
recusa(() => config.normalizarUrl(null), 'endereco nulo');

console.log('--- Modo de abertura ---');
ok(config.ler().modo === null, 'primeira abertura nao tem modo definido');
config.salvar({ modo: 'offline' });
ok(config.ler().modo === 'offline', 'guarda o modo offline');
config.salvar({ modo: 'nuvem', urlNuvem: 'https://giro.vercel.app' });
const c = config.ler();
ok(c.modo === 'nuvem' && c.urlNuvem === 'https://giro.vercel.app', 'guarda o modo nuvem com o endereco');

console.log('--- PINO DE ORIGEM (quem pode mandar assinar) ---');
const { pathToFileURL } = require('url');
const APP = pathToFileURL(path.join('/home/user/Giropecas/desktop', 'app', 'index.html')).href;
const CONECTAR = pathToFileURL('/home/user/Giropecas/desktop/conectar.html').href;

ok(config.origemAutorizada('https://giro.vercel.app/ordens/123'), 'o proprio sistema e autorizado');
ok(config.origemAutorizada(APP), 'o app offline embutido e autorizado');
ok(config.origemAutorizada(CONECTAR), 'a tela de conexao e autorizada');

// Um .html baixado tambem e "file://" — nao pode herdar acesso ao certificado.
ok(!config.origemAutorizada(pathToFileURL('/home/user/Downloads/nota.html').href),
  'PINO: arquivo local fora da pasta do app e recusado');
ok(!config.origemAutorizada('file:///home/user/Giropecas/desktop/../../senha.html'),
  'PINO: caminho com .. nao escapa da pasta do app');
ok(!config.origemAutorizada('file:///home/user/Giropecas/desktop-outro/app/index.html'),
  'PINO: pasta vizinha de nome parecido e recusada');

ok(!config.origemAutorizada('https://giro.vercel.app.golpe.com/'),
  'PINO: dominio que apenas COMECA igual e recusado');
ok(!config.origemAutorizada('https://evil.com/?x=https://giro.vercel.app'),
  'PINO: endereco do sistema dentro da URL nao autoriza');
ok(!config.origemAutorizada('http://giro.vercel.app/'),
  'PINO: mesmo dominio em http (sem TLS) e recusado');
ok(!config.origemAutorizada('https://giro.vercel.app:8443/'),
  'PINO: mesmo dominio em outra porta e recusado');
ok(!config.origemAutorizada('https://sub.giro.vercel.app/'),
  'PINO: subdominio nao herda a autorizacao');
ok(!config.origemAutorizada('data:text/html,<script>fetch(1)</script>'),
  'PINO: pagina data: e recusada');
ok(!config.origemAutorizada('javascript:alert(1)'), 'PINO: javascript: e recusado');
ok(!config.origemAutorizada(''), 'PINO: origem vazia e recusada');
ok(!config.origemAutorizada(undefined), 'PINO: origem ausente e recusada');
ok(!config.origemAutorizada('https://GIRO.VERCEL.APP/'.replace('GIRO', 'outra')),
  'PINO: outro dominio e recusado');

console.log('--- Voltando para offline, a nuvem antiga perde o acesso ---');
config.salvar({ modo: 'offline' });
ok(!config.origemAutorizada('https://giro.vercel.app/'),
  'endereco de nuvem nao vale mais no modo offline');
ok(config.origemAutorizada(APP), 'o app embutido continua valendo');

console.log('--- Arquivo de configuracao corrompido ---');
fs.writeFileSync(path.join(tmp, 'configuracao.json'), '{ isso nao e json');
const quebrado = config.ler();
ok(quebrado.modo === null && quebrado.urlNuvem === null,
  'configuracao ilegivel volta para a tela de conexao em vez de quebrar');
ok(!config.origemAutorizada('https://giro.vercel.app/'),
  'sem configuracao valida, nenhuma nuvem e autorizada');

console.log(f === 0 ? '\n✅ PONTE DESKTOP OK' : `\n❌ ${f} falha(s)`);
process.exit(f ? 1 : 0);
