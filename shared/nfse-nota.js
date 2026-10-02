// Leituras de uma nota já gravada, comuns à tela e ao servidor.

// Em qual ambiente a nota foi emitida — produção ou homologação.
//
// Vale o que está no XML (tpAmb: 1 = produção, 2 = homologação), não a
// configuração ATUAL da oficina: depois de passar para produção, as notas
// de teste continuam sendo de homologação. Consultar, baixar o DANFSe ou
// CANCELAR uma delas no ambiente de produção daria "não encontrada".
export function producaoDaNota(nota, empresa) {
  for (const xml of [nota?.xml_dps, nota?.xml_content]) {
    const m = String(xml || '').match(/<tpAmb>\s*([12])\s*<\/tpAmb>/);
    if (m) return m[1] === '1';
  }
  return empresa?.nfe_environment === 'producao';
}
