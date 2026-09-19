// Autenticação sobre o Supabase.
//
// Sistema FECHADO: não há auto-cadastro nem login social. O acesso é criado
// pelo provedor, que entrega e-mail + senha temporária. Enquanto o usuário
// não trocar a senha, o app só permite a tela de troca (ver PasswordGate).

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const carregarUsuario = useCallback(async () => {
    try {
      setAuthError(null);
      const atual = await base44.auth.me();
      setUser(atual);
    } catch (e) {
      setUser(null);
      setAuthError(e.message || 'Falha ao verificar a sessão.');
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    carregarUsuario();
    // Mantém o app em sincronia com login/logout/refresh de token,
    // inclusive quando acontecem em outra aba.
    const cancelar = base44.auth.onAuthStateChange(() => { carregarUsuario(); });
    return cancelar;
  }, [carregarUsuario]);

  const login = useCallback(async (email, senha) => {
    const logado = await base44.auth.loginViaEmailPassword(email, senha);
    setUser(logado);
    return logado;
  }, []);

  const logout = useCallback(async () => {
    await base44.auth.logout();
    setUser(null);
  }, []);

  const trocarSenha = useCallback(async (novaSenha) => {
    await base44.auth.trocarSenha(novaSenha);
    await carregarUsuario();
  }, [carregarUsuario]);

  const value = {
    user,
    isAuthenticated: !!user,
    isLoadingAuth,
    authError,
    // Enquanto true, o app só mostra a troca de senha.
    precisaTrocarSenha: user?.must_change_password === true,
    login,
    logout,
    trocarSenha,
    refreshUser: carregarUsuario,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
};
