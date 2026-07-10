// Backend function: cadastra (ou atualiza) a EMPRESA da oficina no provedor
// fiscal (Focus NFe), enviando o certificado digital A1 que a própria oficina
// subiu DENTRO do sistema. Assim cada empresa resolve tudo aqui — não precisa
// acessar o painel do provedor. Todas as empresas ficam sob a mesma conta
// (token do provedor), identificadas pelo CNPJ.
//
// Chamada pelo frontend (multipart, com o arquivo do certificado):
//   base44.functions.invoke('cadastrarEmpresaFiscal', {
//     company_id, certificado /* File .pfx */, senha_certificado
//   })
//
// Segredo necessário: FOCUS_NFE_TOKEN (token da conta do provedor)
import { createClientFromRequest } from 'npm:@base44/sdk';
import { focusBaseUrl, focusAuthHeader, buildEmpresaPayload, toBase64 } from '../_shared/focus.js';

const digits = (s) => String(s || '').replace(/\D/g, '');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 });

    const token = Deno.env.get('FOCUS_NFE_TOKEN');
    if (!token) return Response.json({ error: 'Integração fiscal não configurada (FOCUS_NFE_TOKEN ausente).' }, { status: 500 });

    // Lê os campos do multipart/form-data
    const form = await req.formData();
    const companyId = form.get('company_id');
    const file = form.get('certificado');
    const senha = form.get('senha_certificado');

    if (!companyId) return Response.json({ error: 'company_id é obrigatório.' }, { status: 400 });
    if (!file || typeof file === 'string') return Response.json({ error: 'Envie o arquivo do certificado A1 (.pfx).' }, { status: 400 });
    if (!senha) return Response.json({ error: 'Informe a senha do certificado.' }, { status: 400 });

    const svc = base44.asServiceRole;
    const company = await svc.entities.Company.get(companyId);
    if (!company) return Response.json({ error: 'Empresa não encontrada.' }, { status: 404 });
    if (!company.cnpj) return Response.json({ error: 'Preencha o CNPJ da empresa antes de cadastrar o certificado.' }, { status: 400 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const certificadoBase64 = toBase64(bytes);

    const payload = buildEmpresaPayload({ company, certificadoBase64, senhaCertificado: senha });

    // Cadastro/atualização é feito no ambiente de PRODUÇÃO do gateway
    // (o cadastro de empresa vale para os dois ambientes de emissão).
    const base = focusBaseUrl('producao');
    const cnpj = digits(company.cnpj);

    // Tenta criar; se a empresa já existir, atualiza (PUT por CNPJ)
    let resp = await fetch(`${base}/v2/empresas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: focusAuthHeader(token) },
      body: JSON.stringify(payload),
    });
    let data = await resp.json().catch(() => ({}));

    const jaExiste = resp.status === 422 || resp.status === 409 ||
      /existe|cadastrad/i.test(JSON.stringify(data || {}));
    if (!resp.ok && jaExiste) {
      resp = await fetch(`${base}/v2/empresas/${cnpj}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: focusAuthHeader(token) },
        body: JSON.stringify(payload),
      });
      data = await resp.json().catch(() => ({}));
    }

    if (!resp.ok) {
      const msg = data.mensagem || data.erros?.[0]?.mensagem || 'Falha ao cadastrar no provedor. Verifique o certificado e a senha.';
      await svc.entities.Company.update(companyId, { fiscal_status_message: msg });
      return Response.json({ error: msg }, { status: 400 });
    }

    // Sucesso — marca a empresa como cadastrada e guarda a validade do certificado
    const certExpira = data.certificado_valido_ate || data.data_vencimento_certificado || null;
    const update = {
      fiscal_registered: true,
      fiscal_status_message: 'Empresa cadastrada no provedor fiscal com sucesso.',
    };
    if (certExpira) update.fiscal_cert_expires_at = String(certExpira).slice(0, 10);
    const updated = await svc.entities.Company.update(companyId, update);

    return Response.json({ data: { registered: true, cert_expires_at: update.fiscal_cert_expires_at || null, company: updated } });
  } catch (error) {
    return Response.json({ error: error?.message || 'Erro ao cadastrar empresa no provedor fiscal.' }, { status: 500 });
  }
});
