// Backend function: emite NFC-e (modelo 65) ou NF-e (modelo 55) a partir de uma
// venda (Sale) ou ordem de serviço (WorkOrder), usando o gateway Focus NFe.
//
// Chamada pelo frontend:
//   base44.functions.invoke('emitirNota', { tipo: 'nfce', sale_id })
//   base44.functions.invoke('emitirNota', { tipo: 'nfe', work_order_id })
//
// Segredo necessário (base44 secrets set):
//   FOCUS_NFE_TOKEN  -> token da conta Focus NFe do provedor
import { createClientFromRequest } from 'npm:@base44/sdk';
import {
  focusBaseUrl, focusAuthHeader, buildItens, buildNFCePayload, buildNFePayload,
} from '../_shared/focus.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 });

    const token = Deno.env.get('FOCUS_NFE_TOKEN');
    if (!token) {
      return Response.json({ error: 'Integração fiscal não configurada (FOCUS_NFE_TOKEN ausente).' }, { status: 500 });
    }

    const { tipo = 'nfce', sale_id, work_order_id } = await req.json();
    if (!sale_id && !work_order_id) {
      return Response.json({ error: 'Informe sale_id ou work_order_id.' }, { status: 400 });
    }
    if (tipo !== 'nfce' && tipo !== 'nfe') {
      return Response.json({ error: 'tipo deve ser "nfce" ou "nfe".' }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    // Carrega a origem (venda ou OS) e normaliza itens/total/pagamento
    let companyId, customerId, saleItems, total, pagamento, origem;
    if (sale_id) {
      const sale = await svc.entities.Sale.get(sale_id);
      if (!sale) return Response.json({ error: 'Venda não encontrada.' }, { status: 404 });
      companyId = sale.company_id;
      customerId = sale.customer_id;
      saleItems = sale.items || [];
      total = sale.total;
      pagamento = sale.payment_method;
      origem = { entity: 'Sale', id: sale.id };
    } else {
      const wo = await svc.entities.WorkOrder.get(work_order_id);
      if (!wo) return Response.json({ error: 'Ordem de serviço não encontrada.' }, { status: 404 });
      companyId = wo.company_id;
      customerId = wo.customer_id;
      // Na OS, só as peças entram na nota fiscal de mercadoria
      saleItems = (wo.parts_items || []).map(p => ({
        type: 'part', id: p.part_id, description: p.description,
        quantity: p.quantity, unit_price: p.unit_price, total_price: p.total_price,
      }));
      total = wo.parts_total;
      pagamento = 'dinheiro';
      origem = { entity: 'WorkOrder', id: wo.id };
    }

    const company = await svc.entities.Company.get(companyId);
    if (!company) return Response.json({ error: 'Empresa não encontrada.' }, { status: 404 });
    if (!company.nfe_enabled) {
      return Response.json({ error: 'Módulo fiscal desabilitado para esta empresa. Ative em Configurações → Fiscal.' }, { status: 400 });
    }
    if (!company.cnpj) {
      return Response.json({ error: 'CNPJ da empresa não configurado.' }, { status: 400 });
    }

    let customer = null;
    if (customerId) {
      try { customer = await svc.entities.Customer.get(customerId); } catch { /* opcional */ }
    }

    // Enriquece itens com dados fiscais das peças (NCM, CFOP, unidade)
    const partIds = [...new Set(saleItems.filter(i => (!i.type || i.type === 'part') && i.id).map(i => i.id))];
    const partsById = {};
    for (const pid of partIds) {
      try { partsById[pid] = await svc.entities.Part.get(pid); } catch { /* usa defaults */ }
    }

    const items = buildItens(saleItems, partsById, company.tax_regime);
    if (items.length === 0) {
      return Response.json({ error: 'Nenhuma mercadoria para emitir. Serviços (mão de obra) exigem NFS-e municipal.' }, { status: 400 });
    }
    const totalMercadorias = items.reduce((s, i) => s + i.valor_bruto, 0);

    // Cria o registro da nota (rascunho -> validando)
    const nfeRecord = await svc.entities.NFeRecord.create({
      company_id: companyId,
      customer_id: customerId || undefined,
      sale_id: sale_id || undefined,
      work_order_id: work_order_id || undefined,
      status: 'validando',
      series: tipo === 'nfce' ? (company.nfce_series || '1') : (company.nfe_series || '1'),
      total_amount: +totalMercadorias.toFixed(2),
      items,
      cfop: items[0]?.cfop,
      taxes: { tipo },
      emitted_at: new Date().toISOString(),
    });

    // Monta o payload conforme o tipo e envia ao gateway
    const ambiente = company.nfe_environment || 'homologacao';
    const base = focusBaseUrl(ambiente);
    const ref = nfeRecord.id;
    const path = tipo === 'nfce' ? 'nfce' : 'nfe';
    const payload = tipo === 'nfce'
      ? buildNFCePayload({ company, customer, items, total: totalMercadorias, pagamento })
      : buildNFePayload({ company, customer, items, total: totalMercadorias, pagamento });

    const resp = await fetch(`${base}/v2/${path}?ref=${encodeURIComponent(ref)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: focusAuthHeader(token) },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));

    // Interpreta a resposta do gateway
    const status = data.status; // processando_autorizacao | autorizado | erro_autorizacao | denegado
    const update = {}; // NÃO redefinir taxes aqui — o tipo salvo na criação é usado na consulta

    if (status === 'autorizado') {
      update.status = 'autorizada';
      update.protocol = data.protocolo || '';
      update.number = data.numero || nfeRecord.number;
      update.authorized_at = new Date().toISOString();
      if (data.caminho_danfe) update.danfe_url = base + data.caminho_danfe;
      if (data.caminho_xml_nota_fiscal) update.xml_url = base + data.caminho_xml_nota_fiscal;
    } else if (status === 'processando_autorizacao') {
      update.status = 'enviada'; // consultar depois
    } else {
      update.status = 'rejeitada';
      update.rejection_reason = data.mensagem_sefaz || data.mensagem || data.erros?.[0]?.mensagem || 'Erro ao autorizar. Verifique os dados fiscais.';
    }

    const updated = await svc.entities.NFeRecord.update(nfeRecord.id, update);

    // Vincula a nota à venda/OS
    try {
      if (origem.entity === 'Sale') await svc.entities.Sale.update(origem.id, { nfe_id: nfeRecord.id });
      else await svc.entities.WorkOrder.update(origem.id, { nfe_id: nfeRecord.id });
    } catch { /* não crítico */ }

    return Response.json({ data: { nfe_id: nfeRecord.id, status: update.status, record: updated } });
  } catch (error) {
    return Response.json({ error: error?.message || 'Erro interno ao emitir nota.' }, { status: 500 });
  }
});
