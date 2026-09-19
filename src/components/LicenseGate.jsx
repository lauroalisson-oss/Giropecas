import React from 'react';
import { useLicense } from '@/lib/LicenseContext';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Clock, LogOut } from 'lucide-react';

// Bloqueio por licença.
//
// Sistema fechado: não há campo para digitar chave nem renovação pelo
// próprio lojista. Vencida a licença, o acesso para e a renovação é
// solicitada ao provedor.
export default function LicenseGate({ children }) {
  const { status } = useLicense();

  if (status === 'licensed') return children;

  if (status === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-red-200 border-t-red-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Verificando licença...</p>
        </div>
      </div>
    );
  }

  return <AcessoBloqueado expirada={status === 'expired'} />;
}

function AcessoBloqueado({ expirada }) {
  const { logout, user } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          {expirada ? <Clock className="w-7 h-7 text-white" /> : <ShieldAlert className="w-7 h-7 text-white" />}
        </div>

        <h1 className="text-2xl font-bold text-gray-900">
          {expirada ? 'Sua licença venceu' : 'Acesso não liberado'}
        </h1>

        <p className="text-gray-600 text-sm mt-3">
          {expirada
            ? 'O período de uso contratado terminou e o sistema foi bloqueado. Para voltar a usar, solicite a renovação ao suporte.'
            : 'Não há uma licença ativa para este acesso. Fale com o suporte para liberar o uso do sistema.'}
        </p>

        <div className="mt-6 p-4 bg-white border rounded-xl text-sm text-gray-600">
          <p className="font-medium text-gray-800 mb-1">Fale com o suporte</p>
          <p>Informe o e-mail do seu acesso:</p>
          <p className="font-mono text-xs mt-1 bg-gray-50 border rounded px-2 py-1 inline-block">
            {user?.email || '—'}
          </p>
          <p className="mt-3 text-xs text-gray-500">
            Seus dados continuam guardados. Ao renovar, tudo volta como estava.
          </p>
        </div>

        <Button variant="outline" onClick={logout} className="mt-6">
          <LogOut className="w-4 h-4 mr-2" />Sair
        </Button>
      </div>
    </div>
  );
}
