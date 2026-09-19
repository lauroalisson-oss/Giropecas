import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';

// Sistema fechado: só e-mail e senha. Não há cadastro nem login social —
// o acesso é criado pelo provedor e entregue ao lojista.
export default function Login() {
  const { login, isAuthenticated, isLoadingAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (isLoadingAuth) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await login(email, senha);
      // O PasswordGate decide se vai para a troca de senha ou para o app.
    } catch (err) {
      setErro(err.message || 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">GiroPeças</h1>
          <p className="text-gray-500 text-sm mt-1">Entre com o acesso enviado pelo suporte</p>
        </div>

        <form onSubmit={enviar} className="bg-white border rounded-xl p-6 space-y-4">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input id="email" type="email" className="pl-9" value={email} autoComplete="username"
                onChange={e => setEmail(e.target.value)} placeholder="oficina@email.com" required />
            </div>
          </div>

          <div>
            <Label htmlFor="senha">Senha</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input id="senha" type="password" className="pl-9" value={senha} autoComplete="current-password"
                onChange={e => setSenha(e.target.value)} placeholder="••••••••" required />
            </div>
          </div>

          {erro && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{erro}</p>
            </div>
          )}

          <Button type="submit" disabled={enviando} className="w-full bg-red-600 hover:bg-red-700 text-white">
            {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
            {enviando ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Ainda não tem acesso? Fale com o suporte para contratar o sistema.
        </p>
      </div>
    </div>
  );
}
