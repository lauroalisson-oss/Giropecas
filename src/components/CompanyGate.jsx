import React from 'react';
import { Link } from 'react-router-dom';
import { useCompany } from '@/lib/CompanyContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, ShieldCheck, ChevronRight, Plus } from 'lucide-react';

// Telas operacionais (clientes, OS, estoque...) pertencem a UMA oficina.
//
// O provedor não é inquilino: ele não tem oficina própria. Sem este portão,
// ele cairia dentro da primeira empresa da lista e passaria a ver — e pior,
// criar — dados dentro da oficina de um cliente sem perceber.
//
// Então, quando ele quiser usar essas telas (para dar suporte), precisa
// escolher explicitamente em qual oficina está entrando.
export default function CompanyGate({ children }) {
  const { company, companies, loading, ehProvedor, switchCompany } = useCompany();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (company) return children;

  // Provedor sem oficina escolhida
  if (ehProvedor) {
    return (
      <div className="p-4 lg:p-6 max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Você está como provedor</h1>
          <p className="text-gray-500 text-sm mt-2">
            Esta tela pertence a uma oficina. Escolha em qual você quer entrar —
            ou vá para o painel do provedor.
          </p>
        </div>

        <Link to="/admin/chaves">
          <Button className="w-full bg-red-600 hover:bg-red-700 text-white mb-6">
            <ShieldCheck className="w-4 h-4 mr-2" />Ir para o Painel do Provedor
          </Button>
        </Link>

        {companies.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Building2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Nenhuma oficina cadastrada ainda.</p>
              <Link to="/admin/chaves">
                <Button size="sm" variant="outline" className="mt-3">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Cadastrar a primeira
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">
              Entrar numa oficina (suporte)
            </p>
            <div className="space-y-2">
              {companies.map(c => (
                <button key={c.id} onClick={() => switchCompany(c)}
                  className="w-full flex items-center gap-3 p-3 bg-white border rounded-lg hover:border-red-300 hover:bg-red-50 transition-colors text-left">
                  <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{c.name}</p>
                    {c.email && <p className="text-xs text-gray-500 truncate">{c.email}</p>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Ao entrar, você verá os dados daquela oficina. Use com cuidado:
              o que for criado fica no cadastro dela.
            </p>
          </div>
        )}
      </div>
    );
  }

  // Lojista sem oficina: só acontece se o provisionamento não concluiu.
  return (
    <div className="p-4 lg:p-6 max-w-lg mx-auto text-center py-20">
      <Building2 className="w-12 h-12 text-gray-200 mx-auto mb-4" />
      <h1 className="text-lg font-bold text-gray-900">Oficina não encontrada</h1>
      <p className="text-gray-500 text-sm mt-2">
        Seu acesso ainda não está vinculado a uma oficina. Entre em contato com o
        suporte para concluir a liberação.
      </p>
    </div>
  );
}
