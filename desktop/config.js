// Configuração local do aplicativo: em que modo ele abre.
//
//   'offline'  — o app offline embutido (dados só nesta máquina)
//   'nuvem'    — o sistema Giropeças online, no endereço informado
//
// Em qualquer um dos dois a emissão de NFS-e roda aqui, com o certificado
// guardado nesta máquina. O modo só decide de onde vêm as telas e os dados.

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { app } = require('electron');

const ARQUIVO = () => path.join(app.getPath('userData'), 'configuracao.json');

function ler() {
  try {
    const c = JSON.parse(fs.readFileSync(ARQUIVO(), 'utf8'));
    return { modo: c.modo || null, urlNuvem: c.urlNuvem || null };
  } catch {
    return { modo: null, urlNuvem: null };
  }
}

function salvar(parcial) {
  const atual = ler();
  const novo = { ...atual, ...parcial };
  fs.mkdirSync(path.dirname(ARQUIVO()), { recursive: true });
  fs.writeFileSync(ARQUIVO(), JSON.stringify(novo, null, 2));
  return novo;
}

// Aceita só https (ou localhost, para quem estiver testando). O endereço
// vira a ÚNICA origem autorizada a pedir uma emissão — por isso é validado
// aqui e não em qualquer lugar.
function normalizarUrl(entrada) {
  const texto = String(entrada || '').trim();
  if (!texto) throw new Error('Informe o endereço do sistema.');

  let u;
  try {
    u = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
  } catch {
    throw new Error('Endereço inválido. Exemplo: giropecas.vercel.app');
  }

  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !local) {
    throw new Error('O endereço precisa começar com https:// — sem isso a conexão não é segura.');
  }
  return u.origin;
}

// Origens de onde o app aceita um pedido de emissão.
// Sem isso, uma página qualquer aberta na janela poderia mandar assinar.
function origensPermitidas() {
  const { modo, urlNuvem } = ler();
  const lista = ['file://']; // o app offline embutido
  if (modo === 'nuvem' && urlNuvem) lista.push(urlNuvem);
  return lista;
}

// Pasta de onde saem as páginas embutidas (app offline e tela de conexão).
const RAIZ = pathToFileURL(path.join(__dirname, path.sep)).href;

function origemAutorizada(url) {
  if (!url) return false;

  // Páginas locais: valem só as que estão dentro da pasta do aplicativo.
  // "file:// é local, logo é de confiança" seria frouxo demais — um .html
  // baixado também é local, e teria acesso ao certificado.
  if (url.startsWith('file:')) {
    try {
      return new URL(url).href.startsWith(RAIZ);
    } catch {
      return false;
    }
  }

  try {
    return origensPermitidas().includes(new URL(url).origin);
  } catch {
    return false;
  }
}

module.exports = { ler, salvar, normalizarUrl, origensPermitidas, origemAutorizada, ARQUIVO };
