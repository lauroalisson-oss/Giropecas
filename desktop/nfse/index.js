// Ponte entre a janela e a emissão fiscal.
//
// Toda a operação com o certificado acontece no processo principal do
// Electron. A janela só pede e recebe o resultado — ela nunca vê o arquivo
// nem a senha.

const { ipcMain } = require('electron');
const certificado = require('./certificado');
const config = require('../config');
const { assinarDps, assinarEvento, compactarParaEnvio } = require('./assinatura');
const { enviarDps, consultarNfse, enviarEvento, consultarDps } = require('./sefin');

// Converte exceção em resposta previsível, para a tela sempre ter o que
// mostrar — e confere, a cada chamada, de qual endereço veio o pedido.
//
// A conferência é feita aqui, no processo principal, e não no preload:
// o preload roda dentro da página, então não serve para decidir se aquela
// página tem direito de usar o certificado da oficina.
const protegido = (fn) => async (evento, ...args) => {
  const origem = evento?.senderFrame?.url || evento?.sender?.getURL?.();
  if (!config.origemAutorizada(origem)) {
    return { ok: false, erro: 'Pedido veio de um endereço não autorizado.' };
  }
  try {
    return { ok: true, dados: await fn(...args) };
  } catch (e) {
    return { ok: false, erro: e?.message || 'Falha inesperada.' };
  }
};

function registrar() {
  // --- Certificado ---
  ipcMain.handle('nfse:certificado:situacao', protegido(() => certificado.situacao()));
  ipcMain.handle('nfse:certificado:salvar', protegido((caminho, senha) => certificado.salvar(caminho, senha)));
  ipcMain.handle('nfse:certificado:remover', protegido(() => certificado.remover()));

  // --- Emissão ---
  // Recebe o XML da DPS já montado (pela nuvem ou pelo app offline),
  // assina com o certificado local e transmite ao Sefin.
  ipcMain.handle('nfse:emitir', protegido(async ({ xmlDps, idInfDps, producao = false, senha = null }) => {
    if (!xmlDps) throw new Error('DPS não informada.');

    const { pfx, senha: senhaCert, info } = certificado.carregar(senha);
    const assinado = assinarDps(xmlDps, info, idInfDps);
    const dpsXmlGZipB64 = compactarParaEnvio(assinado);

    const resultado = await enviarDps({ dpsXmlGZipB64, pfx, senha: senhaCert, producao });

    if (!resultado.ok) {
      // Devolve o erro do Sefin como veio: os códigos (E0714, E0121...)
      // são o que permite diagnosticar.
      const err = new Error(resultado.erro);
      err.codigos = resultado.codigos;
      throw err;
    }

    // O Sefin respondeu sucesso, mas sem a chave de acesso. Isso não pode
    // passar batido: a nota provavelmente existe lá, e tratar como sucesso
    // silencioso deixaria a oficina sem o documento e sem saber disso.
    // O erro carrega a resposta crua, que é o que permite descobrir se o
    // campo mudou de nome.
    if (!resultado.chaveAcesso) {
      const err = new Error(
        'O Sefin aceitou a nota mas não devolveu a chave de acesso. '
        + 'Use "Verificar no Sefin" nesta nota para recuperá-la. '
        + `(resposta: ${JSON.stringify(resultado.bruto || {}).slice(0, 300)})`,
      );
      err.semChave = true;
      throw err;
    }

    return {
      chaveAcesso: resultado.chaveAcesso,
      xmlNfse: resultado.xmlNfse,
      xmlDpsAssinada: assinado,
      ambiente: producao ? 'producao' : 'homologacao',
    };
  }));

  // --- Cancelamento ---
  // Recebe o pedido de evento já montado (pela nuvem), assina e envia.
  // Cancelar não apaga a nota: registra um evento ligado a ela.
  ipcMain.handle('nfse:cancelar', protegido(async ({ xmlEvento, idInfPedReg, chaveAcesso, producao = false, senha = null }) => {
    if (!xmlEvento) throw new Error('Pedido de cancelamento não informado.');
    if (!chaveAcesso) throw new Error('Chave de acesso da nota não informada.');

    const { pfx, senha: senhaCert, info } = certificado.carregar(senha);
    const assinado = assinarEvento(xmlEvento, info, idInfPedReg);
    const pedidoXmlGZipB64 = compactarParaEnvio(assinado);

    const resultado = await enviarEvento({ chaveAcesso, pedidoXmlGZipB64, pfx, senha: senhaCert, producao });
    if (!resultado.ok) {
      const err = new Error(resultado.erro);
      err.codigos = resultado.codigos;
      throw err;
    }
    return { ...resultado, xmlEventoAssinado: assinado };
  }));

  // Pergunta ao Sefin se uma DPS já virou nota — para a emissão que caiu
  // no meio e deixou a nota presa em "validando".
  ipcMain.handle('nfse:consultar-dps', protegido(async ({ idDps, producao = false, senha = null }) => {
    if (!idDps) throw new Error('Id da DPS não informado.');
    const { pfx, senha: senhaCert } = certificado.carregar(senha);
    const r = await consultarDps({ idDps, pfx, senha: senhaCert, producao });
    if (!r.ok) throw new Error(r.erro);
    return r;
  }));

  ipcMain.handle('nfse:consultar', protegido(async ({ chaveAcesso, producao = false, senha = null }) => {
    if (!chaveAcesso) throw new Error('Chave de acesso não informada.');
    const { pfx, senha: senhaCert } = certificado.carregar(senha);
    const r = await consultarNfse({ chaveAcesso, pfx, senha: senhaCert, producao });
    if (!r.ok) throw new Error(r.erro);
    return r;
  }));
}

module.exports = { registrar };
