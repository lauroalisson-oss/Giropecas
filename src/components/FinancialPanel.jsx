import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend
} from 'recharts';
import { DollarSign, Target, TrendingUp, TrendingDown, Percent, ChevronDown, ChevronUp } from 'lucide-react';

// Persist goals in localStorage per company
const GOAL_KEY = (companyId) => `motoflow_goal_${companyId}`;

function loadGoal(companyId) {
  try { return parseFloat(localStorage.getItem(GOAL_KEY(companyId))) || 0; } catch { return 0; }
}
function saveGoal(companyId, value) {
  try { localStorage.setItem(GOAL_KEY(companyId), String(value)); } catch {}
}

// Derive card fee from payment_details stored on the sale
function extractFeeFromSale(sale) {
  const details = sale.payment_details || {};
  // If totalFees was stored (new PDV format)
  if (details.totalFees) return parseFloat(details.totalFees) || 0;
  return 0;
}

// Compute cost of goods sold from items (parts have cost_price)
function extractCOGS(sale, partMap) {
  let cogs = 0;
  for (const item of sale.items || []) {
    if (item.type === 'part') {
      const part = partMap[item.part_id || item.id];
      const costPrice = part?.cost_price || item.cost_price || 0;
      cogs += costPrice * (item.quantity || 1);
    }
  }
  return cogs;
}

// Compute service commissions from work-order service items
function extractServiceCommissions(order, serviceMap, commissionRate) {
  if (!commissionRate) return 0;
  let base = 0;
  for (const si of order.service_items || []) {
    base += si.total_price || (si.unit_price || 0) * (si.hours || 1);
  }
  return base * (commissionRate / 100);
}

