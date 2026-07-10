// Helpers de frontend para a emissão fiscal (NFC-e / NF-e).
// As chamadas de rede batem nas backend functions do Base44, que guardam o
// token do gateway com segurança — o frontend nunca vê o token.
import { base44 } from '@/api/base44Client';

// Emite uma nota a partir de uma venda (Sale) ou ordem de serviço (WorkOrder).
// tipo: 'nfce' (consumidor/balcão) | 'nfe' (empresa/pessoa identificada)
export async function emitirNota({ tipo = 'nfce', saleId, workOrderId }) {
  const { data } = await base44.functions.invoke('emitirNota', {
    tipo,
    sale_id: saleId,
    work_order_id: workOrderId,
  });
  return data; // { nfe_id, status, record }
}

// Reconsulta o status de uma nota que ficou "enviada"/processando.
export async function consultarNota(nfeId) {
  const { data } = await base44.functions.invoke('consultarNota', { nfe_id: nfeId });
  return data;
}

// Cancela uma nota autorizada (justificativa >= 15 caracteres).
export async function cancelarNota(nfeId, justificativa) {
  const { data } = await base44.functions.invoke('cancelarNota', {
    nfe_id: nfeId,
    justificativa,
  });
  return data;
}

// Verifica se há pendências que podem fazer a nota ser rejeitada.
// Retorna uma lista de mensagens (vazia = tudo pronto).
// items: itens da venda/OS; partsById: mapa id -> Part (com ncm); company: empresa.
export function fiscalIssues({ items, partsById, company }) {
  const issues = [];
  if (!company?.cnpj) issues.push('CNPJ da empresa não está preenchido (Configurações → Empresa).');
  if (!company?.tax_regime) issues.push('Regime tributário não definido (Configurações → Fiscal).');

  const partItems = (items || []).filter(i => !i.type || i.type === 'part');
  if (partItems.length === 0) {
    issues.push('A venda não tem peças. Serviços/mão de obra exigem NFS-e (prefeitura).');
    return issues;
  }
  const semNcm = [];
  for (const it of partItems) {
    const pid = it.id || it.part_id;
    const part = pid ? partsById?.[pid] : null;
    if (!part || !part.ncm) semNcm.push(it.description || 'peça');
  }
  if (semNcm.length) {
    issues.push(`Peça(s) sem NCM cadastrado: ${semNcm.join(', ')}. Preencha o NCM no cadastro da peça.`);
  }
  return issues;
}

export const NFE_STATUS_LABEL = {
  rascunho: 'Rascunho',
  validando: 'Validando',
  enviada: 'Processando na SEFAZ',
  autorizada: 'Autorizada',
  rejeitada: 'Rejeitada',
  cancelada: 'Cancelada',
};

export const NFE_STATUS_COLOR = {
  rascunho: 'bg-gray-100 text-gray-700',
  validando: 'bg-blue-100 text-blue-700',
  enviada: 'bg-yellow-100 text-yellow-700',
  autorizada: 'bg-green-100 text-green-700',
  rejeitada: 'bg-red-100 text-red-700',
  cancelada: 'bg-gray-100 text-gray-500',
};
