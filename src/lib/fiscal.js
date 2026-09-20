// Helpers de frontend para NFC-e / NF-e (notas de PEÇA).
//
// ATENÇÃO — estas funções ainda apontam para as backend functions do
// Base44, que não existem mais depois da migração para Supabase + Vercel.
// O caminho de NF-e/NFC-e está parado: chamá-lo hoje dá erro de endpoint.
//
// A nota de SERVIÇO (NFS-e), que é o foco do sistema, segue por outro
// caminho, já funcionando: veja `src/lib/nfse.js`. Lá a assinatura acontece
// no computador da oficina, com o certificado que nunca sai de lá.
//
// O envio do certificado a um gateway foi removido de propósito: ele
// contradizia esse modelo e mandaria o arquivo da oficina pela rede.
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

export const PLAN_LABELS = {
  non_fiscal: 'Não-Fiscal',
  fiscal: 'Fiscal (com emissão de NF)',
};

// Conta as notas autorizadas no mês corrente (para o medidor do plano).
export function notesThisMonth(nfes) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return (nfes || []).filter(n => {
    if (n.status !== 'autorizada') return false;
    const d = new Date(n.authorized_at || n.created_date || 0).getTime();
    return d >= monthStart;
  }).length;
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
