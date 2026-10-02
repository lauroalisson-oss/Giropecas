// Envio da DPS ao Sistema Nacional NFS-e (Sefin Nacional).
//
// A API autentica por mTLS: o certificado da oficina é apresentado no
// handshake TLS, antes de qualquer dado trafegar. Navegador não faz isso —
// por isso a emissão roda aqui, no Electron (Node).

const https = require('node:https');
const { gunzipSync } = require('node:zlib');

const HOSTS = {
  producao: 'sefin.nfse.gov.br',
  homologacao: 'sefin.producaorestrita.nfse.gov.br',
};

// Os dois ambientes têm o MESMO caminho. Homologação estava com
// '/API/SefinNacional/nfse' — "/API/SefinNacional/docs" é só a página da
// documentação (swagger); a API em si responde em /SefinNacional, como
// usam os clientes que emitem de fato (pynfse-nacional, nfse-nacional
// em PHP). Com /API, a primeira emissão em homologação daria 404.
const CAMINHOS = {
  producao: '/SefinNacional/nfse',
  homologacao: '/SefinNacional/nfse',
};

function requisicao({ host, caminho, corpo, pfx, senha, metodo = 'POST', timeout = 45000 }) {
  return new Promise((resolve, reject) => {
    const dados = corpo ? Buffer.from(JSON.stringify(corpo), 'utf8') : null;

    const req = https.request({
      host,
      port: 443,
      path: caminho,
      method: metodo,
      // É AQUI que o mTLS acontece: o Node apresenta o certificado da
      // oficina no handshake.
      pfx,
      passphrase: senha,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(dados ? { 'Content-Length': dados.length } : {}),
      },
      timeout,
    }, (res) => {
      const pedacos = [];
      res.on('data', (c) => pedacos.push(c));
      res.on('end', () => {
        const texto = Buffer.concat(pedacos).toString('utf8');
        let json = null;
        try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }
        resolve({ status: res.statusCode, json, texto });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('O Sefin não respondeu a tempo. Tente novamente em alguns minutos.'));
    });

    req.on('error', (e) => {
      // Erros de TLS costumam significar certificado recusado; a mensagem
      // crua do Node não ajuda o lojista.
      if (/certificate|SSL|TLS|EPROTO/i.test(e.message)) {
        reject(new Error(
          'O Sefin recusou o certificado. Verifique se ele é ICP-Brasil, está válido '
          + 'e se a oficina está credenciada no Emissor Nacional. '
          + `(detalhe técnico: ${e.message})`,
        ));
      } else if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(e.message)) {
        reject(new Error('Sem conexão com o Sefin. Verifique a internet.'));
      } else {
        reject(e);
      }
    });

    if (dados) req.write(dados);
    req.end();
  });
}

// Campo de um objeto do Sefin, sem depender de maiúscula: a lista de
// erros vem como { Codigo, Descricao, Complemento } — com a inicial
// maiúscula —, e em versões antigas em minúscula.
function campo(obj, ...nomes) {
  if (!obj || typeof obj !== 'object') return undefined;
  const procurados = nomes.map(n => n.toLowerCase());
  for (const [k, v] of Object.entries(obj)) {
    if (procurados.includes(k.toLowerCase()) && v !== null && v !== undefined && v !== '') return v;
  }
  return undefined;
}

// Lista de erros, em qualquer dos formatos que o Sefin usa.
function errosDa(json) {
  if (Array.isArray(json)) return json;
  const lista = campo(json, 'erros', 'erro', 'errors');
  return Array.isArray(lista) ? lista : [];
}

