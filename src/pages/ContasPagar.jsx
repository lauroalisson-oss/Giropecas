import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, CheckCircle2, Calendar, Wallet, AlertTriangle, Search } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { podePagar, impactoExclusaoConta } from '@/lib/compras';

const CATEGORIES = [
  { value: 'aluguel', label: 'Aluguel' },
  { value: 'energia', label: 'Energia' },
  { value: 'agua', label: 'Água' },
  { value: 'telefone', label: 'Telefone/Internet' },
  { value: 'folha', label: 'Folha/Pró-labore' },
  { value: 'impostos', label: 'Impostos' },
  { value: 'fornecedor', label: 'Fornecedor' },
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'outros', label: 'Outros' },
];

const METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'debito_auto', label: 'Débito Automático' },
];

export default function ContasPagar() {
  const { company } = useCompany();
  const { toast } = useToast();
  const [bills, setBills] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocupado, setOcupado] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const [form, setForm] = useState({
    description: '', category: 'outros', amount: '', due_date: '',
    payment_method: 'pix', recurrence: 'unica', supplier_id: '', notes: ''
  });

  useEffect(() => { loadData(); }, [company]);

  const loadData = async () => {
    if (!company?.id) return;
    setLoading(true);
    const [billsData, supsData] = await Promise.all([
      base44.entities.Bill.filter({ company_id: company.id }, 'due_date'),
      base44.entities.Supplier.filter({ company_id: company.id, is_active: true }),
    ]);
    // Auto-mark overdue
    const today = new Date().toISOString().split('T')[0];
    const updated = billsData.map(b => {
      if (b.status === 'a_vencer' && b.due_date < today) return { ...b, status: 'vencido' };
      return b;
    });
    setBills(updated);
    setSuppliers(supsData);
    setLoading(false);
  };

  const set = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  const handleSave = async () => {
    if (!form.description.trim() || !form.amount || !form.due_date) {
      toast({ title: 'Preencha descrição, valor e vencimento', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await base44.entities.Bill.create({
        ...form,
        company_id: company.id,
        amount: parseFloat(form.amount),
        status: 'a_vencer',
      });
      toast({ title: 'Conta cadastrada!' });
      setForm({ description: '', category: 'outros', amount: '', due_date: '', payment_method: 'pix', recurrence: 'unica', supplier_id: '', notes: '' });
      setShowModal(false);
      loadData();
    } catch (e) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const markPaid = async (bill) => {
    // Marcar como paga lança uma saída no caixa. O botão só sumia DEPOIS
    // do recarregamento, então um clique duplo lançava a despesa em
    // dobro — e um débito a mais some no meio do relatório do mês.
    const barrou = podePagar(bill);
    if (barrou) {
      toast({ title: 'Não foi possível pagar', description: barrou.erro, variant: 'destructive' });
      return;
    }
    if (ocupado) return;
    setOcupado(bill.id);

    try {
      const today = new Date().toISOString().split('T')[0];
      await base44.entities.Bill.update(bill.id, { status: 'pago', payment_date: today });
      await base44.entities.AccountingEntry.create({
        company_id: company.id,
        date: today,
        type: 'debit',
        category: bill.category,
        description: `Pg: ${bill.description}`,
        amount: bill.amount,
        reference_type: 'manual',
        reference_id: bill.id,
      });
      toast({ title: 'Conta marcada como paga' });
      loadData();
    } catch (e) {
      toast({ title: 'Erro ao pagar', description: e.message, variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const handleDelete = async (bill) => {
    const impacto = impactoExclusaoConta(bill);

    // Excluir uma conta JÁ PAGA deixava a saída no caixa sem nada atrás
    // dela: o relatório mostrava a despesa e ninguém sabia de onde vinha.
    const pergunta = impacto.paga
      ? `Esta conta está PAGA (${formatCurrency(impacto.valor)}).\n\n`
        + 'Excluir remove também o lançamento de saída no caixa — use isto '
        + 'só se a conta foi registrada por engano. Se o pagamento aconteceu '
        + 'de verdade, deixe-a no histórico.\n\nExcluir mesmo assim?'
      : 'Excluir esta conta?';

    if (!confirm(pergunta)) return;

    try {
      if (impacto.removeLancamento) {
        await base44.entities.AccountingEntry.deleteMany({ reference_id: bill.id });
      }
      await base44.entities.Bill.delete(bill.id);
      toast({
        title: 'Conta excluída',
        description: impacto.removeLancamento ? 'O lançamento no caixa saiu junto.' : undefined,
      });
      loadData();
    } catch (e) {
      toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' });
    }
  };

  const filtered = bills.filter(b => {
    const matchSearch = b.description?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || b.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalPagar = bills.filter(b => b.status !== 'pago').reduce((s, b) => s + (b.amount || 0), 0);
  const totalVencido = bills.filter(b => b.status === 'vencido').reduce((s, b) => s + (b.amount || 0), 0);
  const totalMes = bills.filter(b => {
    const now = new Date();
    const d = new Date(b.due_date);
    return b.status !== 'pago' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, b) => s + (b.amount || 0), 0);

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Contas a Pagar</h1>
        <Button onClick={() => setShowModal(true)} className="bg-red-600 hover:bg-red-700 text-white">
          <Plus className="w-4 h-4 mr-2" />Nova Conta
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-gray-500" />
              <p className="text-xs text-gray-500">Total a Pagar</p>
            </div>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(totalPagar)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <p className="text-xs text-gray-500">Vencido</p>
            </div>
            <p className="text-lg font-bold text-red-600">{formatCurrency(totalVencido)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-blue-500" />
              <p className="text-xs text-gray-500">Este Mês</p>
            </div>
            <p className="text-lg font-bold text-blue-600">{formatCurrency(totalMes)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Buscar conta..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="a_vencer">A Vencer</SelectItem>
            <SelectItem value="vencido">Vencidas</SelectItem>
            <SelectItem value="pago">Pagas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-10 text-gray-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400">Nenhuma conta encontrada</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(bill => (
            <Card key={bill.id} className={bill.status === 'vencido' ? 'border-red-300' : ''}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{bill.description}</p>
                    {bill.status === 'vencido' && <Badge className="bg-red-100 text-red-700 text-xs">Vencido</Badge>}
                    {bill.status === 'pago' && <Badge className="bg-green-100 text-green-700 text-xs">Pago</Badge>}
                    {bill.status === 'a_vencer' && <Badge className="bg-blue-100 text-blue-700 text-xs">A Vencer</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{CATEGORIES.find(c => c.value === bill.category)?.label || bill.category}</span>
                    <span>Venc: {formatDate(bill.due_date)}</span>
                    {bill.payment_date && <span>Pago: {formatDate(bill.payment_date)}</span>}
                  </div>
                </div>
                <p className="text-sm font-bold text-gray-900">{formatCurrency(bill.amount)}</p>
                {bill.status !== 'pago' && (
                  <Button size="sm" variant="outline" disabled={!!ocupado} onClick={() => markPaid(bill)}
                    className="text-green-600 border-green-200 hover:bg-green-50">
                    <CheckCircle2 className="w-4 h-4" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => handleDelete(bill)} className="text-red-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Conta a Pagar</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Descrição *</Label>
              <Input className="mt-1" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ex: Aluguel do mês" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={v => set('category', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fornecedor</Label>
                <Select value={form.supplier_id} onValueChange={v => set('supplier_id', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="— Nenhum —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>— Nenhum —</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor (R$) *</Label>
                <Input className="mt-1" type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label>Vencimento *</Label>
                <Input className="mt-1" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pagamento via</Label>
                <Select value={form.payment_method} onValueChange={v => set('payment_method', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Recorrência</Label>
                <Select value={form.recurrence} onValueChange={v => set('recurrence', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unica">Única</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea className="mt-1" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Salvando...' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}