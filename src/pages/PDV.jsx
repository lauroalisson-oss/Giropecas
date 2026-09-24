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
import { Search, Package, Trash2, ShoppingCart, CheckCircle, Plus, Minus, CreditCard, PlusCircle, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { dividirPagamento, lancamentosDaVenda, taxaDeCartao, totalDeTaxas } from '@/lib/caixa';
import { faltaEmEstoque, avisoFaltaEmEstoque } from '@/lib/estoque';
import { pendenciasCrediario } from '@/lib/crm';
import StatusCrediario from '@/components/StatusCrediario';
import { hoje, somarMeses } from '@/lib/datas';

const ALL_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_debito', label: 'Débito' },
  { value: 'cartao_credito', label: 'Crédito' },
  { value: 'pix', label: 'PIX' },
  { value: 'crediario', label: 'Crediário' },
];

function newPayment() {
  return { method: 'dinheiro', amount: 0, installments: 1, brand: '', machine: 'Geral (todas)' };
}

export default function PDV() {
  const { company } = useCompany();
  const { toast } = useToast();
  const searchRef = useRef(null);

  const [parts, setParts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cardRates, setCardRates] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [discount, setDiscount] = useState(0);
  const [payments, setPayments] = useState([{ ...newPayment() }]);
  // Crediario extra
  const [installments, setInstallments] = useState(2);
  const [interestRate, setInterestRate] = useState(0);
  const [downPayment, setDownPayment] = useState(0);
  const [step, setStep] = useState('cart');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company?.id) loadData();
  }, [company]);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const loadData = async () => {
    const [pts, custs, cr] = await Promise.all([
      base44.entities.Part.filter({ company_id: company.id, is_active: true }),
      base44.entities.Customer.filter({ company_id: company.id, is_active: true }),
      base44.entities.CardRate.filter({ company_id: company.id }),
    ]);
    setParts(pts);
    setCustomers(custs);
    setCardRates(cr);
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
      return [...prev, { part_id: part.id, description: part.description, sku: part.sku, quantity: 1, unit_price: part.sale_price, total_price: part.sale_price, cost_price: part.cost_price || 0, max_stock: part.stock_quantity }];
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

  // A conta da taxa mora em lib/caixa.js, junto com a do modal de faturar
  // OS. Havia uma cópia em cada tela, e elas divergiram.
  const getCardFee = (payment) => taxaDeCartao(payment, cardRates);

  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const totalFees = totalDeTaxas(payments, cardRates);
  const cashPayments = payments.filter(p => p.method === 'dinheiro');
  const hasCash = cashPayments.length > 0;
  const cashPaid = cashPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const change = hasCash ? Math.max(0, totalPaid - total) : 0;

  const addPayment = () => setPayments(prev => [...prev, { ...newPayment(), amount: Math.max(0, total - totalPaid) }]);
  const removePayment = (idx) => setPayments(prev => prev.filter((_, i) => i !== idx));
  const updatePayment = (idx, field, value) => setPayments(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));

  // Auto-fill first payment amount when total changes
  useEffect(() => {
    if (payments.length === 1) {
      setPayments([{ ...payments[0], amount: total }]);
    }
  }, [total]);

  const hasCrediario = payments.some(p => p.method === 'crediario');
  // Desconta tudo o que já entrou (entrada e outros meios na mesma
  // venda), não só a entrada: financiar dinheiro que já está no caixa
  // criaria dívida que o cliente não tem.
  const { financiado: remainingForCredit } = dividirPagamento({
    total, pagamentos: payments, entrada: downPayment,
  });
  const installmentAmount = installments > 0 ? (remainingForCredit * (1 + interestRate / 100)) / installments : 0;

  const handleCheckout = async () => {
    if (cart.length === 0) { toast({ title: 'Carrinho vazio', variant: 'destructive' }); return; }
    if (hasCrediario && !selectedCustomer) { toast({ title: 'Selecione o cliente para crediário', variant: 'destructive' }); return; }
    if (hasCrediario && selectedCustomer) {
      const cust = customers.find(c => c.id === selectedCustomer);
      // A regra do crediário fica em lib/crm: CPF válido (com dígito
      // verificador) e data de nascimento. A checagem antiga aceitava
      // qualquer tax_id — inclusive CNPJ ou CPF digitado errado.
      const faltas = pendenciasCrediario(cust);
      if (!cust?.phone) faltas.push('Telefone não informado');
      if (faltas.length) {
        toast({
          title: 'Cadastro incompleto para crediário',
          description: faltas.join(' • '),
          variant: 'destructive',
        });
        return;
      }
    }
    if (!hasCrediario) {
      const isValid = hasCash ? totalPaid >= total - 0.01 : Math.abs(totalPaid - total) <= 0.01;
      if (!isValid) {
        toast({ title: 'Valor pago não confere com o total', description: `Total: ${formatCurrency(total)} | Pago: ${formatCurrency(totalPaid)}`, variant: 'destructive' });
        return;
      }
    }
    setSaving(true);
    try {
      const primaryMethod = payments.length === 1 ? payments[0].method : 'misto';
      const sale = await base44.entities.Sale.create({
        company_id: company.id,
        customer_id: selectedCustomer || null,
        type: 'pdv',
        items: cart.map(i => ({ type: 'part', ...i })),
        subtotal,
        discount: parseFloat(discount) || 0,
        total,
        payment_method: primaryMethod,
        payment_details: { payments, downPayment, installments, interestRate, totalFees },
        status: 'pago',
      });

      // Baixa de estoque. O saldo pode ficar negativo — a tela impede
      // colocar no carrinho mais do que há, mas o estoque pode ter mudado
      // entre montar o carrinho e fechar a venda. Zerar esconderia a
      // diferença; registrar o negativo mostra que a contagem saiu do ar.
      const faltasPdv = faltaEmEstoque(
        cart.map(i => ({ part_id: i.part_id, quantity: i.quantity, description: i.description })),
        Object.fromEntries(parts.map(p => [p.id, p])),
      );

      for (const item of cart) {
        const part = parts.find(p => p.id === item.part_id);
        if (part) {
          const newStock = (part.stock_quantity || 0) - item.quantity;
          await base44.entities.Part.update(item.part_id, { stock_quantity: newStock });
          await base44.entities.StockMovement.create({
            company_id: company.id, part_id: item.part_id, type: 'saida',
            // unit_cost é o CUSTO, não o preço de venda (o item já carrega
            // cost_price desde que foi posto no carrinho).
            quantity: item.quantity, unit_cost: Number(item.cost_price) || Number(part.cost_price) || 0,
            reason: 'PDV', reference_id: sale.id, reference_type: 'sale',
            previous_stock: part.stock_quantity, new_stock: newStock,
          });
        }
      }

      const avisoPdv = avisoFaltaEmEstoque(faltasPdv);
      if (avisoPdv) toast({ title: 'Estoque negativo', description: avisoPdv, variant: 'destructive' });

      // Generate credit titles for crediario payment
      if (hasCrediario) {
        // Vencimento: ver o mesmo trecho em PagamentoModal — dia 31 não
        // pode pular o mês seguinte.
        const base = hoje();
        for (let i = 0; i < installments; i++) {
          const dueDate = somarMeses(base, i + 1);
          await base44.entities.CreditTitle.create({
            company_id: company.id, customer_id: selectedCustomer, sale_id: sale.id,
            title_number: `${sale.id.slice(-6)}-${String(i + 1).padStart(2, '0')}`,
            installment_number: i + 1, total_installments: installments,
            original_amount: installmentAmount, total_amount: installmentAmount,
            paid_amount: 0, remaining_amount: installmentAmount,
            due_date: dueDate, status: 'a_vencer',
          });
        }
      }

      // Caixa: só o que ENTROU agora. O valor financiado no crediário
      // vira dívida do cliente e entra parcela a parcela — lançar o total
      // aqui somava a mesma venda duas vezes no faturamento.
      const { lancamentos } = lancamentosDaVenda({
        total,
        pagamentos: payments,
        entrada: downPayment,
        taxas: totalFees,
        categoria: 'Vendas PDV',
        descricao: 'Venda PDV',
        data: hoje(),
        saleId: sale.id,
        companyId: company.id,
      });
      for (const l of lancamentos) await base44.entities.AccountingEntry.create(l);

      setStep('success');
      loadData();
    } catch (e) {
      toast({ title: 'Erro ao processar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const resetPDV = () => {
    setCart([]); setSearch(''); setDiscount(0); setPayments([{ ...newPayment() }]);
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
        <p className="text-gray-500 mb-2">Pagamento registrado com sucesso</p>
        {totalFees > 0 && <p className="text-sm text-orange-600 mb-6">Taxa de cartão: {formatCurrency(totalFees)} descontada do lucro</p>}
        <Button onClick={resetPDV} className="bg-red-600 hover:bg-red-700 text-white">Nova Venda</Button>
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
        {/* Left: Search + Cart */}
        <div className="lg:col-span-3 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              ref={searchRef}
              placeholder="Buscar peça por nome ou SKU..."
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

          {cart.length === 0 && search.length <= 1 && (
            <div className="text-center py-16">
              <ShoppingCart className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400">Busque uma peça para adicionar ao carrinho</p>
            </div>
          )}

          {cart.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Itens ({cart.length})</CardTitle></CardHeader>
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
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><CreditCard className="w-4 h-4" />Pagamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">{hasCrediario ? 'Cliente (obrigatório para crediário)' : 'Cliente (opcional)'}</Label>
                <Select value={selectedCustomer || 'none'} onValueChange={v => setSelectedCustomer(v === 'none' ? '' : v)}>
                  <SelectTrigger className={`mt-1 ${hasCrediario ? 'border-yellow-400' : ''}`}><SelectValue placeholder="Sem cliente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem cliente</SelectItem>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{(!c.tax_id || !c.phone) ? ' ⚠️' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Avisa ANTES de tentar finalizar: o balconista corrige o
                    cadastro sem perder a venda montada. */}
                {hasCrediario && selectedCustomer && (
                  <div className="mt-2">
                    <StatusCrediario cliente={customers.find(c => c.id === selectedCustomer)} />
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs">Desconto (R$)</Label>
                <Input className="mt-1" type="number" min="0" step="0.01" value={discount}
                  onChange={e => setDiscount(e.target.value)} />
              </div>

              {/* Multiple payments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs">Formas de pagamento</Label>
                  <button onClick={addPayment} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                    <PlusCircle className="w-3 h-3" />Adicionar
                  </button>
                </div>
                <div className="space-y-3">
                  {payments.map((pay, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded-lg border space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <div className="grid grid-cols-3 gap-1">
                            {ALL_METHODS.map(m => (
                              <button key={m.value} onClick={() => updatePayment(idx, 'method', m.value)}
                                className={`py-1.5 px-1 text-xs font-medium rounded-md border transition-colors ${pay.method === m.value ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {payments.length > 1 && (
                          <button onClick={() => removePayment(idx)} className="text-gray-400 hover:text-red-500">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div>
                        <Label className="text-xs">{pay.method === 'dinheiro' ? 'Valor recebido (R$)' : 'Valor (R$)'}</Label>
                        <Input className="mt-0.5 h-8" type="number" min="0" step="0.01"
                          value={pay.amount} onChange={e => updatePayment(idx, 'amount', parseFloat(e.target.value) || 0)} />
                      </div>

                      {(pay.method === 'cartao_credito' || pay.method === 'cartao_debito') && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Bandeira</Label>
                            <Select value={pay.brand || 'none'} onValueChange={v => updatePayment(idx, 'brand', v === 'none' ? '' : v)}>
                              <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue placeholder="Bandeira" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Qualquer</SelectItem>
                                {['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard'].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          {pay.method === 'cartao_credito' && (
                            <div>
                              <Label className="text-xs">Parcelas</Label>
                              <Select value={String(pay.installments || 1)} onValueChange={v => updatePayment(idx, 'installments', parseInt(v))}>
                                <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 21 }, (_, i) => i + 1).map(n => <SelectItem key={n} value={String(n)}>{n}x</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Fee preview */}
                      {(pay.method === 'cartao_credito' || pay.method === 'cartao_debito') && getCardFee(pay) > 0 && (
                        <p className="text-xs text-orange-600">Taxa: -{formatCurrency(getCardFee(pay))}</p>
                      )}

                      {/* Crediario extra */}
                      {pay.method === 'crediario' && (
                        <div className="space-y-2 pt-2 border-t border-gray-200">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Entrada (R$)</Label>
                              <Input className="mt-0.5 h-8" type="number" min="0" step="0.01"
                                value={downPayment} onChange={e => setDownPayment(e.target.value)} />
                            </div>
                            <div>
                              <Label className="text-xs">Parcelas</Label>
                              <Input className="mt-0.5 h-8" type="number" min="1" max="24"
                                value={installments} onChange={e => setInstallments(parseInt(e.target.value) || 1)} />
                            </div>
                          </div>
                          <p className="text-xs text-yellow-700 font-medium">{installments}x de {formatCurrency(installmentAmount)}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                {parseFloat(discount) > 0 && <div className="flex justify-between text-green-600"><span>Desconto</span><span>-{formatCurrency(parseFloat(discount))}</span></div>}
                <div className="flex justify-between font-bold text-lg"><span>Total</span><span className="text-red-600">{formatCurrency(total)}</span></div>
                {totalFees > 0 && <div className="flex justify-between text-orange-600 text-xs"><span>Taxa cartão</span><span>-{formatCurrency(totalFees)}</span></div>}
                {payments.length > 1 && (
                  <div className={`flex justify-between text-xs font-medium ${Math.abs(totalPaid - total) < 0.01 || (hasCash && totalPaid >= total) ? 'text-green-600' : 'text-red-500'}`}>
                    <span>Total recebido</span><span>{formatCurrency(totalPaid)}</span>
                  </div>
                )}
                {hasCash && change > 0.01 && (
                  <div className="flex justify-between font-bold text-green-700 bg-green-50 rounded-lg px-3 py-2 mt-1">
                    <span>💵 Troco</span><span>{formatCurrency(change)}</span>
                  </div>
                )}
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