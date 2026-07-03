import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Package, Trash2, ShoppingCart, CheckCircle, Plus, Minus, CreditCard } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_debito', label: 'Débito' },
  { value: 'cartao_credito', label: 'Crédito' },
  { value: 'pix', label: 'PIX' },
  { value: 'crediario', label: 'Crediário' },
];

export default function PDV() {
  const { company } = useCompany();
  const { toast } = useToast();
  const searchRef = useRef(null);

  const [parts, setParts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('dinheiro');
  const [installments, setInstallments] = useState(2);
  const [interestRate, setInterestRate] = useState(0);
  const [downPayment, setDownPayment] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [step, setStep] = useState('cart'); // cart | payment | success
  const [saving, setSaving] = useState(false);
  const [lastSaleId, setLastSaleId] = useState(null);

  useEffect(() => {
    if (company?.id) loadData();
  }, [company]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const loadData = async () => {
    const [pts, custs] = await Promise.all([
      base44.entities.Part.filter({ company_id: company.id, is_active: true }),
      base44.entities.Customer.filter({ company_id: company.id, is_active: true }),
    ]);
    setParts(pts);
    setCustomers(custs);
  };

  const filteredParts = search.length > 1 ? parts.filter(p =>
    p.description?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 10) : [];

  const addToCart = (part) => {
    if ((part.stock_quantity || 0) <= 0) {
      toast({ title: 'Sem estoque!', description: part.description, variant: 'destructive' });
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.part_id === part.id);
      if (existing) {
        if (existing.quantity >= (part.stock_quantity || 0)) {
          toast({ title: 'Quantidade máxima atingida', variant: 'destructive' });
          return prev;
        }
        return prev.map(i => i.part_id === part.id ? { ...i, quantity: i.quantity + 1, total_price: (i.quantity + 1) * i.unit_price } : i);
      }
      return [...prev, { part_id: part.id, description: part.description, sku: part.sku, quantity: 1, unit_price: part.sale_price, total_price: part.sale_price, max_stock: part.stock_quantity }];
    });
    setSearch('');
    searchRef.current?.focus();
  };

  const updateQty = (partId, qty) => {
    if (qty <= 0) { removeFromCart(partId); return; }
    setCart(prev => prev.map(i => i.part_id === partId ? { ...i, quantity: qty, total_price: qty * i.unit_price } : i));
  };

  const removeFromCart = (partId) => setCart(prev => prev.filter(i => i.part_id !== partId));

  const subtotal = cart.reduce((s, i) => s + i.total_price, 0);
  const total = subtotal - (parseFloat(discount) || 0);
  const remainingForCredit = total - (parseFloat(downPayment) || 0);
  const installmentAmount = installments > 0 ? (remainingForCredit * (1 + interestRate / 100)) / installments : 0;

  const handleCheckout = async () => {
    if (cart.length === 0) { toast({ title: 'Carrinho vazio', variant: 'destructive' }); return; }
    if (paymentMethod === 'crediario' && !selectedCustomer) { toast({ title: 'Selecione o cliente para crediário', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const sale = await base44.entities.Sale.create({
        company_id: company.id,
        customer_id: selectedCustomer || null,
        type: 'pdv',
        items: cart.map(i => ({ type: 'part', ...i })),
        subtotal,
        discount: parseFloat(discount) || 0,
        total,
        payment_method: paymentMethod,
        payment_details: paymentMethod === 'crediario' ? { downPayment, installments, interestRate } : {},
        status: 'pago',
      });

      // Deduct stock
      for (const item of cart) {
        const part = parts.find(p => p.id === item.part_id);
        if (part) {
          const newStock = (part.stock_quantity || 0) - item.quantity;
          await base44.entities.Part.update(item.part_id, { stock_quantity: Math.max(0, newStock) });
          await base44.entities.StockMovement.create({
            company_id: company.id, part_id: item.part_id, type: 'saida',
            quantity: item.quantity, unit_cost: item.unit_price,
            reason: 'PDV', reference_id: sale.id, reference_type: 'sale',
            previous_stock: part.stock_quantity, new_stock: Math.max(0, newStock),
          });
        }
      }

      // Generate credit titles
      if (paymentMethod === 'crediario') {
        const today = new Date();
        for (let i = 0; i < installments; i++) {
          const dueDate = new Date(today);
          dueDate.setMonth(dueDate.getMonth() + i + 1);
          await base44.entities.CreditTitle.create({
            company_id: company.id, customer_id: selectedCustomer, sale_id: sale.id,
            title_number: `${sale.id.slice(-6)}-${String(i + 1).padStart(2, '0')}`,
            installment_number: i + 1, total_installments: installments,
            original_amount: installmentAmount, total_amount: installmentAmount,
            paid_amount: 0, remaining_amount: installmentAmount,
            due_date: dueDate.toISOString().split('T')[0], status: 'a_vencer',
          });
        }
      }

      // Accounting
      await base44.entities.AccountingEntry.create({
        company_id: company.id, date: new Date().toISOString().split('T')[0],
        type: 'credit', category: 'Vendas PDV', description: 'Venda PDV',
        amount: total, reference_id: sale.id, reference_type: 'sale',
      });

      setLastSaleId(sale.id);
      setStep('success');
      loadData();
    } catch (e) {
      toast({ title: 'Erro ao processar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const resetPDV = () => {
    setCart([]); setSearch(''); setDiscount(0); setPaymentMethod('dinheiro');
    setSelectedCustomer(''); setInstallments(2); setDownPayment(0); setStep('cart');
    searchRef.current?.focus();
  };

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Venda Confirmada!</h2>
        <p className="text-gray-500 mb-8">Pagamento registrado com sucesso</p>
        <div className="flex gap-3">
          <Button onClick={resetPDV} className="bg-red-600 hover:bg-red-700 text-white">Nova Venda</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">PDV Rápido</h1>
        <p className="text-gray-500 text-sm">Venda direta de peças no balcão</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Search */}
        <div className="lg:col-span-3 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              ref={searchRef}
              placeholder="Buscar peça por nome ou SKU... (F2)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-11 h-12 text-base"
              autoFocus
            />
          </div>

          {filteredParts.length > 0 && (
            <Card>
              <CardContent className="p-0 divide-y">
                {filteredParts.map(part => (
                  <button key={part.id} onClick={() => addToCart(part)}
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 text-left transition-colors">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{part.description}</p>
                      <p className="text-xs text-gray-400">{part.sku} • Estoque: {part.stock_quantity || 0}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">{formatCurrency(part.sale_price)}</p>
                      {(part.stock_quantity || 0) <= 0 && <Badge className="bg-red-100 text-red-700 text-xs">Sem estoque</Badge>}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {search.length > 1 && filteredParts.length === 0 && (
            <div className="text-center py-8 text-gray-400">Nenhuma peça encontrada para "{search}"</div>
          )}

          {cart.length === 0 && search.length <= 1 && (
            <div className="text-center py-16">
              <ShoppingCart className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400">Busque uma peça para adicionar ao carrinho</p>
            </div>
          )}

          {/* Cart items */}
          {cart.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Itens no Carrinho ({cart.length})</CardTitle></CardHeader>
              <CardContent className="p-0 divide-y">
                {cart.map(item => (
                  <div key={item.part_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.description}</p>
                      <p className="text-xs text-gray-400">{item.sku} • {formatCurrency(item.unit_price)} un</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(item.part_id, item.quantity - 1)}
                        className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <button onClick={() => updateQty(item.part_id, item.quantity + 1)}
                        className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="font-bold w-20 text-right">{formatCurrency(item.total_price)}</p>
                    <button onClick={() => removeFromCart(item.part_id)}>
                      <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Payment */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="w-4 h-4" />Pagamento</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">Cliente (opcional)</Label>
                <Select value={selectedCustomer || 'none'} onValueChange={v => setSelectedCustomer(v === 'none' ? '' : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Sem cliente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem cliente</SelectItem>
                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Forma de pagamento</Label>
                <div className="grid grid-cols-3 gap-1 mt-1">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                      className={`py-2 px-1 text-xs font-medium rounded-lg border-2 transition-colors ${paymentMethod === m.value ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs">Desconto (R$)</Label>
                <Input className="mt-1" type="number" min="0" step="0.01" value={discount}
                  onChange={e => setDiscount(e.target.value)} />
              </div>

              {paymentMethod === 'crediario' && (
                <div className="space-y-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-xs font-semibold text-yellow-800">Crediário</p>
                  <div>
                    <Label className="text-xs">Entrada (R$)</Label>
                    <Input className="mt-1" type="number" min="0" step="0.01" value={downPayment} onChange={e => setDownPayment(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Parcelas</Label>
                    <Input className="mt-1" type="number" min="1" max="24" value={installments} onChange={e => setInstallments(parseInt(e.target.value) || 1)} />
                  </div>
                  <div className="text-xs text-yellow-700 font-medium">
                    {installments}x de {formatCurrency(installmentAmount)}
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                {parseFloat(discount) > 0 && <div className="flex justify-between text-green-600"><span>Desconto</span><span>-{formatCurrency(parseFloat(discount))}</span></div>}
                <div className="flex justify-between font-bold text-lg"><span>Total</span><span className="text-red-600">{formatCurrency(total)}</span></div>
              </div>

              <Button onClick={handleCheckout} disabled={saving || cart.length === 0}
                className="w-full h-12 bg-green-600 hover:bg-green-700 text-white text-base font-semibold">
                {saving ? 'Processando...' : `Confirmar ${formatCurrency(total)}`}
              </Button>

              {cart.length > 0 && (
                <Button variant="outline" onClick={resetPDV} className="w-full text-gray-600">Limpar carrinho</Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}