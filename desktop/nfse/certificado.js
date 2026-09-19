// Guarda local do certificado digital da oficina.
//
// O certificado e a senha NUNCA saem deste computador. É o que permite usar
// a emissão gratuita do Sistema Nacional sem o provedor custodiar
// certificados de terceiros.
//
// A senha é cifrada pelo safeStorage do Electron, que no Windows usa a
// DPAPI: a cifra fica presa a este computador E a este usuário do Windows.
// Copiar os arquivos para outra máquina não adianta — a senha não abre.

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

function pastaCertificado() {
  const dir = path.join(app.getPath('userData'), 'certificado');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const arquivoPfx = () => path.join(pastaCertificado(), 'certificado.pfx');
const arquivoSenha = () => path.join(pastaCertificado(), 'senha.bin');

// Guarda o .pfx escolhido pelo lojista e cifra a senha.
function salvar(caminhoOrigem, senha) {
  if (!fs.existsSync(caminhoOrigem)) {
    throw new Error('Arquivo do certificado não encontrado.');
  }
  if (!senha) throw new Error('Informe a senha do certificado.');

  // Confere ANTES de guardar: senha errada guardada é problema que só
  // aparece na hora de emitir, com a oficina esperando.
  const conteudo = fs.readFileSync(caminhoOrigem);
  const info = require('./assinatura').lerCertificado(conteudo, senha);

  fs.writeFileSync(arquivoPfx(), conteudo, { mode: 0o600 });

  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(arquivoSenha(), safeStorage.encryptString(senha), { mode: 0o600 });
  } else {
    // Sem proteção do sistema, não gravamos senha em texto puro.
    // A oficina digita a senha a cada emissão.
    try { fs.unlinkSync(arquivoSenha()); } catch { /* não existia */ }
  }

  return {
    titular: info.titular,
    validoAte: info.validoAte,
    expirado: info.expirado,
    senhaGuardada: safeStorage.isEncryptionAvailable(),
    pasta: pastaCertificado(),
  };
}

function lerSenhaGuardada() {
  try {
    if (!fs.existsSync(arquivoSenha())) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(fs.readFileSync(arquivoSenha()));
  } catch {
    // Cifra de outro computador/usuário, ou arquivo corrompido.
    return null;
  }
}

// Devolve o certificado pronto para uso. `senhaInformada` cobre o caso de
// a senha não estar guardada.
function carregar(senhaInformada) {
  if (!fs.existsSync(arquivoPfx())) {
    throw new Error('Nenhum certificado configurado neste computador. Configure em Fiscal → Certificado.');
  }
  const senha = senhaInformada || lerSenhaGuardada();
  if (!senha) {
    throw new Error('Senha do certificado não disponível. Informe a senha para emitir.');
  }
  const pfx = fs.readFileSync(arquivoPfx());
  const info = require('./assinatura').lerCertificado(pfx, senha);

  if (info.expirado) {
    throw new Error(
      `Certificado vencido em ${new Date(info.validoAte).toLocaleDateString('pt-BR')}. `
      + 'Renove o certificado A1 e configure o novo arquivo.',
    );
  }
  return { pfx, senha, info };
}

function situacao() {
  const existe = fs.existsSync(arquivoPfx());
  if (!existe) {
    return { configurado: false, pasta: pastaCertificado() };
  }
  const senha = lerSenhaGuardada();
  const base = {
    configurado: true,
    senhaGuardada: !!senha,
    pasta: pastaCertificado(),
    protecaoDoSistema: safeStorage.isEncryptionAvailable(),
  };
  if (!senha) return base;

  try {
    const info = require('./assinatura').lerCertificado(fs.readFileSync(arquivoPfx()), senha);
    const diasParaVencer = Math.ceil((new Date(info.validoAte) - Date.now()) / 86400000);
    return { ...base, titular: info.titular, validoAte: info.validoAte, expirado: info.expirado, diasParaVencer };
  } catch (e) {
    return { ...base, erro: e.message };
  }
}

function remover() {
  for (const f of [arquivoPfx(), arquivoSenha()]) {
    try { fs.unlinkSync(f); } catch { /* já não existia */ }
  }
  return { configurado: false };
}

module.exports = { salvar, carregar, situacao, remover, pastaCertificado };
