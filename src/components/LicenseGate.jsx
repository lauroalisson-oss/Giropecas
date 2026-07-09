import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useLicense } from '@/lib/LicenseContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyRound, Loader2, LogOut, ShieldAlert, Wrench } from 'lucide-react';

export default function LicenseGate({ children }) {
  const { status } = useLicense();

  if (status === 'licensed') return children;

  if (status === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-red-200 border-t-red-600 rounded-full animate-spin"></div>
          <p className="text-gray-500 text-sm">Verificando licença...</p>
        </div>
      </div>
    );
  }

  return <ActivationScreen expired={status === 'expired'} />;
}

function ActivationScreen({ expired }) {
  const { user, logout } = useAuth();
  const { activateKey } = useLicense();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleActivate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await activateKey(code);
    } catch (err) {
      setError(err.message || 'Não foi possível ativar a chave.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center mb-4">
            {expired ? <ShieldAlert className="w-7 h-7 text-white" /> : <Wrench className="w-7 h-7 text-white" />}
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {expired ? 'Sua licença expirou' : 'Ativação necessária'}
          </h1>
          <p className="text-gray-500 text-sm mt-2">
            {expired
              ? 'O período da sua chave de acesso terminou. Informe uma nova chave para continuar usando o Giropeças.'
              : 'Para usar o Giropeças você precisa de uma chave de acesso. Solicite a sua ao administrador do sistema.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm text-center">{error}</div>
        )}

        <form onSubmit={handleActivate} className="space-y-4">
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="GIRO-XXXX-XXXX-XXXX"
              className="pl-10 h-12 font-mono tracking-wider text-center"
              autoFocus
              maxLength={19}
            />
          </div>
          <Button type="submit" className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-medium" disabled={loading || !code.trim()}>
            {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Ativando...</>) : 'Ativar chave'}
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-sm">
          <span className="text-gray-400 truncate">{user?.email}</span>
          <button onClick={() => logout()} className="flex items-center gap-1 text-gray-500 hover:text-red-600">
            <LogOut className="w-4 h-4" />Sair
          </button>
        </div>
      </div>
    </div>
  );
}
