import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { CreditCard, DollarSign, PlusCircle, X } from 'lucide-react';

const ALL_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_debito', label: 'Débito' },
  { value: 'cartao_credito', label: 'Crédito' },
  { value: 'pix', label: 'PIX' },
  { value: 'crediario', label: 'Crediário' },
];

function newPayment(amount = 0) {
  return { method: 'dinheiro', amount, installments: 1, brand: '', absorbFee: false };
}

export default function PagamentoModal({ order, customer, onClose, onSuccess }) {
  const { company } = useCompany();
  const { toast } = useToast();
  const total = order?.total || 0;

  const [payments, setPayments] = useState([newPayment(total)]);
  const [cardRates, setCardRates] = useState([]);
  // Crediario
  const [downPayment, setDownPayment] = useState(0);
  const [installments, setInstallments] = useState(2);
  const [interestRate, setInterestRate] = useState(company?.default_interest_rate || 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company?.id) {
      base44.entities.CardRate.filter({ company_id: company.id }).then(setCardRates);
    }
  }, [company]);

  const hasCrediario = payments.some(p => p.method === 'crediario');

  const getCardFee = (payment) => {
    if (payment.method !== 'cartao_credito' && payment.method !== 'cartao_debito') return 0;
    if (payment.absorbFee) return 0; // empresa absorve, não desconta do lucro do ponto de vista do cliente
    const rate = cardRates.find(r =>
      (r.brand === payment.brand || !payment.brand || r.brand === 'Outras') &&
      (r.machine === 'Geral (todas)')
    ) || cardRates[0];
    if (!rate) return 0;
    if (payment.method === 'cartao_debito') return (payment.amount * (rate.debit_rate || 0)) / 100;
    const creditRate = rate.credit_rates?.[String(payment.installments)] || 0;
    return (payment.amount * creditRate) / 100;
  };

  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const totalFees = payments.reduce((s, p) => getCardFee(p), 0);
  const remainingForCredit = total - (parseFloat(downPayment) || 0);
  const installmentAmount = installments > 0 ? (remainingForCredit * (1 + interestRate / 100)) / installments : 0;

  const updatePayment = (idx, field, value) =>
    setPayments(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  const addPayment = () =>
    setPayments(prev => [...prev, newPayment(Math.max(0, total - totalPaid))]);
  const removePayment = (idx) =>
    setPayments(prev => prev.filter((_, i) => i !== idx));

  // Auto-update first payment when there's only one
  useEffect(() => {
    if (payments.length === 1) {
      setPayments([{ ...payments[0], amount: total }]);
    }
  }, [total]);

  const handleConfirm = async () => {
    // Crediario validation
    if (hasCrediario) {
      if (!customer?.tax_id || !customer?.name || !customer?.phone) {
        toast({ title: 'Cadastro incompleto para crediário', description: 'O cliente precisa ter CPF, Nome completo e Telefone.', variant: 'destructive' });
        return;
      }
    }
    // Amount validation (skip for crediário only payment)
    if (!hasCrediario && Math.abs(totalPaid - total) > 0.01) {
      toast({ title: 'Valor não confere', description: `Total: ${formatCurrency(total)} | Pago: ${formatCurrency(totalPaid)}`, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const primaryMethod = payments.length === 1 ? payments[0].method : 'misto';

      const sale = await base44.entities.Sale.create({
        company_id: company.id,
        customer_id: order.customer_id,
        work_order_id: order.id,
        type: 'os',
        items: [
          ...(order.parts_items || []).map(i => ({ ...i, type: 'part' })),
          ...(order.service_items || []).map(i => ({ ...i, type: 'service' })),
        ],
        subtotal: (order.parts_total || 0) + (order.services_total || 0),
        discount: order.discount || 0,
        total,
        payment_method: primaryMethod,
        payment_details: { payments, downPayment, installments, interestRate, totalFees },
        status: 'pago',
      });

      // Deduct stock
      if (order.parts_items?.length > 0) {
        for (const item of order.parts_items) {
          if (item.part_id) {
            const part = await base44.entities.Part.get(item.part_id);
            const newStock = Math.max(0, (part.stock_quantity || 0) - (item.quantity || 0));
            await base44.entities.Part.update(item.part_id, { stock_quantity: newStock });
            await base44.entities.StockMovement.create({
              company_id: company.id, part_id: item.part_id, type: 'saida',
              quantity: item.quantity, unit_cost: item.unit_price,
              reason: `OS #${order.order_number}`, reference_id: order.id, reference_type: 'work_order',
              previous_stock: part.stock_quantity, new_stock: newStock,
            });
          }
        }
      }

      // Crediário titles
      if (hasCrediario) {
        const today = new Date();
        if (parseFloat(downPayment) > 0) {
          await base44.entities.AccountingEntry.create({
            company_id: company.id, date: today.toISOString().split('T')[0],
            type: 'credit', category: 'Vendas', description: `Entrada OS #${order.order_number}`,
            amount: parseFloat(downPayment), reference_id: sale.id, reference_type: 'sale',
          });
        }
        for (let i = 0; i < installments; i++) {
          const dueDate = new Date(today);
          dueDate.setMonth(dueDate.getMonth() + i + 1);
          await base44.entities.CreditTitle.create({
            company_id: company.id, customer_id: order.customer_id, sale_id: sale.id,
            title_number: `${sale.id.slice(-6)}-${String(i + 1).padStart(2, '0')}`,
            installment_number: i + 1, total_installments: installments,
            original_amount: installmentAmount,
            interest_amount: installmentAmount - (remainingForCredit / installments),
            total_amount: installmentAmount, paid_amount: 0, remaining_amount: installmentAmount,
            due_date: dueDate.toISOString().split('T')[0], status: 'a_vencer',
          });
        }
      }

      // Accounting entries
      const today = new Date().toISOString().split('T')[0];
      await base44.entities.AccountingEntry.create({
        company_id: company.id, date: today,
        type: 'credit', category: 'Vendas OS',
        description: `Venda OS #${order.order_number}`,
        amount: total, reference_id: sale.id, reference_type: 'sale',
      });

      if (totalFees > 0) {
        await base44.entities.AccountingEntry.create({
          company_id: company.id, date: today,
          type: 'debit', category: 'Taxas de Cartão',
          description: `Taxa cartão OS #${order.order_number}`,
          amount: totalFees, reference_id: sale.id, reference_type: 'sale',
        });
      }

      // Update work order
      await base44.entities.WorkOrder.update(order.id, {
        status: 'faturada', sale_id: sale.id, closed_at: new Date().toISOString(),
      });

      onSuccess();
    } catch (e) {
      toast({ title: 'Erro ao processar pagamento', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-red-600" />Faturar OS #{order.order_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-sm text-gray-500">Total da OS</p>
            <p className="text-3xl font-bold text-red-600">{formatCurrency(total)}</p>
          </div>

          {/* Multiple payments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Formas de Pagamento</Label>
              <button onClick={addPayment} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <PlusCircle className="w-3 h-3" />Adicionar
              </button>
            </div>
            <div className="space-y-3">
              {payments.map((pay, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg border space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 grid grid-cols-3 gap-1">
                      {ALL_METHODS.map(m => (
                        <button key={m.value} onClick={() => updatePayment(idx, 'method', m.value)}
                          className={`py-1.5 px-1 text-xs font-medium rounded-md border transition-colors ${pay.method === m.value ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                    {payments.length > 1 && (
                      <button onClick={() => removePayment(idx)} className="text-gray-400 hover:text-red-500 flex-shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs">Valor (R$)</Label>
                    <Input className="mt-0.5 h-8" type="number" min="0" step="0.01"
                      value={pay.amount} onChange={e => updatePayment(idx, 'amount', parseFloat(e.target.value) || 0)} />
                  </div>

                  {/* Card options */}
                  {(pay.method === 'cartao_credito' || pay.method === 'cartao_debito') && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Bandeira</Label>
                          <Select value={pay.brand || 'none'} onValueChange={v => updatePayment(idx, 'brand', v === 'none' ? '' : v)}>
                            <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue placeholder="Qualquer" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Qualquer</SelectItem>
                              {['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard'].map(b => (
                                <SelectItem key={b} value={b}>{b}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {pay.method === 'cartao_credito' && (
                          <div>
                            <Label className="text-xs">Parcelas</Label>
                            <Select value={String(pay.installments || 1)} onValueChange={v => updatePayment(idx, 'installments', parseInt(v))}>
                              <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 21 }, (_, i) => i + 1).map(n => (
                                  <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      {/* Absorb fee toggle */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updatePayment(idx, 'absorbFee', !pay.absorbFee)}
                          className={`relative w-9 h-5 rounded-full transition-colors ${pay.absorbFee ? 'bg-blue-500' : 'bg-gray-300'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${pay.absorbFee ? 'translate-x-4' : ''}`} />
                        </button>
                        <span className="text-xs text-gray-600">
                          {pay.absorbFee ? 'Empresa absorve a taxa (cliente paga valor normal)' : 'Repassar taxa ao cliente'}
                        </span>
                      </div>

                      {/* Fee preview */}
                      {getCardFee(pay) > 0 && (
                        <p className="text-xs text-orange-600 bg-orange-50 rounded px-2 py-1">
                          Taxa estimada: -{formatCurrency(getCardFee(pay))} (será abatida do lucro)
                        </p>
                      )}
                      {pay.absorbFee && (
                        <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1">
                          Taxa absorvida pela empresa — lucro líquido menor
                        </p>
                      )}
                    </div>
                  )}

                  {/* Crediário options */}
                  {pay.method === 'crediario' && (
                    <div className="space-y-2 pt-2 border-t border-yellow-200 bg-yellow-50 -mx-3 -mb-3 px-3 pb-3 rounded-b-lg">
                      <p className="text-xs font-semibold text-yellow-800">Condições do Crediário</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Entrada (R$)</Label>
                          <Input className="mt-0.5 h-8" type="number" min="0" step="0.01"
                            value={downPayment} onChange={e => setDownPayment(e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-xs">Parcelas</Label>
                          <Input className="mt-0.5 h-8" type="number" min="1" max="36"
                            value={installments} onChange={e => setInstallments(parseInt(e.target.value) || 1)} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Juros ao mês (%)</Label>
                        <Input className="mt-0.5 h-8" type="number" min="0" step="0.1"
                          value={interestRate} onChange={e => setInterestRate(parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="text-xs space-y-0.5 pt-1">
                        <div className="flex justify-between"><span>Saldo a parcelar</span><span className="font-medium">{formatCurrency(remainingForCredit)}</span></div>
                        <div className="flex justify-between font-semibold text-yellow-900"><span>{installments}x de</span><span>{formatCurrency(installmentAmount)}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between font-bold text-base">
              <span>Total OS</span><span className="text-red-600">{formatCurrency(total)}</span>
            </div>
            {payments.length > 1 && (
              <div className={`flex justify-between text-xs ${Math.abs(totalPaid - total) < 0.01 ? 'text-green-600' : 'text-red-500'}`}>
                <span>Total pago</span><span>{formatCurrency(totalPaid)}</span>
              </div>
            )}
            {totalFees > 0 && (
              <div className="flex justify-between text-xs text-orange-600">
                <span>Taxa de cartão (abate do lucro)</span><span>-{formatCurrency(totalFees)}</span>
              </div>
            )}
            {totalFees > 0 && (
              <div className="flex justify-between text-xs font-medium text-gray-700">
                <span>Líquido recebido</span><span>{formatCurrency(total - totalFees)}</span>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button onClick={handleConfirm} disabled={saving} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
              <DollarSign className="w-4 h-4 mr-1" />{saving ? 'Processando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}