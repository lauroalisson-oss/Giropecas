// Emissão de NFS-e: a ponte entre o sistema na nuvem e o computador da
// oficina.
//
// Por que existe esta ponte: transmitir ao Sefin Nacional exige uma conexão
// autenticada com o certificado digital A1 (mTLS). Navegador nenhum sabe
// fazer isso — a API do navegador não dá acesso ao certificado. Então a
// emissão acontece no aplicativo Giropeças instalado na oficina, que é onde
// o certificado está guardado.
//
// A divisão fica assim:
//
//   nuvem (aqui)     monta a DPS, reserva o número, confere o plano
//   desktop          assina com o certificado e transmite ao Sefin
//   nuvem (aqui)     guarda a chave de acesso e o XML que voltou
//
// O certificado e a senha nunca saem daquele computador: nem para cá, nem
// para o provedor, nem para lugar nenhum.

import { base44 } from '@/api/base44Client';
export { pendenciasNfse, nfseNoMes, idDpsDaNota, escolherXml, MODELO_LABEL } from './nfse-dados';
import { escolherXml } from './nfse-dados';

// A ponte é injetada pelo aplicativo desktop (preload.js). Num navegador
// comum ela simplesmente não existe.
export function ponteDesktop() {
  return typeof window !== 'undefined' && window.giropecasNFSe?.disponivel
    ? window.giropecasNFSe
    : null;
}

export const temPonteDesktop = () => !!ponteDesktop();

export const AVISO_SEM_PONTE =
  'A emissão precisa ser feita no computador da oficina, pelo aplicativo Giropeças — '
  + 'é nele que fica o certificado digital. Abra esta OS por lá para emitir a nota.';

// Situação do certificado na máquina (null quando não há ponte).
export async function situacaoCertificado() {
  const ponte = ponteDesktop();
  if (!ponte) return null;
  const r = await ponte.situacaoCertificado();
  return r?.ok ? r.dados : { configurado: false, erro: r?.erro };
}

/**
 * Emite a NFS-e de uma ordem de serviço.
 *
 * Avisa o andamento por `onEtapa` para a tela poder mostrar em que passo
 * está — a transmissão ao Sefin costuma levar alguns segundos.
 *
 * @param {string} workOrderId
 * @param {(etapa: string) => void} [onEtapa]
 * @returns {Promise<{chaveAcesso: string, nfeId: string, numero: number}>}
 */
export async function emitirNfse(workOrderId, onEtapa = () => {}) {
  const ponte = ponteDesktop();
  if (!ponte) throw new Error(AVISO_SEM_PONTE);

  // --- 1. Antes de reservar número, confere se dá para assinar -----------
  // Sem esta conferência, um certificado ausente só apareceria depois de a
  // nota já ter consumido um número.
  onEtapa('Verificando o certificado...');
  const cert = await situacaoCertificado();
  if (!cert?.configurado) {
    throw new Error('Nenhum certificado digital configurado neste computador. '
      + 'Vá em Configurações → Certificado digital.');
  }
  if (cert.expirado) {
    throw new Error('O certificado digital venceu. Instale o certificado novo para emitir notas.');
  }

  // --- 2. A nuvem monta a DPS -------------------------------------------
  onEtapa('Montando a nota...');
  const { data: preparo } = await base44.functions.invoke('nfsePreparar', {
    work_order_id: workOrderId,
  });

  // --- 3. O desktop assina e transmite ----------------------------------
  onEtapa('Assinando e enviando ao Sefin...');
  const resposta = await ponte.emitir({
    xmlDps: preparo.xmlDps,
    idInfDps: preparo.idInfDps,
    producao: preparo.producao,
  });

  if (!resposta?.ok) {
    // Registra a recusa para a nota não ficar presa em "validando", e
    // devolve o erro do Sefin como veio — os códigos (E0714, E0121...) são
    // o que permite descobrir o que corrigir no cadastro.
    const motivo = resposta?.erro || 'Falha na transmissão ao Sefin.';
    try {
      await base44.functions.invoke('nfseRegistrar', { nfe_id: preparo.nfe_id, erro: motivo });
    } catch { /* o erro do Sefin é mais importante que o do registro */ }
    throw new Error(motivo);
  }

  // --- 4. A nuvem guarda o resultado ------------------------------------
  onEtapa('Guardando a nota...');
  await base44.functions.invoke('nfseRegistrar', {
    nfe_id: preparo.nfe_id,
    chave_acesso: resposta.dados.chaveAcesso,
    xml_nfse: resposta.dados.xmlNfse,
    // A DPS assinada é o que a oficina declarou; guardar só o retorno do
    // governo perderia essa metade.
    xml_dps: resposta.dados.xmlDpsAssinada,
  });

  return {
    nfeId: preparo.nfe_id,
    chaveAcesso: resposta.dados.chaveAcesso,
    numero: preparo.numero,
    total: preparo.total,
    iss: preparo.iss,
    ambiente: resposta.dados.ambiente,
  };
}

