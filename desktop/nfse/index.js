// Ponte entre a janela e a emissão fiscal.
//
// Toda a operação com o certificado acontece no processo principal do
// Electron. A janela só pede e recebe o resultado — ela nunca vê o arquivo
// nem a senha.

const { ipcMain } = require('electron');
const certificado = require('./certificado');
const { assinarDps, compactarParaEnvio } = require('./assinatura');
const { enviarDps, consultarNfse } = require('./sefin');

// Converte exceção em resposta previsível, para a tela sempre ter o que mostrar.
const protegido = (fn) => async (_evento, ...args) => {
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

    return {
      chaveAcesso: resultado.chaveAcesso,
      xmlNfse: resultado.xmlNfse,
      xmlDpsAssinada: assinado,
      ambiente: producao ? 'producao' : 'homologacao',
    };
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
