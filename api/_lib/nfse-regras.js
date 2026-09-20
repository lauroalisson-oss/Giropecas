// Quando a oficina pode emitir uma NFS-e.
//
// Separado da rota de propósito: são as regras que o provedor combina com
// cada oficina (plano, limite de notas, validade da licença), e elas
// precisam valer no servidor, onde o lojista não alcança. Ficando aqui,
// dá para conferir cada caso sem subir banco nem servidor.
//
// Devolve null quando está liberado, ou { status, mensagem } com o motivo.

export function checarLicenca(licenca, agora = new Date()) {
  if (!licenca || licenca.status !== 'active') {
    return { status: 403, mensagem: 'Licença inativa. Solicite a renovação ao provedor.' };
  }
  if (licenca.expires_at && new Date(licenca.expires_at) < agora) {
    return { status: 403, mensagem: 'Licença vencida. Solicite a renovação ao provedor.' };
  }
  if (licenca.plan_type !== 'fiscal') {
    return {
      status: 403,
      mensagem: 'Seu plano não inclui emissão de nota fiscal. Fale com o provedor.',
    };
  }
  return null;
}

export function checarLimiteMensal(licenca, emitidasNoMes) {
  const limite = Number(licenca?.fiscal_note_limit) || 100;
  const usadas = Number(emitidasNoMes) || 0;
  if (usadas >= limite) {
    return {
      status: 403,
      mensagem: `Limite de ${limite} notas no mês atingido (${usadas} emitidas). `
        + 'Peça ao provedor para aumentar o limite.',
    };
  }
  return null;
}

export function checarOrdem(ordem, notaExistente) {
  if (!ordem) return { status: 404, mensagem: 'Ordem de serviço não encontrada.' };

  const itens = Array.isArray(ordem.service_items) ? ordem.service_items : [];
  if (!itens.length) {
    return {
      status: 400,
      mensagem: 'Esta OS não tem serviços. A NFS-e é da mão de obra — peças saem em NF-e.',
    };
  }
  if (notaExistente && notaExistente.status === 'autorizada') {
    return {
      status: 409,
      mensagem: `Esta OS já tem NFS-e autorizada (nota ${notaExistente.number}).`,
      nfe_id: notaExistente.id,
    };
  }
  return null;
}

// Primeiro instante do mês corrente — recorte da contagem do limite.
export function inicioDoMes(agora = new Date()) {
  const d = new Date(agora);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
