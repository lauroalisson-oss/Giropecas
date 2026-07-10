// Backend function: consulta o status de uma nota no gateway e atualiza o
// NFeRecord (usado quando a nota ficou "enviada"/processando).
//
//   base44.functions.invoke('consultarNota', { nfe_id })
import { createClientFromRequest } from 'npm:@base44/sdk';
import { focusBaseUrl, focusAuthHeader } from '../_shared/focus.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 });

    const token = Deno.env.get('FOCUS_NFE_TOKEN');
    if (!token) return Response.json({ error: 'FOCUS_NFE_TOKEN ausente.' }, { status: 500 });

    const { nfe_id } = await req.json();
    if (!nfe_id) return Response.json({ error: 'Informe nfe_id.' }, { status: 400 });

    const svc = base44.asServiceRole;
    const nfe = await svc.entities.NFeRecord.get(nfe_id);
    if (!nfe) return Response.json({ error: 'Nota não encontrada.' }, { status: 404 });

    const company = await svc.entities.Company.get(nfe.company_id);
    const ambiente = company?.nfe_environment || 'homologacao';
    const base = focusBaseUrl(ambiente);
    const tipo = (nfe.taxes && nfe.taxes.tipo) || 'nfce';

    const resp = await fetch(`${base}/v2/${tipo}/${encodeURIComponent(nfe_id)}`, {
      headers: { Authorization: focusAuthHeader(token) },
    });
    const data = await resp.json().catch(() => ({}));

    const status = data.status;
    const update = {};
    if (status === 'autorizado') {
      update.status = 'autorizada';
      update.protocol = data.protocolo || nfe.protocol;
      update.number = data.numero || nfe.number;
      update.authorized_at = new Date().toISOString();
      if (data.caminho_danfe) update.danfe_url = base + data.caminho_danfe;
      if (data.caminho_xml_nota_fiscal) update.xml_url = base + data.caminho_xml_nota_fiscal;
    } else if (status === 'processando_autorizacao') {
      update.status = 'enviada';
    } else if (status === 'cancelado') {
      update.status = 'cancelada';
    } else if (status) {
      update.status = 'rejeitada';
      update.rejection_reason = data.mensagem_sefaz || data.mensagem || 'Erro ao autorizar.';
    }

    const updated = Object.keys(update).length
      ? await svc.entities.NFeRecord.update(nfe_id, update)
      : nfe;

    return Response.json({ data: { nfe_id, status: update.status || nfe.status, record: updated } });
  } catch (error) {
    return Response.json({ error: error?.message || 'Erro ao consultar nota.' }, { status: 500 });
  }
});
