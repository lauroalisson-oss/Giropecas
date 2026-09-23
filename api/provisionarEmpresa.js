// Provisionamento de uma nova oficina — sistema fechado.
//
// Só o super-admin provisiona. Cria, numa tacada:
//   1. o usuário de acesso, com senha temporária
//   2. a oficina (company)
//   3. o vínculo do perfil com a oficina, marcado para trocar a senha
//   4. a licença já ativa (plano, limite de notas e validade)
//
// Roda NO SERVIDOR porque usa a chave service_role, que ignora toda a RLS
// e por isso jamais pode ir para o navegador.

import { createClient } from '@supabase/supabase-js';

// Lidas a cada chamada, não na carga do módulo — ver api/_lib/contexto.js.
const config = () => ({
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

// Sem os ambíguos (O/0, I/l/1) — a senha é digitada à mão pelo lojista.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function senhaTemporaria(tamanho = 12) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(tamanho));
  let s = '';
  for (const b of bytes) s += ALFABETO[b % ALFABETO.length];
  return s;
}

function erro(res, status, mensagem, code) {
  return res.status(status).json({ error: mensagem, ...(code ? { code } : {}) });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido.');
  const { url: URL, serviceRole: SERVICE_ROLE } = config();
  if (!URL || !SERVICE_ROLE) {
    return erro(res, 500, 'Servidor sem configuração do Supabase (SUPABASE_SERVICE_ROLE_KEY ausente).');
  }

  // --- 1. Quem está chamando? -------------------------------------------
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return erro(res, 401, 'Não autenticado.');

  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: { user }, error: errUser } = await admin.auth.getUser(token);
  if (errUser || !user) return erro(res, 401, 'Sessão inválida.');

  // --- 2. É super-admin? Confere no banco, não no e-mail. ---------------
  const { data: perfil } = await admin
    .from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle();
  if (!perfil?.is_super_admin) return erro(res, 403, 'Apenas o provedor pode provisionar empresas.');

  // --- 3. Entrada --------------------------------------------------------
  const {
    nome_empresa, email, duracao_dias,
    plano = 'non_fiscal', limite_notas = 100,
  } = req.body || {};

  if (!nome_empresa?.trim()) return erro(res, 400, 'Informe o nome da oficina.');
  const emailLimpo = (email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLimpo)) return erro(res, 400, 'E-mail inválido.');
  const dias = Number(duracao_dias);
  if (!Number.isFinite(dias) || dias <= 0) return erro(res, 400, 'Informe a duração da licença em dias.');
  if (plano !== 'fiscal' && plano !== 'non_fiscal') return erro(res, 400, 'Plano inválido.');

  const senha = senhaTemporaria();
  let novoUserId = null;
  let empresaId = null;

  try {
    // --- 4. Usuário de acesso -------------------------------------------
    // email_confirm: true porque quem entrega a senha é o provedor; não há
    // e-mail de confirmação num sistema fechado.
    const { data: criado, error: errCreate } = await admin.auth.admin.createUser({
      email: emailLimpo,
      password: senha,
      email_confirm: true,
      user_metadata: { full_name: nome_empresa.trim() },
    });
    if (errCreate) {
      const jaExiste = /already/i.test(errCreate.message || '');
      return erro(res, jaExiste ? 409 : 400,
        jaExiste ? 'Já existe um acesso com esse e-mail.' : errCreate.message);
    }
    novoUserId = criado.user.id;

    // --- 5. Oficina ------------------------------------------------------
    const { data: empresa, error: errEmpresa } = await admin
      .from('companies')
      .insert({ name: nome_empresa.trim(), email: emailLimpo, created_by: user.email })
      .select().single();
    if (errEmpresa) throw new Error(`Erro ao criar a oficina: ${errEmpresa.message}`);
    empresaId = empresa.id;

    // --- 6. Vínculo + obrigação de trocar a senha ------------------------
    const { error: errPerfil } = await admin
      .from('profiles')
      .update({
        company_id: empresaId,
        role: 'owner',
        must_change_password: true,
        onboarding_status: 'pendente',
      })
      .eq('id', novoUserId);
    if (errPerfil) throw new Error(`Erro ao vincular o acesso à oficina: ${errPerfil.message}`);

    // --- 7. Licença já ativa ---------------------------------------------
    // O lojista não digita chave nenhuma: ela nasce ativa e vinculada.
    const expiraEm = new Date(Date.now() + dias * 86400000).toISOString();
    const { data: licenca, error: errLic } = await admin
      .from('access_keys')
      .insert({
        company_id: empresaId,
        key: `GIRO-${empresaId.slice(0, 8).toUpperCase()}`,
        duration_days: dias,
        plan_type: plano,
        fiscal_note_limit: plano === 'fiscal' ? Number(limite_notas) || 100 : null,
        status: 'active',
        client_name: nome_empresa.trim(),
        client_email: emailLimpo,
        activated_by: emailLimpo,
        activated_at: new Date().toISOString(),
        expires_at: expiraEm,
        created_by: user.email,
      })
      .select().single();
    if (errLic) throw new Error(`Erro ao criar a licença: ${errLic.message}`);

    return res.status(200).json({
      empresa: { id: empresaId, nome: empresa.name },
      acesso: { email: emailLimpo, senha_temporaria: senha },
      licenca: { expira_em: licenca.expires_at, plano, dias },
      aviso: 'Anote a senha temporária: ela não será exibida novamente.',
    });
  } catch (e) {
    // Não deixa acesso órfão se algum passo falhar no meio.
    if (empresaId) { try { await admin.from('companies').delete().eq('id', empresaId); } catch { /* ignore */ } }
    if (novoUserId) { try { await admin.auth.admin.deleteUser(novoUserId); } catch { /* ignore */ } }
    return erro(res, 500, e.message || 'Falha ao provisionar a empresa.');
  }
}
