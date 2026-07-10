// Backend function: cancela uma nota autorizada no gateway.
//
//   base44.functions.invoke('cancelarNota', { nfe_id, justificativa })
//
// A justificativa deve ter no mínimo 15 caracteres (exigência da SEFAZ) e o
// cancelamento só é permitido dentro do prazo legal (ex.: NFC-e ~30 min).
import { createClientFromRequest } from 'npm:@base44/sdk';
import { focusBaseUrl, focusAuthHeader } from '../_shared/focus.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 });

    const token = Deno.env.get('FOCUS_NFE_TOKEN');
    if (!token) return Response.json({ error: 'FOCUS_NFE_TOKEN ausente.' }, { status: 500 });

    const { nfe_id, justificativa } = await req.json();
    if (!nfe_id) return Response.json({ error: 'Informe nfe_id.' }, { status: 400 });
    if (!justificativa || justificativa.trim().length < 15) {
      return Response.json({ error: 'A justificativa deve ter pelo menos 15 caracteres.' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const nfe = await svc.entities.NFeRecord.get(nfe_id);
    if (!nfe) return Response.json({ error: 'Nota não encontrada.' }, { status: 404 });
    if (nfe.status !== 'autorizada') {
      return Response.json({ error: 'Só é possível cancelar notas autorizadas.' }, { status: 400 });
    }

    const company = await svc.entities.Company.get(nfe.company_id);
    const ambiente = company?.nfe_environment || 'homologacao';
    const base = focusBaseUrl(ambiente);
    const tipo = (nfe.taxes && nfe.taxes.tipo) || 'nfce';

    const resp = await fetch(`${base}/v2/${tipo}/${encodeURIComponent(nfe_id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: focusAuthHeader(token) },
      body: JSON.stringify({ justificativa: justificativa.trim() }),
    });
    const data = await resp.json().catch(() => ({}));

    if (data.status === 'cancelado' || resp.ok) {
      const updated = await svc.entities.NFeRecord.update(nfe_id, {
        status: 'cancelada',
        notes: `Cancelada: ${justificativa.trim()}`,
      });
      return Response.json({ data: { nfe_id, status: 'cancelada', record: updated } });
    }

    return Response.json({
      error: data.mensagem_sefaz || data.mensagem || 'Não foi possível cancelar (verifique o prazo legal).',
    }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error?.message || 'Erro ao cancelar nota.' }, { status: 500 });
  }
});
