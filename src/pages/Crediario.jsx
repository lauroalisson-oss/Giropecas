import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, CreditCard, CheckCircle, AlertTriangle, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function Crediario() {
  const { company } = useCompany();
  const { toast } = useToast();
  const [titles, setTitles] = useState([]);
  const [customers, setCustomers] = useState({});
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [payingTitle, setPayingTitle] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paying, setPaying] = useState(false);

  useEffect(() => { if (company?.id) loadData(); }, [company]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tits, custs] = await Promise.all([
        base44.entities.CreditTitle.filter({ company_id: company.id }, '-due_date'),
        base44.entities.Customer.filter({ company_id: company.id }),
      ]);
      // Auto-mark overdue
      const today = new Date().toISOString().split('T')[0];
      const updated = tits.map(t => ({
        ...t,
        status: t.status === 'a_vencer' && t.due_date < today ? 'vencido' : t.status
      }));
      setTitles(updated);
      const map = {};
      custs.forEach(c => { map[c.id] = c; });
      setCustomers(map);
    } finally {
      setLoading(false);
    }
  };

  const filtered = titles.filter(t => {
    const cust = customers[t.customer_id];
    const matchSearch = cust?.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.title_number?.includes(search);
    if (tab === 'vencido') return matchSearch && t.status === 'vencido';
    if (tab === 'a_vencer') return matchSearch && t.status === 'a_vencer';
    if (tab === 'pago') return matchSearch && (t.status === 'pago' || t.status === 'pago_parcial');
    return matchSearch && t.status !== 'cancelado';
  });

  const totalReceivable = titles.filter(t => t.status === 'a_vencer' || t.status === 'vencido').reduce((s, t) => s + (t.remaining_amount || 0), 0);
  const totalOverdue = titles.filter(t => t.status === 'vencido').reduce((s, t) => s + (t.remaining_amount || 0), 0);

  const handlePayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) { toast({ title: 'Valor inválido', variant: 'destructive' }); return; }
    setPaying(true);
    try {
      const amount = parseFloat(paymentAmount);
      const newPaid = (payingTitle.paid_amount || 0) + amount;
      const newRemaining = (payingTitle.total_amount || 0) - newPaid;
      const newStatus = newRemaining <= 0.01 ? 'pago' : 'pago_parcial';

      await base44.entities.CreditTitle.update(payingTitle.id, {
        paid_amount: newPaid,
        remaining_amount: Math.max(0, newRemaining),
        status: newStatus,
        payment_date: paymentDate,
      });

      await base44.entities.AccountingEntry.create({
        company_id: company.id,
        date: paymentDate,
        type: 'credit',
        category: 'Recebimento Crediário',
        description: `Pagamento título ${payingTitle.title_number}`,
        amount,
        reference_id: payingTitle.id,
        reference_type: 'payment',
      });

      toast({ title: `Pagamento de ${formatCurrency(amount)} registrado!` });
      setPayingTitle(null);
      setPaymentAmount('');
      loadData();
    } catch (e) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setPaying(false);
    }
  };

  const agingBuckets = [
    { label: 'A vencer', count: titles.filter(t => t.status === 'a_vencer').length, total: titles.filter(t => t.status === 'a_vencer').reduce((s, t) => s + (t.remaining_amount || 0), 0), color: 'bg-blue-50 border-blue-200 text-blue-800' },
    { label: '1-30 dias', count: titles.filter(t => { if (t.status !== 'vencido') return false; const days = Math.floor((new Date() - new Date(t.due_date)) / 86400000); return days >= 1 && days <= 30; }).length, total: titles.filter(t => { if (t.status !== 'vencido') return false; const days = Math.floor((new Date() - new Date(t.due_date)) / 86400000); return days >= 1 && days <= 30; }).reduce((s, t) => s + (t.remaining_amount || 0), 0), color: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
    { label: '31-60 dias', count: titles.filter(t => { if (t.status !== 'vencido') return false; const days = Math.floor((new Date() - new Date(t.due_date)) / 86400000); return days >= 31 && days <= 60; }).length, total: titles.filter(t => { if (t.status !== 'vencido') return false; const days = Math.floor((new Date() - new Date(t.due_date)) / 86400000); return days >= 31 && days <= 60; }).reduce((s, t) => s + (t.remaining_amount || 0), 0), color: 'bg-orange-50 border-orange-200 text-orange-800' },
    { label: '+60 dias', count: titles.filter(t => { if (t.status !== 'vencido') return false; const days = Math.floor((new Date() - new Date(t.due_date)) / 86400000); return days > 60; }).length, total: titles.filter(t => { if (t.status !== 'vencido') return false; const days = Math.floor((new Date() - new Date(t.due_date)) / 86400000); return days > 60; }).reduce((s, t) => s + (t.remaining_amount || 0), 0), color: 'bg-red-50 border-red-200 text-red-800' },
  ];

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Crediário</h1>
        <p className="text-gray-500 text-sm">Gestão de títulos e cobranças</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="border-blue-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">Total a Receber</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(totalReceivable)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" />Em Atraso</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalOverdue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {agingBuckets.map(b => (
          <Card key={b.label} className={`border ${b.color}`}>
            <CardContent className="p-3">
              <p className="text-xs font-medium">{b.label}</p>
              <p className="font-bold">{b.count} títulos</p>
              <p className="text-xs">{formatCurrency(b.total)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="Buscar por cliente ou número..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="vencido">Vencidos</TabsTrigger>
          <TabsTrigger value="a_vencer">A Vencer</TabsTrigger>
          <TabsTrigger value="pago">Pagos</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? <div className="text-center py-12 text-gray-400">Carregando...</div> :
        filtered.length === 0 ? (
          <div className="text-center py-16">
            <CreditCard className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500">Nenhum título encontrado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(title => {
              const cust = customers[title.customer_id];
              const daysOverdue = title.status === 'vencido' ? Math.floor((new Date() - new Date(title.due_date)) / 86400000) : 0;
              return (
                <Card key={title.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900 text-sm">{cust?.name || 'Cliente'}</span>
                          <Badge className={`text-xs ${getStatusColor(title.status)}`}>{getStatusLabel(title.status)}</Badge>
                          {daysOverdue > 0 && <Badge className="bg-red-100 text-red-700 text-xs">{daysOverdue}d atraso</Badge>}
                        </div>
                        <p className="text-xs text-gray-500">Título {title.title_number} • Parc. {title.installment_number}/{title.total_installments}</p>
                        <p className="text-xs text-gray-400">Venc: {formatDate(title.due_date)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900">{formatCurrency(title.remaining_amount)}</p>
                        {title.paid_amount > 0 && <p className="text-xs text-green-600">Pago: {formatCurrency(title.paid_amount)}</p>}
                      </div>
                      {(title.status === 'a_vencer' || title.status === 'vencido' || title.status === 'pago_parcial') && (
                        <Button size="sm" onClick={() => { setPayingTitle(title); setPaymentAmount(String(title.remaining_amount)); }}
                          className="bg-green-600 hover:bg-green-700 text-white ml-2 flex-shrink-0">
                          <CheckCircle className="w-3.5 h-3.5 mr-1" />Receber
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      }

      {/* Payment modal */}
      {payingTitle && (
        <Dialog open onOpenChange={() => setPayingTitle(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Registrar Recebimento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-500">Título {payingTitle.title_number}</p>
                <p className="text-lg font-bold">{customers[payingTitle.customer_id]?.name}</p>
                <p className="text-sm">Saldo: <span className="font-bold text-red-600">{formatCurrency(payingTitle.remaining_amount)}</span></p>
              </div>
              <div>
                <Label>Valor recebido (R$)</Label>
                <Input className="mt-1" type="number" step="0.01" min="0.01"
                  value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
              </div>
              <div>
                <Label>Data do pagamento</Label>
                <Input className="mt-1" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setPayingTitle(null)} className="flex-1">Cancelar</Button>
                <Button onClick={handlePayment} disabled={paying} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                  {paying ? 'Salvando...' : 'Confirmar'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}