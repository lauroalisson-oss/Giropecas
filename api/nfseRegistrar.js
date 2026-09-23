// Passo 2 da emissão de NFS-e: guardar o resultado.
//
// O aplicativo da oficina assinou a DPS e transmitiu ao Sefin Nacional.
// Aqui só gravamos o que voltou de lá: a chave de acesso e o XML da nota,
// ou o motivo da recusa.
//
// Observação honesta sobre confiança: quem relata o resultado é o
// computador da oficina, porque só ele consegue falar com o Sefin (a
// conexão exige o certificado). O que fica guardado é o XML devolvido pelo
// governo — é ele, e não este registro, que vale como prova da nota.

import { contexto, erro } from './_lib/contexto.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido.');

  let ctx;
  try {
    ctx = await contexto(req);
  } catch (e) {
    return erro(res, e.status || 500, e.message);
  }
  const { supabase, perfil } = ctx;

  if (!perfil?.company_id) return erro(res, 403, 'Seu acesso não está vinculado a nenhuma oficina.');

  const {
    nfe_id: nfeId, chave_acesso: chave, xml_nfse: xmlNfse,
    xml_dps: xmlDps, erro: motivo,
  } = req.body || {};
  if (!nfeId) return erro(res, 400, 'Informe a nota que está sendo registrada.');
  if (!chave && !motivo) return erro(res, 400, 'Informe a chave de acesso ou o motivo da recusa.');

  try {
    // A RLS impede alcançar a nota de outra oficina; o filtro por status
    // impede reescrever uma nota já finalizada.
    const { data: registro } = await supabase
      .from('nfe_records')
      .select('id, status, work_order_id')
      .eq('id', nfeId)
      .maybeSingle();

    if (!registro) return erro(res, 404, 'Nota não encontrada.');
    if (registro.status === 'autorizada') {
      return erro(res, 409, 'Esta nota já está autorizada.');
    }
    if (registro.status === 'cancelada') {
      return erro(res, 409, 'Esta nota foi cancelada.');
    }

    if (motivo) {
      const { error } = await supabase
        .from('nfe_records')
        .update({ status: 'rejeitada', rejection_reason: String(motivo).slice(0, 2000) })
        .eq('id', nfeId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ status: 'rejeitada' });
    }

    // Cada documento no seu lugar, e NUNCA apagando o que já existe.
    //
    // Antes isto gravava `xml_content: xmlNfse || null`: se o Sefin não
    // devolvesse o XML da nota, o null apagava a DPS que estava ali, e a
    // oficina ficava com uma nota autorizada e nenhum documento — nada
    // para o contador, nada para o cliente. Um campo ausente na resposta
    // não pode custar o documento que já estava guardado.
    const campos = {
      status: 'autorizada',
      number: String(chave),
      verification_code: String(chave),
      authorized_at: new Date().toISOString(),
      rejection_reason: null,
    };
    if (xmlNfse) campos.xml_content = xmlNfse;
    if (xmlDps) campos.xml_dps = xmlDps;

    const { data: atualizada, error } = await supabase
      .from('nfe_records')
      .update(campos)
      .eq('id', nfeId)
      .select().single();
    if (error) {
      // O índice único barra gravar a mesma chave duas vezes.
      if (error.code === '23505') return erro(res, 409, 'Esta nota já foi registrada.');
      throw new Error(error.message);
    }

    // Liga a nota à OS, para o botão da tela saber que já foi emitida.
    if (registro.work_order_id) {
      await supabase.from('work_orders')
        .update({ nfe_id: nfeId }).eq('id', registro.work_order_id);
    }

    return res.status(200).json({ status: 'autorizada', nota: atualizada });
  } catch (e) {
    return erro(res, 500, e.message || 'Falha ao registrar a nota.');
  }
}
