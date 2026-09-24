import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ClipboardList, Package, CreditCard, TrendingUp,
  AlertTriangle, Plus, ShoppingCart, Users, Wrench,
  ArrowRight, CheckCircle2, Clock
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import FinancialPanel from '@/components/FinancialPanel';
import { hoje, diaLocal, diaDoRegistro } from '@/lib/datas';
import { estaVencido, emAberto } from '@/lib/crediario';
import { vendaValida } from '@/lib/caixa';
import { estoqueBaixo } from '@/lib/estoque';

export default function Dashboard() {
  const { company } = useCompany();
  const [stats, setStats] = useState({
    todaySales: 0, openOrders: 0, lowStockCount: 0, overdueCredit: 0,
    weekSales: [], recentOrders: [], lowStockParts: [], overdueItems: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (company?.id) loadDashboard();
  }, [company]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const today = hoje();
      const [orders, sales, parts, credits] = await Promise.all([
        base44.entities.WorkOrder.filter({ company_id: company.id }),
        base44.entities.Sale.filter({ company_id: company.id }),
        base44.entities.Part.filter({ company_id: company.id }),
        base44.entities.CreditTitle.filter({ company_id: company.id })
      ]);

      // Venda cancelada teve o dinheiro devolvido: não é venda de hoje.
      const todaySales = sales.filter(s => vendaValida(s) && diaDoRegistro(s.created_date) === today);
      const todayTotal = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);

      const openOrders = orders.filter(o => ['aberta', 'em_andamento', 'aguardando_peca'].includes(o.status));
      const lowStockParts = parts.filter(estoqueBaixo);
      // Vencido sai da DATA, não do status. 'vencido' nunca é gravado no
      // banco — só existe em memória na tela de Crediário —, então filtrar
      // por ele dava sempre vazio, e este card dizia "Nada em atraso!" para
      // qualquer oficina. O mesmo bug já corrigido no relatório gerencial.
      // Mais antigas primeiro: as cinco que aparecem são as que mais pesam.
      const overdueItems = credits
        .filter(c => estaVencido(c, today))
        .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));

      // Last 7 days sales
      const weekSales = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const dateStr = diaLocal(d);
        const dayName = d.toLocaleDateString('pt-BR', { weekday: 'short' });
        const daySales = sales.filter(s => vendaValida(s) && diaDoRegistro(s.created_date) === dateStr);
        return { day: dayName, total: daySales.reduce((sum, s) => sum + (s.total || 0), 0) };
      });

      setStats({
        todaySales: todayTotal,
        openOrders: openOrders.length,
        lowStockCount: lowStockParts.length,
        // Em aberto = total − pago. remaining_amount é coluna derivada e
        // pode ter ficado para trás.
        overdueCredit: overdueItems.reduce((sum, c) => sum + Math.round(emAberto(c) * 100), 0) / 100,
        weekSales,
        recentOrders: openOrders.slice(0, 5),
        lowStockParts: lowStockParts.slice(0, 5),
        overdueItems: overdueItems.slice(0, 5)
      });
    } catch (e) {
      console.error('Dashboard error:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!company) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <Wrench className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Nenhuma empresa configurada</h2>
        <p className="text-gray-500 mb-6">Configure sua oficina para começar</p>
        <Link to="/configuracoes">
          <Button className="bg-red-600 hover:bg-red-700 text-white">Configurar Empresa</Button>
        </Link>
      </div>
    );
  }

  const statCards = [
    { title: 'Vendas Hoje', value: formatCurrency(stats.todaySales), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50', link: '/relatorios' },
    { title: 'OS Abertas', value: stats.openOrders, icon: ClipboardList, color: 'text-blue-600', bg: 'bg-blue-50', link: '/ordens' },
    { title: 'Estoque Baixo', value: stats.lowStockCount, icon: Package, color: 'text-orange-600', bg: 'bg-orange-50', link: '/pecas' },
    { title: 'Crédito Vencido', value: formatCurrency(stats.overdueCredit), icon: CreditCard, color: 'text-red-600', bg: 'bg-red-50', link: '/crediario' },
  ];

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Bem-vindo ao {company.name}</p>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
        <Link to="/ordens/nova">
          <Button className="bg-red-600 hover:bg-red-700 text-white whitespace-nowrap">
            <Plus className="w-4 h-4 mr-2" />Nova OS
          </Button>
        </Link>
        <Link to="/pdv">
          <Button variant="outline" className="whitespace-nowrap">
            <ShoppingCart className="w-4 h-4 mr-2" />PDV Rápido
          </Button>
        </Link>
        <Link to="/clientes/novo">
          <Button variant="outline" className="whitespace-nowrap">
            <Users className="w-4 h-4 mr-2" />Novo Cliente
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map(({ title, value, icon: Icon, color, bg, link }) => (
          <Link key={title} to={link}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{loading ? '...' : value}</p>
                <p className="text-xs text-gray-500 mt-1">{title}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Financial Panel */}
      <div className="mb-6">
        <FinancialPanel />
      </div>

      {/* Charts + Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly sales chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Vendas dos Últimos 7 Dias</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-40 flex items-center justify-center text-gray-400">Carregando...</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.weekSales}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Bar dataKey="total" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Low stock alerts */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />Estoque Baixo
              </CardTitle>
              <Link to="/pecas" className="text-xs text-red-600 hover:underline">Ver todos</Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-gray-400 text-sm">Carregando...</div> :
              stats.lowStockParts.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Estoque em dia!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {stats.lowStockParts.map(part => (
                    <div key={part.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <div>
                        <p className="text-xs font-medium text-gray-800 truncate max-w-28">{part.description}</p>
                        <p className="text-xs text-gray-400">{part.sku}</p>
                      </div>
                      <Badge className="bg-orange-100 text-orange-800 text-xs">{part.stock_quantity} un</Badge>
                    </div>
                  ))}
                </div>
              )
            }
          </CardContent>
        </Card>

        {/* Recent open orders */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-700">OS em Aberto</CardTitle>
              <Link to="/ordens" className="text-xs text-red-600 hover:underline flex items-center gap-1">
                Ver todas <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-gray-400 text-sm">Carregando...</div> :
              stats.recentOrders.length === 0 ? (
                <div className="text-center py-6">
                  <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Nenhuma OS aberta</p>
                  <Link to="/ordens/nova">
                    <Button size="sm" className="mt-3 bg-red-600 hover:bg-red-700 text-white">Nova OS</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {stats.recentOrders.map(order => (
                    <Link key={order.id} to={`/ordens/${order.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                            <ClipboardList className="w-4 h-4 text-gray-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">OS #{order.order_number || order.id.slice(-6)}</p>
                            <p className="text-xs text-gray-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />{formatDate(order.opened_at || order.created_date)}
                            </p>
                          </div>
                        </div>
                        <Badge className={`text-xs ${getStatusColor(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            }
          </CardContent>
        </Card>

        {/* Overdue credit */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-red-500" />Crédito Vencido
              </CardTitle>
              <Link to="/crediario" className="text-xs text-red-600 hover:underline">Ver tudo</Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-gray-400 text-sm">Carregando...</div> :
              stats.overdueItems.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Nada em atraso!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {stats.overdueItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <div>
                        <p className="text-xs font-medium text-gray-800">Parc. {item.installment_number}/{item.total_installments}</p>
                        <p className="text-xs text-gray-400">Venc: {formatDate(item.due_date)}</p>
                      </div>
                      <p className="text-xs font-bold text-red-600">{formatCurrency(emAberto(item))}</p>
                    </div>
                  ))}
                </div>
              )
            }
          </CardContent>
        </Card>
      </div>
    </div>
  );
}