import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { dre, inadimplencia } from '@/lib/relatorios';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Download, TrendingUp, Users, Wrench, Package } from 'lucide-react';

const COLORS = ['#dc2626', '#1a1a1a', '#6b7280', '#f97316', '#22c55e', '#3b82f6'];

export default function RelatoriosGerenciais() {
  const { company } = useCompany();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState({ sales: [], orders: [], parts: [], customers: [], technicians: [], credits: [] });

  useEffect(() => { if (company?.id) loadData(); }, [company, period]);

  const loadData = async () => {
    setLoading(true);
    const [sales, orders, parts, customers, technicians, credits] = await Promise.all([
      base44.entities.Sale.filter({ company_id: company.id }, '-created_date', 1000),
      base44.entities.WorkOrder.filter({ company_id: company.id }, '-created_date', 500),
      base44.entities.Part.filter({ company_id: company.id }),
      base44.entities.Customer.filter({ company_id: company.id }),
      base44.entities.Technician.filter({ company_id: company.id }),
      base44.entities.CreditTitle.filter({ company_id: company.id }),
    ]);
    setData({ sales, orders, parts, customers, technicians, credits });
    setLoading(false);
  };

  const now = new Date();
  const pf = (d) => {
    if (!d) return false;
    const dt = new Date(d);
    if (period === 'month') return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    if (period === 'year') return dt.getFullYear() === now.getFullYear();
    if (period === 'quarter') { const q = Math.floor(now.getMonth() / 3); const dq = Math.floor(dt.getMonth() / 3); return dt.getFullYear() === now.getFullYear() && dq === q; }
    return true;
  };

  const fSales = data.sales.filter(s => pf(s.created_date));
  const fOrders = data.orders.filter(o => pf(o.created_date));

  const pecaPorId = Object.fromEntries(data.parts.map(p => [p.id, p]));
  const tecnicoPorId = Object.fromEntries(data.technicians.map(t => [t.id, t]));

  // DRE do período. O custo sai do que foi gravado no item da venda, e a
  // comissão ignora OS cancelada — ver src/lib/relatorios.js.
  const resultado = dre({ vendas: fSales, ordens: fOrders, pecaPorId, tecnicoPorId });
  const receita = resultado.receita;
  const cogs = resultado.cmv;
  const lucroBruto = resultado.lucroBruto;
  const margemBruta = resultado.margemBruta;
  const comissoes = resultado.comissoes;

  // Ranking clientes
  const byCustomer = {};
  fSales.forEach(s => { byCustomer[s.customer_id] = (byCustomer[s.customer_id] || 0) + (s.total || 0); });
  const rankingClientes = Object.entries(byCustomer)
    .map(([id, total]) => ({ name: data.customers.find(c => c.id === id)?.name || 'Balcão', total }))
    .sort((a, b) => b.total - a.total).slice(0, 10);

  // Ranking mecânicos
  const byTech = {};
  fOrders.forEach(o => {
    if (!o.mechanic_id) return;
    const svcRev = (o.service_items || []).reduce((s, sv) => s + (sv.total_price || 0), 0);
    byTech[o.mechanic_id] = (byTech[o.mechanic_id] || 0) + svcRev;
  });
  const rankingTechs = Object.entries(byTech)
    .map(([id, total]) => ({ name: data.technicians.find(t => t.id === id)?.name || '—', total }))
    .sort((a, b) => b.total - a.total);

  // Inadimplência
  // O vencimento sai da DATA. O status 'vencido' só existe em memória nas
  // telas de Crediário e Contas a Pagar, nunca é gravado — filtrar por ele
  // aqui dava SEMPRE zero, com qualquer carteira atrasada.
  const carteira = inadimplencia(data.credits);
  const totalCrediario = carteira.aReceber;
  const inadimplente = carteira.vencido;
  const taxaInadimplencia = carteira.taxa;

  // Curva ABC peças
  const partSales = {};
  fSales.forEach(s => {
    (s.items || []).forEach(it => {
      if (it.type === 'part' || it.part_id) {
        const id = it.part_id || it.id;
        partSales[id] = (partSales[id] || 0) + (it.total_price || 0);
      }
    });
  });
  const abcData = Object.entries(partSales)
    .map(([id, total]) => ({ name: data.parts.find(p => p.id === id)?.description?.substring(0, 20) || id.slice(-4), total }))
    .sort((a, b) => b.total - a.total).slice(0, 8);

  const exportDRE = () => {
    const rows = [
      { indicador: 'Receita Bruta', valor: receita },
      { indicador: 'Custo Mercadorias (CMV)', valor: cogs },
      { indicador: 'Lucro Bruto', valor: lucroBruto },
      { indicador: 'Margem Bruta %', valor: margemBruta.toFixed(2) },
      { indicador: 'Comissões', valor: comissoes },
      { indicador: 'Lucro Operacional', valor: lucroBruto - comissoes },
      { indicador: 'Inadimplência', valor: inadimplente },
      { indicador: 'Taxa Inadimplência %', valor: taxaInadimplencia.toFixed(2) },
    ];
    const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'dre.csv'; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="quarter">Trimestre</SelectItem>
            <SelectItem value="month">Mês atual</SelectItem>
            <SelectItem value="year">Ano atual</SelectItem>
            <SelectItem value="all">Todo período</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* DRE */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4" />DRE Simplificado</CardTitle>
            <Button size="sm" variant="outline" onClick={exportDRE}><Download className="w-3 h-3 mr-1" />CSV</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <div className="flex justify-between py-1.5 border-b"><span className="text-sm text-gray-600">Receita Bruta</span><span className="font-semibold">{formatCurrency(receita)}</span></div>
            <div className="flex justify-between py-1.5 border-b"><span className="text-sm text-gray-600">(-) CMV</span><span className="text-red-600">- {formatCurrency(cogs)}</span></div>
            <div className="flex justify-between py-1.5 border-b bg-green-50"><span className="text-sm font-medium">Lucro Bruto</span><span className="font-bold text-green-700">{formatCurrency(lucroBruto)}</span></div>
            <div className="flex justify-between py-1.5 border-b">
              <span className="text-sm text-gray-600">
                Margem Bruta
                {resultado.cmvEstimado && <span className="text-amber-600"> *</span>}
              </span>
              <span className="font-semibold text-blue-600">{margemBruta.toFixed(1)}%</span>
            </div>
            {resultado.cmvEstimado && (
              <p className="text-xs text-amber-700 pt-1">
                * Parte das vendas não guardou o custo da peça no momento da venda, então
                esse trecho do CMV usa o custo atual do cadastro — a margem é aproximada.
                Vendas novas já gravam o custo e ficam exatas.
              </p>
            )}
            <div className="flex justify-between py-1.5 border-b"><span className="text-sm text-gray-600">(-) Comissões</span><span className="text-red-600">- {formatCurrency(comissoes)}</span></div>
            <div className="flex justify-between py-1.5 bg-blue-50"><span className="text-sm font-bold">Lucro Operacional</span><span className="font-bold text-blue-700">{formatCurrency(lucroBruto - comissoes)}</span></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ranking Clientes */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" />Top 10 Clientes</CardTitle></CardHeader>
          <CardContent>
            {rankingClientes.length === 0 ? <p className="text-center text-gray-400 py-6 text-sm">Sem dados</p> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={rankingClientes} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Bar dataKey="total" fill="#dc2626" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Ranking Mecânicos */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Wrench className="w-4 h-4" />Produtividade por Mecânico</CardTitle></CardHeader>
          <CardContent>
            {rankingTechs.length === 0 ? <p className="text-center text-gray-400 py-6 text-sm">Sem dados</p> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={rankingTechs} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Bar dataKey="total" fill="#1a1a1a" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Curva ABC */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4" />Peças Mais Vendidas</CardTitle></CardHeader>
          <CardContent>
            {abcData.length === 0 ? <p className="text-center text-gray-400 py-6 text-sm">Sem dados</p> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={abcData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 8 }} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Bar dataKey="total" fill="#f97316" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Inadimplência */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Análise de Inadimplência</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Total Crediário</p>
                <p className="font-bold text-gray-800">{formatCurrency(totalCrediario)}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-xs text-gray-500">Em Atraso</p>
                <p className="font-bold text-red-600">{formatCurrency(inadimplente)}</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg">
                <p className="text-xs text-gray-500">Taxa</p>
                <p className="font-bold text-orange-600">{taxaInadimplencia.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}