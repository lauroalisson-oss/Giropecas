import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, CheckCircle2, Clock, Percent, Target, TrendingUp, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function ComissoesPanel() {
  const { company } = useCompany();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [technicians, setTechnicians] = useState([]);
  const [orders, setOrders] = useState([]);
  const [paidCommissions, setPaidCommissions] = useState([]);
  const [period, setPeriod] = useState('month');

  useEffect(() => { if (company?.id) loadData(); }, [company, period]);

  const loadData = async () => {
    setLoading(true);
    const [techs, ords] = await Promise.all([
      base44.entities.Technician.filter({ company_id: company.id }, 'name'),
      base44.entities.WorkOrder.filter({ company_id: company.id }, '-created_date', 500),
    ]);
    setTechnicians(techs);
    setOrders(ords.filter(o => ['faturada', 'finalizada'].includes(o.status)));
    // Load paid commissions from accounting entries
    const entries = await base44.entities.AccountingEntry.filter({ company_id: company.id, reference_type: 'manual' }, '-date', 500);
    setPaidCommissions(entries.filter(e => e.description?.startsWith('Comissão paga:')));
    setLoading(false);
  };

  const now = new Date();
  const pf = (d) => {
    if (!d) return false;
    const dt = new Date(d);
    if (period === 'month') return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    if (period === 'year') return dt.getFullYear() === now.getFullYear();
    return true;
  };

  // Calcular comissões por técnico
  const comissoes = technicians.map(tech => {
    const techOrders = orders.filter(o => o.mechanic_id === tech.id && pf(o.closed_at || o.created_date));
    const serviceRevenue = techOrders.reduce((s, o) => {
      return s + (o.service_items || []).reduce((si, sv) => si + (sv.total_price || 0), 0);
    }, 0);
    const commission = serviceRevenue * (tech.commission_percent / 100);
    const paidForTech = paidCommissions
      .filter(e => e.description?.includes(tech.name) && pf(e.date))
      .reduce((s, e) => s + (e.amount || 0), 0);
    const goal = tech.monthly_goal || 0;
    const goalReached = goal > 0 && serviceRevenue >= goal;
    const goalPct = goal > 0 ? Math.min(100, (serviceRevenue / goal) * 100) : 0;
    return {
      tech,
      ordersCount: techOrders.length,
      serviceRevenue,
      commissionRate: tech.commission_percent,
      commission,
      paid: paidForTech,
      pending: commission - paidForTech,
      goal,
      goalReached,
      goalPct,
    };
  });

  const totalPendente = comissoes.reduce((s, c) => s + Math.max(0, c.pending), 0);
  const totalPago = comissoes.reduce((s, c) => s + c.paid, 0);

  const payCommission = async (c) => {
    const today = new Date().toISOString().split('T')[0];
    await base44.entities.AccountingEntry.create({
      company_id: company.id,
      date: today,
      type: 'debit',
      category: 'folha',
      description: `Comissão paga: ${c.tech.name}`,
      amount: c.pending,
      reference_type: 'manual',
    });
    toast({ title: `Comissão de ${c.tech.name} marcada como paga` });
    loadData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Mês atual</SelectItem>
            <SelectItem value="year">Ano atual</SelectItem>
            <SelectItem value="all">Todo período</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-orange-50 border-orange-200"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-orange-600" /><p className="text-xs text-gray-600">A Pagar</p></div>
          <p className="text-lg font-bold text-orange-700">{formatCurrency(totalPendente)}</p>
        </CardContent></Card>
        <Card className="bg-green-50 border-green-200"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><CheckCircle2 className="w-4 h-4 text-green-600" /><p className="text-xs text-gray-600">Pago</p></div>
          <p className="text-lg font-bold text-green-700">{formatCurrency(totalPago)}</p>
        </CardContent></Card>
        <Card className="bg-blue-50 border-blue-200"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-blue-600" /><p className="text-xs text-gray-600">Total Gerado</p></div>
          <p className="text-lg font-bold text-blue-700">{formatCurrency(totalPago + totalPendente)}</p>
        </CardContent></Card>
      </div>

      {/* Lista por técnico */}
      {loading ? <p className="text-gray-400 text-sm text-center py-6">Carregando...</p> : (
        <div className="space-y-2">
          {comissoes.map(c => (
            <Card key={c.tech.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-red-700">{c.tech.name?.[0]?.toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{c.tech.name}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Percent className="w-3 h-3" />{c.commissionRate}%</span>
                        <span>• {c.ordersCount} OS</span>
                        {c.goal > 0 && (
                          <span className={`flex items-center gap-1 ${c.goalReached ? 'text-green-600' : 'text-orange-600'}`}>
                            <Target className="w-3 h-3" />{c.goalReached ? 'Meta atingida' : `Meta: ${formatCurrency(c.goal)}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Receita serviços</p>
                    <p className="font-bold text-gray-900">{formatCurrency(c.serviceRevenue)}</p>
                  </div>
                </div>
                {c.goal > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500 flex items-center gap-1"><Target className="w-3 h-3" />Meta mensal</span>
                      <span className="font-medium">{formatCurrency(c.serviceRevenue)} / {formatCurrency(c.goal)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${c.goalReached ? 'bg-green-500' : 'bg-orange-400'}`} style={{ width: `${c.goalPct}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-400">{c.goalPct.toFixed(0)}% da meta</span>
                      {c.goalReached ? (
                        <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Faz jus à comissão</span>
                      ) : (
                        <span className="text-xs text-orange-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Abaixo da meta</span>
                      )}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-center text-sm border-t pt-3 mt-3">
                  <div>
                    <p className="text-xs text-gray-500">Comissão</p>
                    <p className="font-bold text-gray-800">{formatCurrency(c.commission)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Pago</p>
                    <p className="font-bold text-green-600">{formatCurrency(c.paid)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Pendente</p>
                    <p className="font-bold text-orange-600">{formatCurrency(c.pending)}</p>
                  </div>
                </div>
                {c.pending > 0.01 && (
                  <Button size="sm" className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white" onClick={() => payCommission(c)}>
                    <CheckCircle2 className="w-4 h-4 mr-2" />Marcar como Pago
                  </Button>
                )}
                {c.pending <= 0.01 && c.commission > 0 && (
                  <Badge className="mt-3 w-full justify-center bg-green-100 text-green-700">Quitado</Badge>
                )}
              </CardContent>
            </Card>
          ))}
          {comissoes.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">Nenhum mecânico cadastrado</p>}
        </div>
      )}
    </div>
  );
}