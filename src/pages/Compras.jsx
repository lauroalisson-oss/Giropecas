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
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ShoppingCart, CheckCircle2, Package, Search, X, DollarSign } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  podeReceber, podeRegistrarPagamento, dataDePagamento,
  lancamentoPagamentoCompra, situacaoCompra, aPagarEmCompras,
} from '@/lib/compras';
import { hoje } from '@/lib/datas';

const STATUS_CONFIG = {
  rascunho: { label: 'Rascunho', color: 'bg-gray-100 text-gray-700' },
  enviada: { label: 'Enviada', color: 'bg-blue-100 text-blue-700' },
  parcial: { label: 'Parcial', color: 'bg-orange-100 text-orange-700' },
  recebida: { label: 'Recebida', color: 'bg-green-100 text-green-700' },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-700' },
};

export default function Compras() {
  const { company } = useCompany();
  const { toast } = useToast();
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recebendo, setRecebendo] = useState(null);
  const [pagando, setPagando] = useState(null);
  const [dataPgto, setDataPgto] = useState('');
  const [formaPgto, setFormaPgto] = useState('pix');
  const [salvandoPgto, setSalvandoPgto] = useState(false);
  const [form, setForm] = useState({
    supplier_id: '', expected_date: '', notes: '', items: []
  });
  const [itemForm, setItemForm] = useState({ part_id: '', quantity: 1, unit_cost: 0 });

  useEffect(() => { loadData(); }, [company]);

  const loadData = async () => {
    if (!company?.id) return;
    setLoading(true);
    const [p, s, partsData] = await Promise.all([
      base44.entities.Purchase.filter({ company_id: company.id }, '-created_date'),
      base44.entities.Supplier.filter({ company_id: company.id, is_active: true }),
      base44.entities.Part.filter({ company_id: company.id }),
    ]);
    setPurchases(p); setSuppliers(s); setParts(partsData);
    setLoading(false);
  };

  const addItem = () => {
    if (!itemForm.part_id || !itemForm.quantity) return;
    const part = parts.find(p => p.id === itemForm.part_id);
    setForm(f => ({
      ...f,
      items: [...f.items, {
        part_id: part.id,
        description: part.description,
        quantity: parseInt(itemForm.quantity),
        unit_cost: parseFloat(itemForm.unit_cost) || part.cost_price || 0,
        received_quantity: 0,
        total_price: (parseInt(itemForm.quantity)) * (parseFloat(itemForm.unit_cost) || part.cost_price || 0),
      }]
    }));
    setItemForm({ part_id: '', quantity: 1, unit_cost: 0 });
  };

  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const total = form.items.reduce((s, i) => s + i.total_price, 0);

  const handleSave = async () => {
    if (form.items.length === 0) { toast({ title: 'Adicione ao menos 1 item', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const orderNum = `OC-${Date.now().toString().slice(-6)}`;
      await base44.entities.Purchase.create({
        ...form,
        company_id: company.id,
        order_number: orderNum,
        total,
        status: 'rascunho',
      });
      toast({ title: 'Ordem de compra criada!' });
      setForm({ supplier_id: '', expected_date: '', notes: '', items: [] });
      setShowModal(false);
      loadData();
    } catch (e) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const receivePurchase = async (purchase) => {
    // Receber soma ao estoque, e somar duas vezes nao se desfaz sozinho.
    // O botao so sumia DEPOIS do recarregamento, entao um clique duplo
    // dava entrada em dobro.
    const barrou = podeReceber(purchase);
    if (barrou) {
      toast({ title: 'Não foi possível receber', description: barrou.erro, variant: 'destructive' });
      return;
    }
    if (recebendo) return;
    setRecebendo(purchase.id);

    try {
    for (const item of purchase.items || []) {
      if (!item.part_id) continue;
      // Le o saldo do banco, nao da lista carregada ao abrir a tela: o
      // estoque pode ter mudado numa venda enquanto a pagina estava
      // aberta, e somar sobre um saldo velho apagaria essa saida.
      const part = await base44.entities.Part.get(item.part_id).catch(() => null);
      if (!part) continue;
      const newQty = (part.stock_quantity || 0) + (item.quantity || 0);
      await base44.entities.Part.update(part.id, { stock_quantity: newQty, cost_price: item.unit_cost || part.cost_price });
      await base44.entities.StockMovement.create({
        company_id: company.id,
        part_id: part.id,
        type: 'entrada',
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        reason: `OC ${purchase.order_number}`,
        reference_type: 'purchase',
        reference_id: purchase.id,
        previous_stock: part.stock_quantity || 0,
        new_stock: newQty,
      });
    }
      await base44.entities.Purchase.update(purchase.id, {
        status: 'recebida', received_date: hoje(),
      });
      toast({
        title: 'Compra recebida',
        description: 'Estoque atualizado. O custo entra no caixa quando você registrar o pagamento.',
      });
      loadData();
    } catch (e) {
      toast({ title: 'Erro ao receber', description: e.message, variant: 'destructive' });
    } finally {
      setRecebendo(null);
    }
  };

  const abrirPagamento = (compra) => {
    const barrou = podeRegistrarPagamento(compra);
    if (barrou) {
      toast({ title: 'Não foi possível', description: barrou.erro, variant: 'destructive' });
      return;
    }
    setPagando(compra);
    // Sugere hoje, mas a oficina pode corrigir: um pagamento lançado com
    // atraso tem de cair no mês em que aconteceu.
    setDataPgto(hoje());
    setFormaPgto('pix');
  };

  const confirmarPagamento = async () => {
    const compra = pagando;
    const barrou = podeRegistrarPagamento(compra);
    if (barrou) {
      toast({ title: 'Não foi possível', description: barrou.erro, variant: 'destructive' });
      return;
    }
    setSalvandoPgto(true);
    try {
      const quando = dataDePagamento(dataPgto);

      // O custo entra no caixa AGORA, com a data em que o pagamento
      // aconteceu — é isso que faz a despesa cair no mês certo.
      await base44.entities.AccountingEntry.create(
        lancamentoPagamentoCompra({ compra, data: quando, companyId: company.id }),
      );
      await base44.entities.Purchase.update(compra.id, {
        payment_status: 'pago',
        payment_date: quando,
        payment_method: formaPgto,
      });

      toast({
        title: 'Pagamento registrado',
        description: `${formatCurrency(compra.total || 0)} lançado no caixa em ${formatDate(quando)}.`,
      });
      setPagando(null);
      loadData();
    } catch (e) {
      toast({ title: 'Erro ao registrar', description: e.message, variant: 'destructive' });
    } finally {
      setSalvandoPgto(false);
    }
  };

  const pendentes = aPagarEmCompras(purchases);

  const filtered = purchases.filter(p =>
    p.order_number?.toLowerCase().includes(search.toLowerCase()) ||
    p.notes?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Compras & Ordens de Compra</h1>
          <p className="text-gray-500 text-sm">{purchases.length} ordens</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="bg-red-600 hover:bg-red-700 text-white">
          <Plus className="w-4 h-4 mr-2" />Nova OC
        </Button>
      </div>

      {pendentes.quantidade > 0 && (
        <Card className="mb-4 border-orange-200 bg-orange-50">
          <CardContent className="p-4 flex items-start gap-3">
            <DollarSign className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-orange-900">
                {pendentes.quantidade} compra(s) recebida(s) e ainda não paga(s) — {formatCurrency(pendentes.total)}
              </p>
              <p className="text-orange-800 mt-1">
                As peças já estão no estoque. O custo só entra no caixa quando você registrar
                o pagamento, com a data em que ele aconteceu.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="Buscar ordem de compra..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {loading ? <p className="text-center text-gray-400 py-10">Carregando...</p> :
        filtered.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingCart className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">Nenhuma ordem de compra</p>
            <Button onClick={() => setShowModal(true)} className="bg-red-600 hover:bg-red-700 text-white"><Plus className="w-4 h-4 mr-2" />Criar Primeira OC</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(p => (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                        <ShoppingCart className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{p.order_number}</p>
                        <p className="text-xs text-gray-500">
                          {p.expected_date && `Entrega prevista: ${formatDate(p.expected_date)}`}
                          {p.received_date && ` • Recebida: ${formatDate(p.received_date)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={STATUS_CONFIG[p.status]?.color}>{STATUS_CONFIG[p.status]?.label}</Badge>
                      {p.status !== 'cancelada' && (
                        situacaoCompra(p).paga ? (
                          <Badge className="bg-blue-100 text-blue-700">
                            Pago {p.payment_date ? `· ${formatDate(p.payment_date)}` : ''}
                          </Badge>
                        ) : (
                          <Badge className="bg-orange-100 text-orange-700">Pgto pendente</Badge>
                        )
                      )}
                      <p className="font-bold text-gray-900">{formatCurrency(p.total || 0)}</p>
                    </div>
                  </div>
                  {(p.items || []).length > 0 && (
                    <div className="text-xs text-gray-500 mt-2 border-t pt-2">
                      {(p.items || []).slice(0, 3).map((it, i) => (
                        <span key={i} className="inline-block mr-3">{it.quantity}x {it.description?.substring(0, 25)}</span>
                      ))}
                      {p.items.length > 3 && <span>+{p.items.length - 3} itens</span>}
                    </div>
                  )}
                  <div className="flex gap-2 mt-3 flex-wrap">
                  {p.status !== 'recebida' && p.status !== 'cancelada' && (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                      disabled={!!recebendo} onClick={() => receivePurchase(p)}>
                      <CheckCircle2 className="w-4 h-4 mr-2" />Receber mercadoria
                    </Button>
                  )}
                  {p.status !== 'cancelada' && !situacaoCompra(p).paga && (
                    <Button size="sm" variant="outline" disabled={!!pagando}
                      className="border-blue-200 text-blue-700 hover:bg-blue-50"
                      onClick={() => abrirPagamento(p)}>
                      <DollarSign className="w-4 h-4 mr-2" />Registrar pagamento
                    </Button>
                  )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      }

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova Ordem de Compra</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fornecedor</Label>
                <Select value={form.supplier_id} onValueChange={v => setForm(f => ({ ...f, supplier_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>— Nenhum —</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Entrega prevista</Label>
                <Input type="date" className="mt-1" value={form.expected_date} onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))} />
              </div>
            </div>

            {/* Add item */}
            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium">Adicionar Item</p>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-6">
                  <Select value={itemForm.part_id} onValueChange={v => {
                    const p = parts.find(p => p.id === v);
                    setItemForm(f => ({ ...f, part_id: v, unit_cost: p?.cost_price || 0 }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Selecione a peça" /></SelectTrigger>
                    <SelectContent>
                      {parts.map(p => <SelectItem key={p.id} value={p.id}>{p.description}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Input type="number" placeholder="Qtd" value={itemForm.quantity} onChange={e => setItemForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div className="col-span-3">
                  <Input type="number" step="0.01" placeholder="Custo unit." value={itemForm.unit_cost} onChange={e => setItemForm(f => ({ ...f, unit_cost: e.target.value }))} />
                </div>
                <div className="col-span-1">
                  <Button size="icon" onClick={addItem}><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
            </div>

            {/* Items list */}
            {form.items.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {form.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b text-sm">
                    <span>{it.quantity}x {it.description}</span>
                    <span className="font-medium">{formatCurrency(it.total_price)}</span>
                    <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
            {form.items.length > 0 && (
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Total</span><span>{formatCurrency(total)}</span>
              </div>
            )}
            <div>
              <Label>Observações</Label>
              <Textarea className="mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Salvando...' : 'Criar OC'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pagando} onOpenChange={() => { if (!salvandoPgto) setPagando(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-blue-600" />Registrar pagamento
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="bg-gray-50 border rounded-lg p-3 text-sm">
              <p className="font-semibold text-gray-900">{pagando?.order_number}</p>
              <p className="text-gray-600">{formatCurrency(pagando?.total || 0)}</p>
            </div>

            <div>
              <Label className="text-xs">Data do pagamento</Label>
              <Input className="mt-1" type="date" value={dataPgto}
                onChange={e => setDataPgto(e.target.value)} />
              <p className="text-xs text-gray-500 mt-1">
                O custo entra no caixa nesta data. Se você está lançando um pagamento
                antigo, corrija a data para o mês fechar certo.
              </p>
            </div>

            <div>
              <Label className="text-xs">Forma de pagamento</Label>
              <Select value={formaPgto} onValueChange={setFormaPgto}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                  <SelectItem value="cartao">Cartão</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={salvandoPgto}
              onClick={() => setPagando(null)}>Cancelar</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={salvandoPgto} onClick={confirmarPagamento}>
              {salvandoPgto ? 'Registrando...' : 'Registrar pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}