// Traduz a resposta do Sefin numa forma que a tela entende.
//
// Lia os erros como e.codigo / e.descricao, e o Sefin manda Codigo /
// Descricao / Complemento: a recusa chegava à tela como mensagem VAZIA e
// sem código — o lojista sem saber o que corrigir, e o código (E0xxx)
// perdido.
function interpretar(resposta) {
  const { status, json, texto } = resposta;

  if (status === 201 || status === 200) {
    // Evento (cancelamento): o resultado vem em retEvento; cStat 144 é
    // "evento registrado". Outro cStat, mesmo com HTTP 200, é recusa.
    const retEvento = campo(json, 'retEvento');
    if (retEvento) {
      const cStat = campo(retEvento, 'cStat');
      if (cStat !== undefined && String(cStat) !== '144') {
        return {
          ok: false, status,
          erro: `${cStat} ${campo(retEvento, 'xMotivo') || 'Evento recusado pelo Sefin.'}`.trim(),
          codigos: [String(cStat)], bruto: json,
        };
      }
      return { ok: true, status, chaveAcesso: null, xmlNfse: null, bruto: json };
    }

    const chave = campo(json, 'chaveAcesso', 'chave_acesso');
    let xmlNfse = null;
    const b64 = campo(json, 'nfseXmlGZipB64', 'nfse_xml_gzip_b64');
    if (b64) {
      try { xmlNfse = gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'); } catch { /* fica sem o XML */ }
    }
    return { ok: true, status, chaveAcesso: chave || null, xmlNfse, bruto: json };
  }

  // Um evento pode responder sem corpo.
  if (status === 204) return { ok: true, status, chaveAcesso: null, xmlNfse: null, bruto: null };

  // O Sefin devolve a lista de erros com código, descrição e complemento —
  // o complemento costuma ser o que diz QUAL campo está errado.
  const erros = errosDa(json);
  const linhas = erros.map((e) => {
    const codigo = campo(e, 'codigo', 'code');
    const descricao = campo(e, 'descricao', 'mensagem', 'message');
    const complemento = campo(e, 'complemento');
    return [codigo, descricao, complemento ? `(${complemento})` : null].filter(Boolean).join(' ');
  }).filter(Boolean);

  const mensagem = linhas.length
    ? linhas.join(' | ')
    : (campo(json, 'mensagem', 'message', 'descricao') || (texto ? texto.slice(0, 500) : '') || `HTTP ${status}`);

  return {
    ok: false,
    status,
    erro: mensagem,
    codigos: [
      ...erros.map(e => campo(e, 'codigo', 'code')),
      campo(json, 'codigo'),
    ].filter(Boolean).map(String),
    bruto: json,
  };
}

// Envia a DPS assinada e compactada.
async function enviarDps({ dpsXmlGZipB64, pfx, senha, producao = false }) {
  const ambiente = producao ? 'producao' : 'homologacao';
  const resposta = await requisicao({
    host: HOSTS[ambiente],
    caminho: CAMINHOS[ambiente],
    corpo: { dpsXmlGZipB64 },
    pfx,
    senha,
  });
  return interpretar(resposta);
}

// Consulta uma NFS-e já emitida pela chave de acesso.
async function consultarNfse({ chaveAcesso, pfx, senha, producao = false }) {
  const ambiente = producao ? 'producao' : 'homologacao';
  const resposta = await requisicao({
    host: HOSTS[ambiente],
    caminho: `${CAMINHOS[ambiente]}/${encodeURIComponent(chaveAcesso)}`,
    metodo: 'GET',
    pfx,
    senha,
  });
  return interpretar(resposta);
}

// Registra um evento (cancelamento) na nota.
//
// Endpoint confirmado no manual oficial: POST /nfse/{chaveAcesso}/eventos
async function enviarEvento({ chaveAcesso, pedidoXmlGZipB64, pfx, senha, producao = false }) {
  const ambiente = producao ? 'producao' : 'homologacao';
  const resposta = await requisicao({
    host: HOSTS[ambiente],
    caminho: `${CAMINHOS[ambiente]}/${encodeURIComponent(chaveAcesso)}/eventos`,
    corpo: { pedidoRegistroEventoXmlGZipB64: pedidoXmlGZipB64 },
    pfx,
    senha,
  });
  return interpretar(resposta);
}

// Pergunta ao Sefin se uma DPS já virou nota.
//
// É o que resolve a emissão que caiu no meio: sem isto, a oficina não
// teria como saber se a nota existe lá, e só descobriria ao tentar de
// novo e levar recusa por duplicidade.
async function consultarDps({ idDps, pfx, senha, producao = false }) {
  const ambiente = producao ? 'producao' : 'homologacao';
  const base = CAMINHOS[ambiente].replace(/\/nfse$/, '');
  const resposta = await requisicao({
    host: HOSTS[ambiente],
    caminho: `${base}/dps/${encodeURIComponent(idDps)}`,
    metodo: 'GET',
    pfx,
    senha,
  });

  // 404 aqui é resposta útil, não erro: quer dizer que a DPS não gerou
  // nota nenhuma, então a oficina pode emitir de novo com tranquilidade.
  if (resposta.status === 404) {
    return { ok: true, existe: false };
  }
  const r = interpretar(resposta);
  return r.ok ? { ...r, existe: true } : r;
}

module.exports = { enviarDps, consultarNfse, enviarEvento, consultarDps, interpretar, HOSTS, CAMINHOS };
