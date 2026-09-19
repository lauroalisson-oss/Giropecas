// Adaptador de autenticação: mantém a interface que as telas já usam
// (`auth.me()`, `auth.logout()`, ...) sobre o Supabase Auth.
//
// Sistema FECHADO: não há auto-cadastro. O super-admin provisiona a
// empresa e entrega e-mail + senha temporária. Por isso `register` não
// existe aqui — tentar chamá-lo é erro de uso, não falta de implementação.

import { supabase } from './supabaseClient';

// Junta o usuário do Auth com o perfil (empresa, super-admin, onboarding).
// As telas leem `user.email`; o resto vem do banco.
async function comPerfil(user) {
  if (!user) return null;
  const { data: perfil } = await supabase
    .from('profiles')
    .select('company_id, is_super_admin, must_change_password, onboarding_status, full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email,
    full_name: perfil?.full_name || user.user_metadata?.full_name || '',
    company_id: perfil?.company_id || null,
    is_super_admin: perfil?.is_super_admin === true,
    must_change_password: perfil?.must_change_password === true,
    onboarding_status: perfil?.onboarding_status || 'pendente',
    role: perfil?.role || 'user',
  };
}

export const auth = {
  async me() {
    const { data: { user } } = await supabase.auth.getUser();
    return comPerfil(user);
  },

  async isAuthenticated() {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
  },

  async loginViaEmailPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: (email || '').trim().toLowerCase(),
      password,
    });
    if (error) {
      // Mensagem genérica de propósito: não revelar se o e-mail existe.
      throw new Error(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : error.message,
      );
    }
    return comPerfil(data.user);
  },

  async logout() {
    await supabase.auth.signOut();
  },

  // Troca de senha no primeiro acesso (senha temporária -> definitiva).
  async trocarSenha(novaSenha) {
    if (!novaSenha || novaSenha.length < 8) {
      throw new Error('A nova senha precisa ter ao menos 8 caracteres.');
    }
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) throw new Error(error.message);
    // Libera o acesso: enquanto must_change_password for true, o app
    // só mostra a tela de troca.
    const { error: e2 } = await supabase.rpc('mark_password_changed');
    if (e2) throw new Error(e2.message);
    return true;
  },

  async concluirOnboarding() {
    const { error } = await supabase.rpc('mark_onboarding_complete');
    if (error) throw new Error(error.message);
    return true;
  },

  // Recuperação de senha (o lojista esqueceu a definitiva).
  async resetPasswordRequest(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(
      (email || '').trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/redefinir-senha` },
    );
    if (error) throw new Error(error.message);
    return true;
  },

  async resetPassword(novaSenha) {
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) throw new Error(error.message);
    return true;
  },

  onAuthStateChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      callback(sessao);
    });
    return () => data.subscription.unsubscribe();
  },

  register() {
    throw new Error(
      'Este sistema é fechado: o acesso é criado pelo provedor. ' +
      'Solicite seu login ao administrador.',
    );
  },
};
