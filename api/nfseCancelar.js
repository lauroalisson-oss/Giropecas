// Cancelamento de NFS-e — passo 1 (montar) e passo 3 (registrar).
//
// Mesma divisão da emissão: a nuvem monta o pedido e guarda o resultado;
// quem assina e transmite é o computador da oficina, onde está o
// certificado.
//
// Cancelar não apaga a nota: registra um evento ligado a ela. A nota
// continua no histórico, agora marcada como cancelada.

import { contexto, erro } from './_lib/contexto.js';
import { montarCancelamento } from '../shared/nfse-evento.js';
import { producaoDaNota } from '../shared/nfse-nota.js';
import { dataHoraLegivel } from '../shared/relogio-fiscal.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido.');

  let ctx;
  try {
    ctx = await contexto(req);
  } catch (e) {
    return erro(res, e.status || 500, e.message);
  }
  const { supabase, user, perfil } = ctx;

  if (!perfil?.company_id) return erro(res, 403, 'Seu acesso não está vinculado a nenhuma oficina.');

  const {
    nfe_id: nfeId, motivo, justificativa,
    // Passo 3: o desktop devolve o que o Sefin respondeu.
    confirmado, erro_sefin: erroSefin,
  } = req.body || {};

  if (!nfeId) return erro(res, 400, 'Informe a nota a cancelar.');

  try {
    // A RLS impede alcançar a nota de outra oficina.
    const { data: nota } = await supabase
      .from('nfe_records')
      .select('id, status, number, model, notes, xml_dps, xml_content')
      .eq('id', nfeId)
      .maybeSingle();

    if (!nota) return erro(res, 404, 'Nota não encontrada.');
    if (nota.model !== 'nfse') return erro(res, 400, 'Esta rota cancela apenas NFS-e.');
    if (nota.status === 'cancelada') return erro(res, 409, 'Esta nota já está cancelada.');
    if (nota.status !== 'autorizada') {
      return erro(res, 409, 'Só dá para cancelar uma nota autorizada.');
    }
    if (!nota.number) return erro(res, 400, 'Nota sem chave de acesso — não há o que cancelar no Sefin.');

    const { data: empresa } = await supabase
      .from('companies').select('cnpj, state, nfe_environment').eq('id', perfil.company_id).maybeSingle();

    // --- Passo 3: guardar o resultado ------------------------------------
    if (confirmado || erroSefin) {
      if (erroSefin) {
        // A nota continua autorizada: o cancelamento não passou.
        return res.status(200).json({ status: nota.status, erro: erroSefin });
      }
      const { error } = await supabase
        .from('nfe_records')
        .update({
          status: 'cancelada',
          // Hora da oficina: toLocaleString no servidor (UTC) registrava
          // o cancelamento das 21h como "00:00" do dia seguinte.
          notes: [nota.notes, `Cancelada em ${dataHoraLegivel(new Date(), empresa?.state)}: ${justificativa || ''}`]
            .filter(Boolean).join('\n'),
        })
        .eq('id', nfeId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ status: 'cancelada' });
    }

    // --- Passo 1: montar o pedido ----------------------------------------
    if (!empresa?.cnpj) return erro(res, 400, 'CNPJ da oficina não configurado.');

    // O ambiente é o da NOTA, não o atual da oficina: nota de homologação
    // se cancela em homologação, mesmo com a oficina já em produção.
    const producao = producaoDaNota(nota, empresa);
    const pedido = montarCancelamento({
      chaveAcesso: nota.number,
      cnpjAutor: empresa.cnpj,
      motivo,
      justificativa,
      producao,
      uf: empresa.state,
    });

    return res.status(200).json({
      nfe_id: nfeId,
      chave_acesso: nota.number,
      xmlEvento: pedido.xml,
      idInfPedReg: pedido.id,
      producao,
    });
  } catch (e) {
    // Erros de validação (justificativa curta, motivo inválido) chegam
    // aqui com a mensagem já escrita para o lojista.
    return erro(res, 400, e.message || 'Falha ao montar o cancelamento.');
  }
}
