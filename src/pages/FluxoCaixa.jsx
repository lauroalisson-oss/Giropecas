import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, Wallet, Calendar, ArrowUpCircle, ArrowDownCircle, DollarSign } from 'lucide-react';

export default function FluxoCaixa() {
  const { company } = useCompany();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');
  const [data, setData] = useState({
    saldoAtual: 0,
    aReceber: [],
    aPagar: [],
    projecao: [],
    totais: { receber30: 0, pagar30: 0, saldo30: 0, receber60: 0, pagar60: 0, saldo60: 0, receber90: 0, pagar90: 0, saldo90: 0 }
  });

  useEffect(() => { loadData(); }, [company, period]);

  const loadData = async () => {
    if (!company?.id) return;
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    const [sales, creditTitles, bills, entries] = await Promise.all([
      base44.entities.Sale.filter({ company_id: company.id }, '-created_date', 500),
      base44.entities.CreditTitle.filter({ company_id: company.id }, 'due_date', 500),
      base44.entities.Bill.filter({ company_id: company.id }, 'due_date', 500),
      base44.entities.AccountingEntry.filter({ company_id: company.id }, '-date', 500),
    ]);

    // Saldo atual = créditos - débitos (entradas contábeis)
    const saldoAtual = entries.reduce((s, e) => s + (e.type === 'credit' ? (e.amount || 0) : -(e.amount || 0)), 0);

    // A receber = títulos de crediário não pagos
    const aReceber = creditTitles.filter(t => t.status !== 'pago' && t.status !== 'cancelado' && t.due_date >= today)
      .map(t => ({ date: t.due_date, amount: t.remaining_amount || t.total_amount, description: `Crediário - ${t.title_number || ''}`, type: 'receber' }));

    // A pagar = contas não pagas
    const aPagar = bills.filter(b => b.status !== 'pago' && b.due_date >= today)
      .map(b => ({ date: b.due_date, amount: b.amount, description: b.description, type: 'pagar' }));

    // Projeção por dia (próximos N dias)
    const days = parseInt(period);
    const projecao = [];
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayReceber = aReceber.filter(x => x.date === dateStr).reduce((s, x) => s + x.amount, 0);
      const dayPagar = aPagar.filter(x => x.date === dateStr).reduce((s, x) => s + x.amount, 0);
      projecao.push({
        date: dateStr,
        label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        receber: dayReceber,
        pagar: dayPagar,
        saldoDia: dayReceber - dayPagar,
      });
    }

    // Totais por janela (30/60/90)
    const calcTotals = (daysWindow) => {
      const limit = new Date();
      limit.setDate(limit.getDate() + daysWindow);
      const limitStr = limit.toISOString().split('T')[0];
      const r = aReceber.filter(x => x.date <= limitStr).reduce((s, x) => s + x.amount, 0);
      const p = aPagar.filter(x => x.date <= limitStr).reduce((s, x) => s + x.amount, 0);
      return { receber: r, pagar: p, saldo: r - p };
    };

    const totais = {
      receber30: calcTotals(30).receber,
      pagar30: calcTotals(30).pagar,
      saldo30: calcTotals(30).saldo,
      receber60: calcTotals(60).receber,
      pagar60: calcTotals(60).pagar,
      saldo60: calcTotals(60).saldo,
      receber90: calcTotals(90).receber,
      pagar90: calcTotals(90).pagar,
      saldo90: calcTotals(90).saldo,
    };

    setData({ saldoAtual, aReceber, aPagar, projecao, totais });
    setLoading(false);
  };

  // Combinar e ordenar próximos vencimentos
  const proximos = [
    ...data.aReceber.map(x => ({ ...x, tipo: 'receita' })),
    ...data.aPagar.map(x => ({ ...x, tipo: 'despesa' })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 15);

  const saldoProjetado = data.saldoAtual + data.totais.saldo30;

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Fluxo de Caixa</h1>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="15">15 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="60">60 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-gray-600" />
              <p className="text-xs text-gray-500">Saldo Atual</p>
            </div>
            <p className="text-lg font-bold text-gray-900">{loading ? '...' : formatCurrency(data.saldoAtual)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpCircle className="w-4 h-4 text-green-600" />
              <p className="text-xs text-gray-500">A Receber (30d)</p>
            </div>
            <p className="text-lg font-bold text-green-600">{loading ? '...' : formatCurrency(data.totais.receber30)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownCircle className="w-4 h-4 text-red-600" />
              <p className="text-xs text-gray-500">A Pagar (30d)</p>
            </div>
            <p className="text-lg font-bold text-red-600">{loading ? '...' : formatCurrency(data.totais.pagar30)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className={`w-4 h-4 ${saldoProjetado >= 0 ? 'text-blue-600' : 'text-red-600'}`} />
              <p className="text-xs text-gray-500">Saldo Projetado (30d)</p>
            </div>
            <p className={`text-lg font-bold ${saldoProjetado >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{loading ? '...' : formatCurrency(saldoProjetado)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Projection chart */}
      <Card className="mb-6">
        <CardHeader className="pb-1 pt-3">
          <CardTitle className="text-sm text-gray-700">Projeção Diária — Receber vs Pagar</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          {loading ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Carregando...</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.projecao}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={Math.floor(data.projecao.length / 10)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${v}`} width={52} />
                <Tooltip formatter={(v, name) => [formatCurrency(v), name === 'receber' ? 'A Receber' : 'A Pagar']} labelFormatter={(l) => `Dia ${l}`} />
                <Legend formatter={v => v === 'receber' ? 'A Receber' : 'A Pagar'} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="receber" fill="#16a34a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="pagar" fill="#dc2626" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 30/60/90 windows */}
      <Card className="mb-6">
        <CardHeader className="pb-1 pt-3"><CardTitle className="text-sm text-gray-700">Cenários por Janela</CardTitle></CardHeader>
        <CardContent className="pt-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="text-left py-2 font-medium">Janela</th>
                  <th className="text-right py-2 font-medium">A Receber</th>
                  <th className="text-right py-2 font-medium">A Pagar</th>
                  <th className="text-right py-2 font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2 font-medium">30 dias</td>
                  <td className="text-right text-green-600">{formatCurrency(data.totais.receber30)}</td>
                  <td className="text-right text-red-600">{formatCurrency(data.totais.pagar30)}</td>
                  <td className={`text-right font-bold ${data.totais.saldo30 >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(data.totais.saldo30)}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium">60 dias</td>
                  <td className="text-right text-green-600">{formatCurrency(data.totais.receber60)}</td>
                  <td className="text-right text-red-600">{formatCurrency(data.totais.pagar60)}</td>
                  <td className={`text-right font-bold ${data.totais.saldo60 >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(data.totais.saldo60)}</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">90 dias</td>
                  <td className="text-right text-green-600">{formatCurrency(data.totais.receber90)}</td>
                  <td className="text-right text-red-600">{formatCurrency(data.totais.pagar90)}</td>
                  <td className={`text-right font-bold ${data.totais.saldo90 >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(data.totais.saldo90)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Próximos vencimentos */}
      <Card>
        <CardHeader className="pb-1 pt-3"><CardTitle className="text-sm text-gray-700">Próximos Vencimentos</CardTitle></CardHeader>
        <CardContent className="pt-2">
          {proximos.length === 0 ? (
            <p className="text-center text-gray-400 py-4 text-sm">Nenhum vencimento próximo</p>
          ) : (
            <div className="space-y-1.5">
              {proximos.map((v, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${v.tipo === 'receita' ? 'bg-green-50' : 'bg-red-50'}`}>
                    {v.tipo === 'receita' ? <TrendingUp className="w-4 h-4 text-green-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{v.description}</p>
                    <p className="text-xs text-gray-500">{formatDate(v.date)}</p>
                  </div>
                  <p className={`text-sm font-bold ${v.tipo === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
                    {v.tipo === 'receita' ? '+' : '-'}{formatCurrency(v.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}