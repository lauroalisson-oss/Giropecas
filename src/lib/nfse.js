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
export { pendenciasNfse, nfseNoMes, MODELO_LABEL } from './nfse-dados';

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

// Baixa o XML da nota. É o arquivo que o contador precisa — e o que vale
// como documento, por ser o que o governo assinou e devolveu.
export function baixarXml(nota) {
  if (!nota?.xml_content) throw new Error('Esta nota não tem XML guardado.');
  const nome = `NFSe-${nota.number || nota.rps_number || nota.id.slice(-6)}.xml`;
  const url = URL.createObjectURL(new Blob([nota.xml_content], { type: 'application/xml' }));
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

// Marca como não emitida uma nota que ficou presa em "validando" — quando
// a transmissão caiu no meio e a tela não recebeu resposta.
//
// Não mexe no Sefin: se a nota tiver sido gerada lá apesar da queda, a
// próxima tentativa é recusada como DPS repetida, e a mensagem do governo
// diz isso. É melhor errar para esse lado do que dar por emitida uma nota
// que não existe.
export async function liberarNotaPresa(nfeId) {
  await base44.functions.invoke('nfseRegistrar', {
    nfe_id: nfeId,
    erro: 'Transmissão interrompida — a nota não chegou a ser confirmada pelo Sefin.',
  });
}