// Reconsulta uma nota no Sefin pela chave de acesso. Também depende da
// ponte: a consulta usa a mesma conexão autenticada por certificado.
export async function consultarNaSefin(chaveAcesso, producao = false) {
  const ponte = ponteDesktop();
  if (!ponte) throw new Error(AVISO_SEM_PONTE);
  const r = await ponte.consultar({ chaveAcesso, producao });
  if (!r?.ok) throw new Error(r?.erro || 'Não foi possível consultar a nota.');
  return r.dados;
}

// Baixa o XML da nota. A escolha de qual documento e o nome do arquivo
// ficam em nfse-dados.js (puro); aqui sobra só o empurrão no navegador.
export function baixarXml(nota, qual = 'nfse') {
  const { conteudo, nome } = escolherXml(nota, qual);
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Devolve a memória do blob depois que o navegador começou o download.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return nome;
}

// Marca como não emitida uma nota que ficou presa em "validando".
//
// Usada depois de confirmar com o Sefin que a DPS não virou nota (ver
// verificarNotaPresa). Sozinha, ela só mexe no nosso registro — não
// pergunta nada ao governo.
export async function liberarNotaPresa(nfeId) {
  await base44.functions.invoke('nfseRegistrar', {
    nfe_id: nfeId,
    erro: 'Transmissão interrompida — a nota não chegou a ser confirmada pelo Sefin.',
  });
}

export { MOTIVOS_CANCELAMENTO } from '../../shared/nfse-evento.js';

/**
 * Cancela uma NFS-e autorizada.
 *
 * Cancelar não apaga a nota: registra um evento ligado a ela. A nota
 * continua no histórico, agora marcada como cancelada — é assim que o
 * fisco enxerga e é assim que o contador precisa ver.
 */
export async function cancelarNfse({ nfeId, motivo, justificativa }, onEtapa = () => {}) {
  const ponte = ponteDesktop();
  if (!ponte) throw new Error(AVISO_SEM_PONTE);

  onEtapa('Montando o pedido...');
  const { data: pedido } = await base44.functions.invoke('nfseCancelar', {
    nfe_id: nfeId, motivo, justificativa,
  });

  onEtapa('Enviando ao Sefin...');
  const r = await ponte.cancelar({
    xmlEvento: pedido.xmlEvento,
    idInfPedReg: pedido.idInfPedReg,
    chaveAcesso: pedido.chave_acesso,
    producao: pedido.producao,
  });

  if (!r?.ok) {
    const motivoErro = r?.erro || 'O Sefin recusou o cancelamento.';
    // Registra a recusa SEM mexer no status: a nota segue autorizada,
    // porque é isso que vale no Sefin.
    try {
      await base44.functions.invoke('nfseCancelar', { nfe_id: nfeId, erro_sefin: motivoErro });
    } catch { /* o erro do Sefin é o que importa */ }
    throw new Error(motivoErro);
  }

  onEtapa('Guardando...');
  await base44.functions.invoke('nfseCancelar', {
    nfe_id: nfeId, confirmado: true, justificativa,
  });

  return { status: 'cancelada' };
}

/**
 * Pergunta ao Sefin se a DPS de uma nota presa em "validando" virou nota.
 *
 * Sem isto a oficina fica no escuro: ou emite de novo e arrisca
 * duplicidade, ou deixa a OS sem nota. O endpoint GET /dps/{id} existe
 * exatamente para este caso, e está no manual oficial.
 */
export async function verificarNotaPresa({ nfeId, idDps, producao = false }) {
  const ponte = ponteDesktop();
  if (!ponte) throw new Error(AVISO_SEM_PONTE);

  const r = await ponte.consultarDps({ idDps, producao });
  if (!r?.ok) throw new Error(r?.erro || 'Não foi possível consultar a DPS.');

  const dados = r.dados;
  if (dados?.existe === false) {
    // Não virou nota: liberar para nova tentativa é seguro.
    await liberarNotaPresa(nfeId);
    return { existe: false };
  }

  // Virou nota: grava a chave, para a oficina ter o documento.
  if (dados?.chaveAcesso) {
    await base44.functions.invoke('nfseRegistrar', {
      nfe_id: nfeId,
      chave_acesso: dados.chaveAcesso,
      xml_nfse: dados.xmlNfse,
    });
  }
  return { existe: true, chaveAcesso: dados?.chaveAcesso };
}
