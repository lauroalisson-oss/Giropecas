import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { DollarSign, Target, TrendingUp, TrendingDown, Percent, ChevronDown, ChevronUp } from 'lucide-react';
import { hoje, diaLocal, diaDoRegistro } from '@/lib/datas';
import { resumoDeVendas } from '@/lib/relatorios';

// Persist goals in localStorage per company
const GOAL_KEY = (companyId) => `motoflow_goal_${companyId}`;

function loadGoal(companyId) {
  try { return parseFloat(localStorage.getItem(GOAL_KEY(companyId))) || 0; } catch { return 0; }
}
function saveGoal(companyId, value) {
  try { localStorage.setItem(GOAL_KEY(companyId), String(value)); } catch {}
}

// As contas deste painel moram em lib/relatorios.js (resumoDeVendas), as
// mesmas do DRE. Aqui havia cópias próprias: custo pelo cadastro atual,
// comissão por uma taxa única guardada no navegador, e "misto" contado
// como dinheiro.

export default function FinancialPanel() {
  const { company } = useCompany();

  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goal, setGoal] = useState(0);
  const [goalInput, setGoalInput] = useState('');

  const [data, setData] = useState({
    todayRevenue: 0,
    todayFees: 0,
    todayCOGS: 0,
    todayCommissions: 0,
    todayNetProfit: 0,
    weekChart: [],
    todayBreakdown: { dinheiro: 0, debito: 0, credito: 0, pix: 0, crediario: 0, outros: 0 },
  });

  useEffect(() => {
    if (company?.id) {
      const g = loadGoal(company.id);
      setGoal(g);
      setGoalInput(String(g || ''));
      loadData();
    }
  }, [company]);

  const loadData = async () => {
    setLoading(true);
    const today = hoje();

    const [sales, orders, parts, techs] = await Promise.all([
      base44.entities.Sale.filter({ company_id: company.id }, '-created_date', 500),
      base44.entities.WorkOrder.filter({ company_id: company.id }, '-created_date', 200),
      base44.entities.Part.filter({ company_id: company.id }),
      // A comissão é a de CADA mecânico, do cadastro — não uma taxa única.
      base44.entities.Technician.filter({ company_id: company.id }),
    ]);

    const contexto = {
      ordens: orders,
      pecaPorId: Object.fromEntries(parts.map(p => [p.id, p])),
      tecnicoPorId: Object.fromEntries(techs.map(t => [t.id, t])),
    };
    const pagasNoDia = (dia) => sales.filter(s => diaDoRegistro(s.created_date) === dia && s.status === 'pago');

    const hojeR = resumoDeVendas({ vendas: pagasNoDia(today), ...contexto });

    const weekChart = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const r = resumoDeVendas({ vendas: pagasNoDia(diaLocal(d)), ...contexto });
      return {
        day: d.toLocaleDateString('pt-BR', { weekday: 'short' }),
        faturamento: r.faturamento,
        // Prejuízo aparece como prejuízo. Math.max(0, …) fazia o dia no
        // vermelho virar um dia "zerado" no gráfico.
        lucro: r.lucro,
      };
    });

    const todayRevenue = hojeR.faturamento;
    const todayFees = hojeR.taxas;
    const todayCOGS = hojeR.cmv;
    const todayCommissions = hojeR.comissoes;
    const todayNetProfit = hojeR.lucro;
    const todayBreakdown = hojeR.porMeio;

    setData({ todayRevenue, todayFees, todayCOGS, todayCommissions, todayNetProfit, weekChart, todayBreakdown });
    setLoading(false);
  };

  const handleSaveSettings = () => {
    const g = parseFloat(goalInput) || 0;
    setGoal(g);
    saveGoal(company.id, g);
    setSettingsOpen(false);
  };

  const goalPercent = goal > 0 ? Math.min(100, (data.todayRevenue / goal) * 100) : 0;
  const goalColor = goalPercent >= 100 ? 'bg-green-500' : goalPercent >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  const metricCards = [
    {
      // Soma o valor das vendas, inclusive o que ficou no crediário — é
      // faturamento, não dinheiro recebido.
      label: 'Faturamento do Dia',
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
          Meta do dia
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
              <div className="text-xs text-gray-500 self-end pb-1">
                A comissão usa o percentual de cada mecânico, definido em Técnicos.
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
            <p className="text-xs font-semibold text-gray-600 mb-2">Vendas por forma de pagamento</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 text-center">
              {[
                { key: 'dinheiro', label: 'Dinheiro', color: 'bg-green-100 text-green-700' },
                { key: 'debito', label: 'Débito', color: 'bg-blue-100 text-blue-700' },
                { key: 'credito', label: 'Crédito', color: 'bg-purple-100 text-purple-700' },
                { key: 'pix', label: 'PIX', color: 'bg-teal-100 text-teal-700' },
                { key: 'crediario', label: 'Crediário', color: 'bg-orange-100 text-orange-700' },
                // Só aparece quando há valor que não dá para atribuir a um
                // meio — antes isso era somado em "Dinheiro" em silêncio.
                ...(data.todayBreakdown.outros > 0
                  ? [{ key: 'outros', label: 'Outros', color: 'bg-gray-100 text-gray-700' }] : []),
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