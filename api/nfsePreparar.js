// Passo 1 da emissão de NFS-e: montar a DPS.
//
// O certificado digital NÃO passa por aqui. Esta rota só monta o XML da
// declaração e reserva o número; quem assina e transmite ao Sefin é o
// aplicativo instalado no computador da oficina, onde o certificado está.
//
// Por que o XML é montado no servidor e não na tela: o número da DPS tem de
// ser sequencial e único por oficina, e os dados fiscais (CNPJ, Inscrição
// Municipal, alíquota, limite do plano) precisam ser conferidos onde o
// lojista não consegue alterá-los.

import { contexto, licencaAtiva, erro } from './_lib/contexto.js';
import { montarDps } from './_lib/nfse-dps.js';
import {
  checarLicenca, checarLimiteMensal, checarOrdem, inicioDoMes,
} from './_lib/nfse-regras.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido.');

  let ctx;
  try {
    ctx = await contexto(req);
  } catch (e) {
    return erro(res, e.status || 500, e.message);
  }
  const { supabase, user, perfil } = ctx;

  if (perfil?.is_super_admin) {
    return erro(res, 403, 'O provedor não emite nota de oficina. Entre com o acesso da oficina.');
  }
  if (!perfil?.company_id) {
    return erro(res, 403, 'Seu acesso não está vinculado a nenhuma oficina.');
  }

  const { work_order_id: ordemId } = req.body || {};
  if (!ordemId) return erro(res, 400, 'Informe a ordem de serviço.');

  try {
    // --- 1. Licença: plano fiscal e limite do mês --------------------------
    const licenca = await licencaAtiva(supabase, user);
    const barrouLicenca = checarLicenca(licenca);
    if (barrouLicenca) return erro(res, barrouLicenca.status, barrouLicenca.mensagem);

    const { count: emitidas } = await supabase
      .from('nfe_records')
      .select('id', { count: 'exact', head: true })
      .eq('model', 'nfse')
      .eq('status', 'autorizada')
      .gte('authorized_at', inicioDoMes().toISOString());

    const barrouLimite = checarLimiteMensal(licenca, emitidas);
    if (barrouLimite) return erro(res, barrouLimite.status, barrouLimite.mensagem);

    // --- 2. Ordem de serviço ----------------------------------------------
    // A RLS garante que só vem OS da própria oficina.
    const { data: ordem, error: errOrdem } = await supabase
      .from('work_orders').select('*').eq('id', ordemId).maybeSingle();
    if (errOrdem) throw new Error(errOrdem.message);

    // Já existe nota autorizada para esta OS?
    const { data: jaTem } = await supabase
      .from('nfe_records')
      .select('id, number, status')
      .eq('work_order_id', ordemId)
      .eq('model', 'nfse')
      .eq('status', 'autorizada')
      .maybeSingle();

    const barrouOrdem = checarOrdem(ordem, jaTem);
    if (barrouOrdem) {
      return erro(res, barrouOrdem.status, barrouOrdem.mensagem,
        barrouOrdem.nfe_id ? { nfe_id: barrouOrdem.nfe_id } : {});
    }
    const itens = ordem.service_items;

    // --- 3. Empresa, cliente e cadastro dos serviços ----------------------
    const { data: empresa } = await supabase
      .from('companies').select('*').eq('id', perfil.company_id).maybeSingle();
    if (!empresa) return erro(res, 404, 'Oficina não encontrada.');

    const { data: cliente } = ordem.customer_id
      ? await supabase.from('customers').select('*').eq('id', ordem.customer_id).maybeSingle()
      : { data: null };

    // Anexa o cadastro de cada serviço (código LC 116, alíquota, ISS retido).
    const ids = [...new Set(itens.map(i => i.service_id).filter(Boolean))];
    let porId = {};
    if (ids.length) {
      const { data: servicos } = await supabase.from('services').select('*').in('id', ids);
      porId = Object.fromEntries((servicos || []).map(s => [s.id, s]));
    }
    const servicos = itens.map(i => ({ ...i, servico: porId[i.service_id] || null }));

    // --- 4. Número da DPS --------------------------------------------------
    // Vem do banco, com incremento atômico: duas emissões ao mesmo tempo
    // nunca recebem o mesmo número (o Sefin rejeitaria a segunda).
    const { data: numero, error: errNum } = await supabase.rpc('proximo_numero_dps');
    if (errNum) throw new Error(`Não foi possível reservar o número da nota: ${errNum.message}`);

    // --- 5. Monta o XML ----------------------------------------------------
    const serie = empresa.nfse_series || '1';
    const producao = empresa.nfe_environment === 'producao';
    const dps = montarDps({ empresa, cliente, servicos, numero, serie, producao });

    // --- 6. Registra o rascunho -------------------------------------------
    // Fica como 'validando' até o desktop devolver o resultado. Se a emissão
    // falhar, a linha vira 'rejeitada' com o motivo — o lojista vê o que houve
    // em vez de a nota sumir.
    const { data: registro, error: errReg } = await supabase
      .from('nfe_records')
      .insert({
        company_id: perfil.company_id,
        work_order_id: ordemId,
        customer_id: ordem.customer_id || null,
        model: 'nfse',
        status: 'validando',
        series: serie,
        rps_series: serie,
        rps_number: String(numero),
        service_amount: dps.total,
        total_amount: dps.total,
        iss_amount: dps.iss,
        items: itens,
        // A DPS fica no campo dela. xml_content é reservado ao XML que o
        // governo devolve — são documentos diferentes e os dois importam.
        xml_dps: dps.xml,
        emitted_at: new Date().toISOString(),
        created_by: user.email,
      })
      .select().single();
    if (errReg) throw new Error(errReg.message);

    return res.status(200).json({
      nfe_id: registro.id,
      xmlDps: dps.xml,
      idInfDps: dps.id,
      numero,
      serie,
      producao,
      total: dps.total,
      iss: dps.iss,
      aliquota: dps.aliquota,
    });
  } catch (e) {
    // Erros de cadastro (sem IM, sem alíquota, código de serviço errado)
    // chegam aqui com a mensagem já escrita para o lojista.
    return erro(res, 400, e.message || 'Falha ao montar a nota.');
  }
}
