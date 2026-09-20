// Contexto de uma chamada de API: quem é o usuário e qual oficina é a dele.
//
// As rotas de NFS-e usam o token do próprio lojista (não a service_role):
// assim a RLS continua valendo e é impossível uma oficina ler ou gravar
// dados de outra, mesmo que a rota tenha um erro de filtro.

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export function erro(res, status, mensagem, extra = {}) {
  return res.status(status).json({ error: mensagem, ...extra });
}

// Devolve { supabase, user, perfil } ou lança com a mensagem pronta para a tela.
export async function contexto(req) {
  if (!URL || !ANON) {
    const e = new Error('Servidor sem configuração do Supabase.');
    e.status = 500;
    throw e;
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    const e = new Error('Não autenticado.');
    e.status = 401;
    throw e;
  }

  // O token vai no header: toda consulta feita por este cliente passa pela
  // RLS como se fosse o próprio lojista.
  const supabase = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    const e = new Error('Sessão inválida ou expirada. Entre novamente.');
    e.status = 401;
    throw e;
  }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('id, email, company_id, role, is_super_admin')
    .eq('id', user.id)
    .maybeSingle();

  return { supabase, user, perfil };
}

// Licença ativa da oficina — é dela que saem o plano e o limite de notas.
// O super-admin não tem licença: ele não emite nota de oficina nenhuma.
export async function licencaAtiva(supabase, user) {
  const { data } = await supabase
    .from('access_keys')
    .select('id, status, plan_type, fiscal_note_limit, expires_at')
    .eq('activated_by', user.email)
    .order('expires_at', { ascending: false });

  const lista = data || [];
  return lista.find(k => k.status === 'active') || lista[0] || null;
}
