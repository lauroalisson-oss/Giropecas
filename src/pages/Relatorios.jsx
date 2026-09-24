import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate, getStatusLabel } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Download, TrendingUp, TrendingDown, Package, ClipboardList } from 'lucide-react';
import FluxoCaixaTab from '@/components/relatorios/FluxoCaixaTab';
import RelatoriosGerenciais from '@/components/relatorios/RelatoriosGerenciais';
import { diaLocal, diaDoRegistro } from '@/lib/datas';
import { vendaValida } from '@/lib/caixa';
import { estoqueBaixo } from '@/lib/estoque';

const COLORS = ['#dc2626', '#1a1a1a', '#6b7280', '#f97316', '#22c55e'];

export default function Relatorios() {
  const { company } = useCompany();
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    sales: [], orders: [], parts: [], credits: [], accounting: []
  });

  useEffect(() => { if (company?.id) loadData(); }, [company, period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sales, orders, parts, credits, accounting] = await Promise.all([
        base44.entities.Sale.filter({ company_id: company.id }, '-created_date'),
        base44.entities.WorkOrder.filter({ company_id: company.id }),
        base44.entities.Part.filter({ company_id: company.id }),
        base44.entities.CreditTitle.filter({ company_id: company.id }),
        base44.entities.AccountingEntry.filter({ company_id: company.id }, '-date'),
      ]);
      setData({ sales, orders, parts, credits, accounting });
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const periodFilter = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (period === 'today') return d.toDateString() === now.toDateString();
    if (period === 'week') { const w = new Date(now); w.setDate(w.getDate() - 7); return d >= w; }
    if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (period === 'year') return d.getFullYear() === now.getFullYear();
    return true;
  };

  // Venda cancelada teve o dinheiro devolvido: não é faturamento.
  const filteredSales = data.sales.filter(s => vendaValida(s) && periodFilter(s.created_date));
  const totalRevenue = filteredSales.reduce((s, x) => s + (x.total || 0), 0);
  const totalOrders = data.orders.filter(o => periodFilter(o.created_date)).length;
  const avgTicket = filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0;
  const lowStockCount = data.parts.filter(estoqueBaixo).length;

  // Revenue by payment method
  const byMethod = filteredSales.reduce((acc, s) => {
    acc[s.payment_method] = (acc[s.payment_method] || 0) + (s.total || 0);
    return acc;
  }, {});
  const methodData = Object.entries(byMethod).map(([name, value]) => ({ name: getStatusLabel(name), value }));

  // Daily sales chart (last 30 days)
  const dailySales = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    const dateStr = diaLocal(d);
    const daySales = data.sales.filter(s => vendaValida(s) && diaDoRegistro(s.created_date) === dateStr);
    return { day: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), total: daySales.reduce((s, x) => s + (x.total || 0), 0) };
  });

  // OS by status
  const ordersByStatus = data.orders.filter(o => periodFilter(o.created_date)).reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});
  const statusData = Object.entries(ordersByStatus).map(([name, value]) => ({ name: getStatusLabel(name), value }));

  // Cash flow
  const cashFlow = data.accounting.filter(e => periodFilter(e.date)).reduce((acc, e) => {
    const key = e.date;
    if (!acc[key]) acc[key] = { date: key, receita: 0, despesa: 0 };
    if (e.type === 'credit') acc[key].receita += e.amount;
    else acc[key].despesa += e.amount;
    return acc;
  }, {});
  const cashFlowData = Object.values(cashFlow).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);

  const exportCSV = (rows, filename) => {
    if (rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename + '.csv'; a.click();
  };

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
          <p className="text-gray-500 text-sm">Análise e exportação de dados</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="week">Últimos 7 dias</SelectItem>
            <SelectItem value="month">Este mês</SelectItem>
            <SelectItem value="year">Este ano</SelectItem>
            <SelectItem value="all">Todo período</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Receita Total', value: formatCurrency(totalRevenue), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'OS Abertas', value: totalOrders, icon: ClipboardList, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Ticket Médio', value: formatCurrency(avgTicket), icon: TrendingDown, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Estoque Baixo', value: lowStockCount, icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-xl font-bold text-gray-900">{loading ? '...' : value}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="vendas">
        <TabsList className="mb-4">
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          <TabsTrigger value="os">OS</TabsTrigger>
          <TabsTrigger value="caixa">Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="gerenciais">Gerenciais</TabsTrigger>
          <TabsTrigger value="crediario">Crediário</TabsTrigger>
        </TabsList>

        <TabsContent value="vendas">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Vendas Diárias (30 dias)</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => exportCSV(dailySales, 'vendas-diarias')}>
                    <Download className="w-3 h-3 mr-1" />CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailySales}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={4} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => formatCurrency(v)} />
                    <Bar dataKey="total" fill="#dc2626" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Por Forma de Pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                {methodData.length === 0 ? <div className="text-center py-8 text-gray-400 text-sm">Sem dados</div> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={methodData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {methodData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={v => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Últimas Vendas</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => exportCSV(filteredSales.map(s => ({ data: s.created_date, total: s.total, metodo: s.payment_method, status: s.status })), 'vendas')}>
                    <Download className="w-3 h-3 mr-1" />Exportar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {filteredSales.slice(0, 20).map(s => (
                    <div key={s.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
                      <div>
                        <p className="font-medium">{s.type === 'os' ? `OS` : 'PDV'} #{s.id.slice(-6)}</p>
                        <p className="text-xs text-gray-400">{formatDate(s.created_date)} • {getStatusLabel(s.payment_method)}</p>
                      </div>
                      <p className="font-bold">{formatCurrency(s.total)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="os">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">OS por Status</CardTitle></CardHeader>
              <CardContent>
                {statusData.length === 0 ? <div className="text-center py-8 text-gray-400 text-sm">Sem dados</div> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                        {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Resumo OS</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(ordersByStatus).map(([status, count]) => (
                  <div key={status} className="flex justify-between items-center py-1">
                    <span className="text-sm">{getStatusLabel(status)}</span>
                    <span className="font-bold">{count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="caixa">
          <FluxoCaixaTab />
        </TabsContent>

        <TabsContent value="gerenciais">
          <RelatoriosGerenciais />
        </TabsContent>

        <TabsContent value="crediario">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Aging de Crediário</CardTitle>
                <Button size="sm" variant="outline" onClick={() => exportCSV(data.credits.map(c => ({ titulo: c.title_number, vencimento: c.due_date, total: c.total_amount, pago: c.paid_amount, saldo: c.remaining_amount, status: c.status })), 'crediario')}>
                  <Download className="w-3 h-3 mr-1" />Exportar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {[
                  { label: 'A Vencer', val: data.credits.filter(c => c.status === 'a_vencer').reduce((s, c) => s + (c.remaining_amount || 0), 0), color: 'text-blue-600' },
                  { label: '1-30 dias', val: data.credits.filter(c => { if (c.status !== 'vencido') return false; const d = Math.floor((new Date() - new Date(c.due_date)) / 86400000); return d <= 30; }).reduce((s, c) => s + (c.remaining_amount || 0), 0), color: 'text-yellow-600' },
                  { label: '31-60 dias', val: data.credits.filter(c => { if (c.status !== 'vencido') return false; const d = Math.floor((new Date() - new Date(c.due_date)) / 86400000); return d > 30 && d <= 60; }).reduce((s, c) => s + (c.remaining_amount || 0), 0), color: 'text-orange-600' },
                  { label: '+60 dias', val: data.credits.filter(c => { if (c.status !== 'vencido') return false; return Math.floor((new Date() - new Date(c.due_date)) / 86400000) > 60; }).reduce((s, c) => s + (c.remaining_amount || 0), 0), color: 'text-red-600' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className={`font-bold text-lg ${color}`}>{formatCurrency(val)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}