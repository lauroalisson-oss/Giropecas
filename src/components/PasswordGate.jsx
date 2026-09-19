import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import TrocarSenha from '@/pages/TrocarSenha';

// Portão do primeiro acesso.
//
// Enquanto profiles.must_change_password for true, NENHUMA rota protegida
// abre — nem digitando a URL direto. A troca é obrigatória, não um convite.
//
// Isso vale como defesa em profundidade, não como segurança em si: o que
// realmente protege os dados é a RLS no banco.
export default function PasswordGate() {
  const { isLoadingAuth, isAuthenticated, precisaTrocarSenha } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (precisaTrocarSenha) return <TrocarSenha />;

  return <Outlet />;
}
