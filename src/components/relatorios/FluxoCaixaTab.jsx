import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { ArrowUpCircle, ArrowDownCircle, DollarSign, Wallet } from 'lucide-react';

export default function FluxoCaixaTab() {
  const { company } = useCompany();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');
  const [data, setData] = useState({
    saldoAtual: 0, aReceber: [], aPagar: [], projecao: [],
    totais: { receber30: 0, pagar30: 0, saldo30: 0, receber60: 0, pagar60: 0, saldo60: 0, receber90: 0, pagar90: 0, saldo90: 0 }
  });

  useEffect(() => { loadData(); }, [company, period]);

  const loadData = async () => {
    if (!company?.id) return;
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const [creditTitles, bills, entries] = await Promise.all([
      base44.entities.CreditTitle.filter({ company_id: company.id }, 'due_date', 500),
      base44.entities.Bill.filter({ company_id: company.id }, 'due_date', 500),
      base44.entities.AccountingEntry.filter({ company_id: company.id }, '-date', 500),
    ]);

    const saldoAtual = entries.reduce((s, e) => s + (e.type === 'credit' ? (e.amount || 0) : -(e.amount || 0)), 0);
    const aReceber = creditTitles.filter(t => t.status !== 'pago' && t.status !== 'cancelado' && t.due_date >= today)
      .map(t => ({ date: t.due_date, amount: t.remaining_amount || t.total_amount, description: `Crediário ${t.title_number || ''}`, type: 'receber' }));
    const aPagar = bills.filter(b => b.status !== 'pago' && b.due_date >= today)
      .map(b => ({ date: b.due_date, amount: b.amount, description: b.description, type: 'pagar' }));

    const days = parseInt(period);
    const projecao = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const r = aReceber.filter(x => x.date === dateStr).reduce((s, x) => s + x.amount, 0);
      const p = aPagar.filter(x => x.date === dateStr).reduce((s, x) => s + x.amount, 0);
      projecao.push({ date: dateStr, label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), receber: r, pagar: p });
    }

    const calc = (w) => {
      const lim = new Date(); lim.setDate(lim.getDate() + w);
      const ls = lim.toISOString().split('T')[0];
      const r = aReceber.filter(x => x.date <= ls).reduce((s, x) => s + x.amount, 0);
      const p = aPagar.filter(x => x.date <= ls).reduce((s, x) => s + x.amount, 0);
      return { receber: r, pagar: p, saldo: r - p };
    };
    setData({
      saldoAtual, aReceber, aPagar, projecao,
      totais: { receber30: calc(30).receber, pagar30: calc(30).pagar, saldo30: calc(30).saldo,
        receber60: calc(60).receber, pagar60: calc(60).pagar, saldo60: calc(60).saldo,
        receber90: calc(90).receber, pagar90: calc(90).pagar, saldo90: calc(90).saldo }
    });
    setLoading(false);
  };

  const saldoProjetado = data.saldoAtual + data.totais.saldo30;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Wallet className="w-4 h-4 text-gray-600" /><p className="text-xs text-gray-500">Saldo Atual</p></div>
          <p className="text-lg font-bold text-gray-900">{loading ? '...' : formatCurrency(data.saldoAtual)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><ArrowUpCircle className="w-4 h-4 text-green-600" /><p className="text-xs text-gray-500">A Receber (30d)</p></div>
          <p className="text-lg font-bold text-green-600">{loading ? '...' : formatCurrency(data.totais.receber30)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><ArrowDownCircle className="w-4 h-4 text-red-600" /><p className="text-xs text-gray-500">A Pagar (30d)</p></div>
          <p className="text-lg font-bold text-red-600">{loading ? '...' : formatCurrency(data.totais.pagar30)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><DollarSign className={`w-4 h-4 ${saldoProjetado >= 0 ? 'text-blue-600' : 'text-red-600'}`} /><p className="text-xs text-gray-500">Saldo Projetado</p></div>
          <p className={`text-lg font-bold ${saldoProjetado >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{loading ? '...' : formatCurrency(saldoProjetado)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-1 pt-3"><CardTitle className="text-sm text-gray-700">Projeção Diária — Receber vs Pagar</CardTitle></CardHeader>
        <CardContent className="px-2 pb-3">
          {loading ? <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Carregando...</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.projecao}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={Math.floor(data.projecao.length / 10)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${v}`} width={52} />
                <Tooltip formatter={(v, n) => [formatCurrency(v), n === 'receber' ? 'A Receber' : 'A Pagar']} />
                <Legend formatter={v => v === 'receber' ? 'A Receber' : 'A Pagar'} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="receber" fill="#16a34a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="pagar" fill="#dc2626" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1 pt-3"><CardTitle className="text-sm text-gray-700">Cenários por Janela</CardTitle></CardHeader>
        <CardContent className="pt-2">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-gray-500">
              <th className="text-left py-2 font-medium">Janela</th>
              <th className="text-right py-2 font-medium">A Receber</th>
              <th className="text-right py-2 font-medium">A Pagar</th>
              <th className="text-right py-2 font-medium">Saldo</th>
            </tr></thead>
            <tbody>
              {[['30 dias', 30], ['60 dias', 60], ['90 dias', 90]].map(([label, w]) => {
                const t = w === 30 ? data.totais.saldo30 : w === 60 ? data.totais.saldo60 : data.totais.saldo90;
                const r = w === 30 ? data.totais.receber30 : w === 60 ? data.totais.receber60 : data.totais.receber90;
                const p = w === 30 ? data.totais.pagar30 : w === 60 ? data.totais.pagar60 : data.totais.pagar90;
                return (
                  <tr key={w} className="border-b last:border-0">
                    <td className="py-2 font-medium">{label}</td>
                    <td className="text-right text-green-600">{formatCurrency(r)}</td>
                    <td className="text-right text-red-600">{formatCurrency(p)}</td>
                    <td className={`text-right font-bold ${t >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(t)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}