export default function FinancialPanel() {
  const { company } = useCompany();

  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goal, setGoal] = useState(0);
  const [goalInput, setGoalInput] = useState('');
  const [commissionRate, setCommissionRate] = useState(0);
  const [commissionInput, setCommissionInput] = useState('');

  const [data, setData] = useState({
    todayRevenue: 0,
    todayFees: 0,
    todayCOGS: 0,
    todayCommissions: 0,
    todayNetProfit: 0,
    weekChart: [],
    todayBreakdown: { dinheiro: 0, debito: 0, credito: 0, pix: 0, crediario: 0 },
  });

  useEffect(() => {
    if (company?.id) {
      const g = loadGoal(company.id);
      const cRate = parseFloat(localStorage.getItem(`motoflow_commission_${company.id}`)) || 0;
      setGoal(g);
      setGoalInput(String(g || ''));
      setCommissionRate(cRate);
      setCommissionInput(String(cRate || ''));
      loadData(g, cRate);
    }
  }, [company]);

  const loadData = async (currentGoal, cRate) => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    const [sales, orders, parts] = await Promise.all([
      base44.entities.Sale.filter({ company_id: company.id }, '-created_date', 500),
      base44.entities.WorkOrder.filter({ company_id: company.id }, '-created_date', 200),
      base44.entities.Part.filter({ company_id: company.id }),
    ]);

    const partMap = Object.fromEntries(parts.map(p => [p.id, p]));

    // Today
    const todaySales = sales.filter(s => s.created_date?.startsWith(today) && s.status === 'pago');
    const todayRevenue = todaySales.reduce((s, x) => s + (x.total || 0), 0);
    const todayFees = todaySales.reduce((s, x) => s + extractFeeFromSale(x), 0);
    const todayCOGS = todaySales.reduce((s, x) => s + extractCOGS(x, partMap), 0);

    // Today commissions from faturada/finalizada orders
    const todayOrders = orders.filter(o => o.created_date?.startsWith(today));
    const todayCommissions = todayOrders.reduce((s, o) => s + extractServiceCommissions(o, {}, cRate), 0);

    const todayNetProfit = todayRevenue - todayFees - todayCOGS - todayCommissions;

    // Today breakdown by method
    const todayBreakdown = todaySales.reduce((acc, s) => {
      const m = s.payment_method;
      if (m === 'dinheiro') acc.dinheiro += s.total || 0;
      else if (m === 'cartao_debito') acc.debito += s.total || 0;
      else if (m === 'cartao_credito') acc.credito += s.total || 0;
      else if (m === 'pix') acc.pix += s.total || 0;
      else if (m === 'crediario') acc.crediario += s.total || 0;
      else acc.dinheiro += s.total || 0; // fallback
      return acc;
    }, { dinheiro: 0, debito: 0, credito: 0, pix: 0, crediario: 0 });

    // Last 7 days chart
    const weekChart = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toISOString().split('T')[0];
      const daySales = sales.filter(s => s.created_date?.startsWith(dateStr) && s.status === 'pago');
      const revenue = daySales.reduce((s, x) => s + (x.total || 0), 0);
      const fees = daySales.reduce((s, x) => s + extractFeeFromSale(x), 0);
      const cogs = daySales.reduce((s, x) => s + extractCOGS(x, partMap), 0);
      const dayOrders = orders.filter(o => o.created_date?.startsWith(dateStr));
      const commissions = dayOrders.reduce((s, o) => s + extractServiceCommissions(o, {}, cRate), 0);
      const netProfit = revenue - fees - cogs - commissions;
      return {
        day: d.toLocaleDateString('pt-BR', { weekday: 'short' }),
        faturamento: parseFloat(revenue.toFixed(2)),
        lucro: parseFloat(Math.max(0, netProfit).toFixed(2)),
      };
    });

    setData({ todayRevenue, todayFees, todayCOGS, todayCommissions, todayNetProfit, weekChart, todayBreakdown });
    setLoading(false);
  };

  const handleSaveSettings = () => {
    const g = parseFloat(goalInput) || 0;
    const c = parseFloat(commissionInput) || 0;
    setGoal(g);
    setCommissionRate(c);
    saveGoal(company.id, g);
    localStorage.setItem(`motoflow_commission_${company.id}`, String(c));
    setSettingsOpen(false);
    loadData(g, c);
  };

  const goalPercent = goal > 0 ? Math.min(100, (data.todayRevenue / goal) * 100) : 0;
  const goalColor = goalPercent >= 100 ? 'bg-green-500' : goalPercent >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  const metricCards = [
    {
      label: 'Recebimentos do Dia',
      value: data.todayRevenue,
      icon: DollarSign,
      color: 'text-green-600',
      bg: 'bg-green-50',
      detail: null,
    },
    {
      label: 'Lucro Líquido Hoje',
      value: data.todayNetProfit,
      icon: data.todayNetProfit >= 0 ? TrendingUp : TrendingDown,
      color: data.todayNetProfit >= 0 ? 'text-blue-600' : 'text-red-600',
      bg: data.todayNetProfit >= 0 ? 'bg-blue-50' : 'bg-red-50',
      detail: `Após taxas, custos e comissões`,
    },
    {
      label: 'Taxas de Cartão',
      value: data.todayFees,
      icon: Percent,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      detail: data.todayRevenue > 0 ? `${((data.todayFees / data.todayRevenue) * 100).toFixed(1)}% do faturamento` : null,
    },
    {
      label: 'Custo de Produtos',
      value: data.todayCOGS,
      icon: TrendingDown,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      detail: data.todayCommissions > 0 ? `+${formatCurrency(data.todayCommissions)} comissão` : null,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">Financeiro do Dia</h2>
        <button
          onClick={() => setSettingsOpen(v => !v)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
        >
          <Target className="w-3.5 h-3.5" />
          Meta & Comissão
          {settingsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Settings drawer */}
      {settingsOpen && (
        <Card className="border-dashed border-gray-300">
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Meta diária de faturamento (R$)</Label>
                <Input className="mt-1 h-8" type="number" min="0" step="100"
                  value={goalInput} onChange={e => setGoalInput(e.target.value)} placeholder="Ex: 3000" />
              </div>
              <div>
                <Label className="text-xs">Comissão sobre serviços (%)</Label>
                <Input className="mt-1 h-8" type="number" min="0" step="0.5" max="100"
                  value={commissionInput} onChange={e => setCommissionInput(e.target.value)} placeholder="Ex: 10" />
              </div>
            </div>
            <Button size="sm" className="mt-3 bg-red-600 hover:bg-red-700 text-white" onClick={handleSaveSettings}>
              Salvar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Meta progress */}
      {goal > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Meta do Dia</span>
              </div>
              <span className="text-sm font-bold text-gray-900">
                {formatCurrency(data.todayRevenue)} / {formatCurrency(goal)}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${goalColor}`}
                style={{ width: `${goalPercent}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-400">{goalPercent.toFixed(0)}% atingido</span>
              {goalPercent < 100 && (
                <span className="text-xs text-gray-400">Faltam {formatCurrency(goal - data.todayRevenue)}</span>
              )}
              {goalPercent >= 100 && (
                <span className="text-xs text-green-600 font-medium">✓ Meta batida!</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metricCards.map(({ label, value, icon: Icon, color, bg, detail }) => (
          <Card key={label}>
            <CardContent className="p-3">
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-2`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className={`text-lg font-bold ${color}`}>{loading ? '...' : formatCurrency(value)}</p>
              <p className="text-xs text-gray-500 leading-tight mt-0.5">{label}</p>
              {detail && <p className="text-xs text-gray-400 mt-0.5">{detail}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today breakdown by payment method */}
      {!loading && data.todayRevenue > 0 && (
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Recebimentos por forma de pagamento</p>
            <div className="grid grid-cols-5 gap-1 text-center">
              {[
                { key: 'dinheiro', label: 'Dinheiro', color: 'bg-green-100 text-green-700' },
                { key: 'debito', label: 'Débito', color: 'bg-blue-100 text-blue-700' },
                { key: 'credito', label: 'Crédito', color: 'bg-purple-100 text-purple-700' },
                { key: 'pix', label: 'PIX', color: 'bg-teal-100 text-teal-700' },
                { key: 'crediario', label: 'Crediário', color: 'bg-orange-100 text-orange-700' },
              ].map(({ key, label, color }) => (
                <div key={key} className={`rounded-lg px-1 py-2 ${color}`}>
                  <p className="text-xs font-bold">{formatCurrency(data.todayBreakdown[key])}</p>
                  <p className="text-xs mt-0.5 opacity-80">{label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 7-day profit chart */}
      <Card>
        <CardHeader className="pb-1 pt-3">
          <CardTitle className="text-sm text-gray-700">Faturamento vs Lucro Líquido (7 dias)</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          {loading ? (
            <div className="h-36 flex items-center justify-center text-gray-400 text-sm">Carregando...</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.weekChart} barGap={2} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${v}`} width={52} />
                <Tooltip formatter={(v, name) => [formatCurrency(v), name === 'faturamento' ? 'Faturamento' : 'Lucro Líquido']} />
                <Legend formatter={v => v === 'faturamento' ? 'Faturamento' : 'Lucro Líquido'} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="faturamento" fill="#e5e7eb" radius={[3, 3, 0, 0]} />
                <Bar dataKey="lucro" fill="#dc2626" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}