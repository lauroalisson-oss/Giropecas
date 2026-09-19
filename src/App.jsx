import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import Layout from '@/components/Layout';
import { CompanyProvider } from '@/lib/CompanyContext';
import { LicenseProvider } from '@/lib/LicenseContext';
import LicenseGate from '@/components/LicenseGate';

// Pages
import Dashboard from '@/pages/Dashboard';
import Clientes from '@/pages/Clientes';
import ClienteForm from '@/pages/ClienteForm';
import ClienteDetalhe from '@/pages/ClienteDetalhe';
import Veiculos from '@/pages/Veiculos';
import VeiculoForm from '@/pages/VeiculoForm';
import VeiculoDetalhe from '@/pages/VeiculoDetalhe';
import Pecas from '@/pages/Pecas';
import PecaForm from '@/pages/PecaForm';
import Servicos from '@/pages/Servicos';
import Ordens from '@/pages/Ordens';
import OrdemForm from '@/pages/OrdemForm';
import OrdemDetalhe from '@/pages/OrdemDetalhe';
import Agenda from '@/pages/Agenda';
import PDV from '@/pages/PDV';
import Crediario from '@/pages/Crediario';
import ContasPagar from '@/pages/ContasPagar';
import Compras from '@/pages/Compras';
import Fornecedores from '@/pages/Fornecedores';
import NFe from '@/pages/NFe';
import Relatorios from '@/pages/Relatorios';
import Historico from '@/pages/Historico';
import Configuracoes from '@/pages/Configuracoes';
import Tecnicos from '@/pages/Tecnicos';
import AdminChaves from '@/pages/AdminChaves';
import Login from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import PasswordGate from '@/components/PasswordGate';

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-red-200 border-t-red-600 rounded-full animate-spin"></div>
          <p className="text-gray-500 text-sm">Carregando MotoGestão...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Sistema fechado: sem /register. O acesso é criado pelo provedor. */}
      <Route path="/esqueci-senha" element={<ForgotPassword />} />
      <Route path="/redefinir-senha" element={<ResetPassword />} />
      {/* PasswordGate: exige a troca da senha temporária antes de abrir o app. */}
      <Route element={<PasswordGate />}>
        <Route element={
          <LicenseProvider>
            <LicenseGate>
              <CompanyProvider><Layout /></CompanyProvider>
            </LicenseGate>
          </LicenseProvider>
        }>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/novo" element={<ClienteForm />} />
          <Route path="/clientes/:id" element={<ClienteDetalhe />} />
          <Route path="/clientes/:id/editar" element={<ClienteForm />} />
          <Route path="/veiculos" element={<Veiculos />} />
          <Route path="/veiculos/novo" element={<VeiculoForm />} />
          <Route path="/veiculos/:id" element={<VeiculoDetalhe />} />
          <Route path="/veiculos/:id/editar" element={<VeiculoForm />} />
          <Route path="/pecas" element={<Pecas />} />
          <Route path="/pecas/nova" element={<PecaForm />} />
          <Route path="/pecas/:id" element={<PecaForm />} />
          <Route path="/servicos" element={<Servicos />} />
          <Route path="/ordens" element={<Ordens />} />
          <Route path="/ordens/nova" element={<OrdemForm />} />
          <Route path="/ordens/:id" element={<OrdemDetalhe />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/pdv" element={<PDV />} />
          <Route path="/crediario" element={<Crediario />} />
          <Route path="/contas-pagar" element={<ContasPagar />} />
          <Route path="/compras" element={<Compras />} />
          <Route path="/fornecedores" element={<Fornecedores />} />
          <Route path="/nfe" element={<NFe />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/tecnicos" element={<Tecnicos />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/admin/chaves" element={<AdminChaves />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;