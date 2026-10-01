import { perfil } from './perfil.js';
export const AuthProvider = ({ children }) => children;
export const useAuth = () => {
  const p = perfil();
  return {
    user: p.user, isAuthenticated: true, isLoadingAuth: false, authError: null,
    precisaTrocarSenha: false,
    login: async () => p.user, logout: async () => {}, trocarSenha: async () => {}, refreshUser: async () => {},
  };
};
