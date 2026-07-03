import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import { CompanyProvider } from '@/lib/CompanyContext';

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
import PDV from '@/pages/PDV';
import Crediario from '@/pages/Crediario';
import Fornecedores from '@/pages/Fornecedores';
import NFe from '@/pages/NFe';
import Relatorios from '@/pages/Relatorios';
import Historico from '@/pages/Historico';
import Configuracoes from '@/pages/Configuracoes';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-red-200 border-t-red-600 rounded-full animate-spin"></div>
          <p className="text-gray-500 text-sm">Carregando MotoGestão...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    else if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<CompanyProvider><Layout /></CompanyProvider>}>
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
          <Route path="/pdv" element={<PDV />} />
          <Route path="/crediario" element={<Crediario />} />
          <Route path="/fornecedores" element={<Fornecedores />} />
          <Route path="/nfe" element={<NFe />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
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