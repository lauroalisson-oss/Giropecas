import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useCompany } from '@/lib/CompanyContext';
import { useLicense } from '@/lib/LicenseContext';
import { daysRemaining } from '@/lib/license';
import {
  LayoutDashboard, Users, Car, Package, Wrench, ClipboardList,
  ShoppingCart, CreditCard, FileText, BarChart3, Settings,
  LogOut, Menu, X, Bell, ChevronDown, Truck, History, HardHat, KeyRound,
  Wallet, TrendingUp, CalendarClock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/clientes', label: 'Clientes', icon: Users },
  { path: '/veiculos', label: 'Veículos', icon: Car },
  { path: '/pecas', label: 'Peças & Estoque', icon: Package },
  { path: '/servicos', label: 'Serviços', icon: Wrench },
  { path: '/tecnicos', label: 'Técnicos', icon: HardHat },
  { path: '/ordens', label: 'Ordens de Serviço', icon: ClipboardList },
  { path: '/agenda', label: 'Agenda', icon: CalendarClock },
  { path: '/pdv', label: 'PDV Rápido', icon: ShoppingCart },
  { path: '/crediario', label: 'Crediário', icon: CreditCard },
  { path: '/contas-pagar', label: 'Contas a Pagar', icon: Wallet },
  { path: '/compras', label: 'Compras', icon: ShoppingCart },
  { path: '/fornecedores', label: 'Fornecedores', icon: Truck },
  { path: '/nfe', label: 'NF-e', icon: FileText },
  { path: '/historico', label: 'Histórico', icon: History },
  { path: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();
  const { company } = useCompany();
  const { superAdmin, license } = useLicense();

  const handleLogout = () => {
    logout('/login');
  };

  const displayName = user?.full_name || user?.email || 'Usuário';
  const initials = displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  const visibleNavItems = superAdmin
    ? [...navItems, { path: '/admin/chaves', label: 'Admin Provedor', icon: KeyRound }]
    : navItems;

  const licenseDays = license?.expires_at ? daysRemaining(license.expires_at) : null;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-30 w-64 bg-gray-950 flex flex-col transform transition-transform duration-300 lg:relative lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-800">
          <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm truncate">MotoGestão</p>
            <p className="text-gray-400 text-xs truncate">{company?.name || 'Selecione empresa'}</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <div className="space-y-0.5">
            {visibleNavItems.map(({ path, label, icon: Icon }) => {
              const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
              return (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-red-600 text-white"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white"
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-gray-800">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors">
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <AvatarFallback className="bg-red-600 text-white text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 text-left flex-1">
                  <p className="text-white text-xs font-medium truncate">{displayName}</p>
                  <p className="text-gray-500 text-xs truncate">{superAdmin ? 'super-admin' : (user?.role || 'user')}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52">
              <DropdownMenuItem asChild>
                <Link to="/configuracoes"><Settings className="w-4 h-4 mr-2" />Configurações</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="w-4 h-4 mr-2" />Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 lg:px-6 h-14 flex items-center gap-4 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-gray-500 hover:text-gray-900"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          {licenseDays !== null && (
            <Badge variant="outline" className={cn(
              "hidden sm:inline-flex gap-1 font-normal",
              licenseDays <= 5 ? "border-red-300 text-red-600" : "border-gray-200 text-gray-500"
            )}>
              <KeyRound className="w-3 h-3" />
              Licença: {licenseDays} {licenseDays === 1 ? 'dia' : 'dias'}
            </Badge>
          )}
          <Link to="/ordens/nova">
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white hidden sm:flex">
              <ClipboardList className="w-4 h-4 mr-2" />Nova OS
            </Button>
          </Link>
          <Link to="/pdv">
            <Button size="sm" variant="outline" className="hidden sm:flex">
              <ShoppingCart className="w-4 h-4 mr-2" />PDV
            </Button>
          </Link>
          <button className="relative text-gray-500 hover:text-gray-900 p-1">
            <Bell className="w-5 h-5" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex lg:hidden z-10">
        {[
          { path: '/', label: 'Dashboard', icon: LayoutDashboard },
          { path: '/clientes', label: 'Clientes', icon: Users },
          { path: '/ordens', label: 'OS', icon: ClipboardList },
          { path: '/pdv', label: 'PDV', icon: ShoppingCart },
          { path: '/pecas', label: 'Estoque', icon: Package },
        ].map(({ path, label, icon: Icon }) => {
          const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                "flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors",
                isActive ? "text-red-600" : "text-gray-500"
              )}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}