// O município da oficina emite NFS-e pelo Emissor Nacional?
//
// O GiroPeças emite direto no Sefin Nacional — que é o Emissor Nacional.
// Só funciona nos municípios que aderiram a ele. Os demais (Cipó-BA,
// Salvador, Feira de Santana...) são conveniados ao Ambiente Nacional, mas
// emitem pelo sistema da própria prefeitura e só enviam uma cópia ao ADN:
// para eles, a DPS mandada ao Sefin é recusada.
//
// A tabela (emissor-nacional.json) vem da planilha oficial de municípios
// aderentes — ver scripts/atualizar-emissor-nacional.py. Ela muda: um
// município pode aderir a qualquer momento. Por isso a resposta é um
// AVISO para a oficina, nunca um bloqueio.

// Mesma normalização do script que gera a tabela.
export function chaveMunicipio(uf, nome) {
  const semAcento = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return `${String(uf || '').trim().toUpperCase()}|${semAcento.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
}

/**
 * @returns {'sim' | 'nao' | null} null quando o município não foi achado
 *   na tabela (nome escrito diferente, cadastro incompleto).
 */
export function usaEmissorNacional({ city, state } = {}, tabela) {
  if (!city || !state || !tabela) return null;
  const k = chaveMunicipio(state, city);
  if (tabela.comEmissorNacional?.includes(k)) return 'sim';
  if (tabela.semEmissorNacional?.includes(k)) return 'nao';
  return null;
}

// Texto do aviso, igual em qualquer tela.
export function avisoEmissorNacional(empresa, tabela) {
  if (usaEmissorNacional(empresa || {}, tabela) !== 'nao') return null;
  const quando = tabela?.atualizado ? new Date(`${tabela.atualizado}T12:00:00`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null;
  return `${empresa.city}/${String(empresa.state).toUpperCase()} não emite NFS-e pelo Emissor Nacional`
    + (quando ? ` (lista oficial de ${quando})` : '')
    + ': a prefeitura usa sistema próprio. A emissão pelo GiroPeças será recusada pelo Sefin até o '
    + 'município aderir. Confirme com a prefeitura ou o contador.';
}
