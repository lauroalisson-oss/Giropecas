import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, CreditCard, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Printer, Edit2, Save, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { validarPagamento, aplicarPagamento, emAberto } from '@/lib/crediario';
import CarneModal from '@/components/CarneModal';

export default function Crediario() {
  const { company } = useCompany();
  const { toast } = useToast();

  const [titles, setTitles] = useState([]);
  const [customers, setCustomers] = useState({});
  const [sales, setSales] = useState({});
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);

  // Payment modal state
  const [payingTitle, setPayingTitle] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paying, setPaying] = useState(false);

  // Expanded groups
  const [expandedGroups, setExpandedGroups] = useState({});

  // Carne modal
  const [carneData, setCarneData] = useState(null);

  // Edit date modal
  const [editingTitle, setEditingTitle] = useState(null);
  const [editDate, setEditDate] = useState('');

  useEffect(() => { if (company?.id) loadData(); }, [company]);

  const loadData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const [tits, custs, saleList] = await Promise.all([
        base44.entities.CreditTitle.filter({ company_id: company.id }, '-due_date', 500),
        base44.entities.Customer.filter({ company_id: company.id }),
        base44.entities.Sale.filter({ company_id: company.id }, '-created_date', 500),
      ]);

      // Auto-mark overdue in memory
      const updated = tits.map(t => ({
        ...t,
        status: t.status === 'a_vencer' && t.due_date < today ? 'vencido' : t.status,
      }));
      setTitles(updated);

      const custMap = {};
      custs.forEach(c => { custMap[c.id] = c; });
      setCustomers(custMap);

      const saleMap = {};
      saleList.forEach(s => { saleMap[s.id] = s; });
      setSales(saleMap);
    } finally {
      setLoading(false);
    }
  };

  // Group titles by sale_id (carnê)
  const groupsBySale = {};
  titles.forEach(t => {
    const key = t.sale_id || t.id;
    if (!groupsBySale[key]) groupsBySale[key] = [];
    groupsBySale[key].push(t);
  });

  // Filter groups based on search + tab
  const filteredGroups = Object.entries(groupsBySale).filter(([, grpTitles]) => {
    const repTitle = grpTitles[0];
    const cust = customers[repTitle?.customer_id];
    const matchSearch = !search ||
      cust?.name?.toLowerCase().includes(search.toLowerCase()) ||
      repTitle?.title_number?.includes(search);
    if (!matchSearch) return false;
    if (tab === 'vencido') return grpTitles.some(t => t.status === 'vencido');
    if (tab === 'a_vencer') return grpTitles.some(t => t.status === 'a_vencer');
    if (tab === 'pago') return grpTitles.every(t => t.status === 'pago' || t.status === 'cancelado');
    return grpTitles.some(t => t.status !== 'cancelado');
  });

  const totalReceivable = titles.filter(t => ['a_vencer', 'vencido', 'pago_parcial'].includes(t.status)).reduce((s, t) => s + (t.remaining_amount || 0), 0);
  const totalOverdue = titles.filter(t => t.status === 'vencido').reduce((s, t) => s + (t.remaining_amount || 0), 0);

  const toggleGroup = (key) => setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const handlePayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast({ title: 'Valor inválido', variant: 'destructive' }); return;
    }
    setPaying(true);
    try {
      const amount = parseFloat(paymentAmount);

      // Confere ANTES de gravar: o lançamento no caixa que vem logo
      // abaixo não se desfaz sozinho, e um recebimento a mais some no
      // meio do relatório do mês.
      const barrou = validarPagamento({ titulo: payingTitle, valor: amount });
      if (barrou) {
        toast({ title: 'Não foi possível receber', description: barrou.erro, variant: 'destructive' });
        setPaying(false);
        return;
      }

      await base44.entities.CreditTitle.update(payingTitle.id,
        aplicarPagamento({ titulo: payingTitle, valor: amount, data: paymentDate }));
      await base44.entities.AccountingEntry.create({
        company_id: company.id,
        date: paymentDate,
        type: 'credit',
        category: 'Recebimento Crediário',
        description: `Pgto título ${payingTitle.title_number} - Parc. ${payingTitle.installment_number}/${payingTitle.total_installments}`,
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

  const handleSaveDate = async () => {
    if (!editDate) return;
    await base44.entities.CreditTitle.update(editingTitle.id, { due_date: editDate });
    toast({ title: 'Data atualizada!' });
    setEditingTitle(null);
    loadData();
  };

  const openCarne = (grpTitles) => {
    const repTitle = grpTitles[0];
    const sale = sales[repTitle?.sale_id];
    const customer = customers[repTitle?.customer_id];
    setCarneData({ titles: grpTitles, customer, sale });
  };

  const agingBuckets = [
    { label: 'A vencer', filter: t => t.status === 'a_vencer', color: 'border-blue-200 bg-blue-50 text-blue-800' },
    { label: '1–30 dias', filter: t => { if (t.status !== 'vencido') return false; const d = Math.floor((Date.now() - new Date(t.due_date)) / 86400000); return d >= 1 && d <= 30; }, color: 'border-yellow-200 bg-yellow-50 text-yellow-800' },
    { label: '31–60 dias', filter: t => { if (t.status !== 'vencido') return false; const d = Math.floor((Date.now() - new Date(t.due_date)) / 86400000); return d >= 31 && d <= 60; }, color: 'border-orange-200 bg-orange-50 text-orange-800' },
    { label: '+60 dias', filter: t => { if (t.status !== 'vencido') return false; const d = Math.floor((Date.now() - new Date(t.due_date)) / 86400000); return d > 60; }, color: 'border-red-200 bg-red-50 text-red-800' },
  ].map(b => ({ ...b, count: titles.filter(b.filter).length, total: titles.filter(b.filter).reduce((s, t) => s + (t.remaining_amount || 0), 0) }));

  const statusBadge = (t) => {
    if (t.status === 'pago') return <Badge className="bg-green-100 text-green-700 text-xs">Pago</Badge>;
    if (t.status === 'vencido') {
      const days = Math.floor((Date.now() - new Date(t.due_date)) / 86400000);
      return <Badge className="bg-red-100 text-red-700 text-xs">{days}d atraso</Badge>;
    }
    if (t.status === 'pago_parcial') return <Badge className="bg-yellow-100 text-yellow-700 text-xs">Parcial</Badge>;
    return <Badge className="bg-blue-100 text-blue-700 text-xs">A vencer</Badge>;
  };

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Crediário</h1>
        <p className="text-gray-500 text-sm">Gestão de carnês e cobranças</p>
      </div>

      {/* Summary */}
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
              <p className="font-bold">{b.count} parcelas</p>
              <p className="text-xs">{formatCurrency(b.total)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + tabs */}
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

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : filteredGroups.length === 0 ? (
        <div className="text-center py-16">
          <CreditCard className="w-14 h-14 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500">Nenhum carnê encontrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map(([key, grpTitles]) => {
            const sorted = [...grpTitles].sort((a, b) => a.installment_number - b.installment_number);
            const repTitle = sorted[0];
            const cust = customers[repTitle?.customer_id];
            const isExpanded = expandedGroups[key];
            const totalGrp = grpTitles.reduce((s, t) => s + (t.total_amount || 0), 0);
            const paidGrp = grpTitles.reduce((s, t) => s + (t.paid_amount || 0), 0);
            const remainingGrp = grpTitles.reduce((s, t) => s + (t.remaining_amount || 0), 0);
            const paidCount = grpTitles.filter(t => t.status === 'pago').length;
            const hasOverdue = grpTitles.some(t => t.status === 'vencido');

            return (
              <Card key={key} className={`transition-shadow hover:shadow-md ${hasOverdue ? 'border-red-200' : ''}`}>
                {/* Group header */}
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-gray-900">{cust?.name || 'Cliente'}</span>
                        {hasOverdue && <Badge className="bg-red-100 text-red-700 text-xs">Em atraso</Badge>}
                        <Badge className="bg-gray-100 text-gray-600 text-xs">{paidCount}/{grpTitles.length} parcelas pagas</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>Carnê #{repTitle?.title_number?.split('-')[0] || key.slice(-6)}</span>
                        <span>Total: <strong>{formatCurrency(totalGrp)}</strong></span>
                        <span>Pago: <strong className="text-green-600">{formatCurrency(paidGrp)}</strong></span>
                        <span>Saldo: <strong className="text-red-600">{formatCurrency(remainingGrp)}</strong></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" variant="outline" onClick={() => openCarne(sorted)}
                        className="text-xs h-8 px-2">
                        <Printer className="w-3.5 h-3.5 mr-1" />Carnê
                      </Button>
                      <button onClick={() => toggleGroup(key)} className="text-gray-400 hover:text-gray-700 p-1">
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-green-500 transition-all"
                      style={{ width: totalGrp > 0 ? `${(paidGrp / totalGrp) * 100}%` : '0%' }}
                    />
                  </div>
                </CardContent>

                {/* Installment list */}
                {isExpanded && (
                  <div className="border-t divide-y">
                    {sorted.map(title => {
                      const isPending = ['a_vencer', 'vencido', 'pago_parcial'].includes(title.status);
                      return (
                        <div key={title.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                            bg-gray-100 text-gray-600">
                            {title.installment_number}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {statusBadge(title)}
                              <span className="text-xs text-gray-500">Venc: {formatDate(title.due_date)}</span>
                              {title.paid_amount > 0 && title.status !== 'pago' && (
                                <span className="text-xs text-green-600">Pago: {formatCurrency(title.paid_amount)}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold text-sm">{formatCurrency(title.remaining_amount)}</p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Edit date */}
                            {isPending && (
                              <button
                                onClick={() => { setEditingTitle(title); setEditDate(title.due_date); }}
                                className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                                title="Editar data"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Confirm payment */}
                            {isPending && (
                              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 px-2 text-xs"
                                onClick={() => { setPayingTitle(title); setPaymentAmount(String(emAberto(title))); }}>
                                <CheckCircle className="w-3 h-3 mr-1" />Receber
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Payment modal */}
      {payingTitle && (
        <Dialog open onOpenChange={() => setPayingTitle(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Confirmar Recebimento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Parcela {payingTitle.installment_number}/{payingTitle.total_installments}</p>
                <p className="text-base font-bold">{customers[payingTitle.customer_id]?.name}</p>
                <p className="text-sm">Saldo: <span className="font-bold text-red-600">{formatCurrency(emAberto(payingTitle))}</span></p>
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

      {/* Edit date modal */}
      {editingTitle && (
        <Dialog open onOpenChange={() => setEditingTitle(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Editar Vencimento — Parc. {editingTitle.installment_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Nova data de vencimento</Label>
                <Input className="mt-1" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setEditingTitle(null)} className="flex-1">Cancelar</Button>
                <Button onClick={handleSaveDate} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                  <Save className="w-4 h-4 mr-1" />Salvar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Carnê modal */}
      {carneData && (
        <CarneModal
          titles={carneData.titles}
          customer={carneData.customer}
          sale={carneData.sale}
          company={company}
          onClose={() => setCarneData(null)}
        />
      )}
    </div>
  );
}