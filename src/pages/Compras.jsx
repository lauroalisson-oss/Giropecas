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
import { Plus, Trash2, ShoppingCart, CheckCircle2, Package, Search, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

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
    // Atualiza estoque das peças
    for (const item of purchase.items || []) {
      if (!item.part_id) continue;
      const part = parts.find(p => p.id === item.part_id);
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
    await base44.entities.Purchase.update(purchase.id, { status: 'recebida', received_date: new Date().toISOString().split('T')[0] });
    toast({ title: 'Compra recebida! Estoque atualizado.' });
    loadData();
  };

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
                  {p.status !== 'recebida' && p.status !== 'cancelada' && (
                    <Button size="sm" className="mt-3 bg-green-600 hover:bg-green-700 text-white" onClick={() => receivePurchase(p)}>
                      <CheckCircle2 className="w-4 h-4 mr-2" />Reber Mercadoria
                    </Button>
                  )}
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
    </div>
  );
}