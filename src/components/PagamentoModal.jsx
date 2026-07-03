import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { CreditCard, DollarSign } from 'lucide-react';

const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_debito', label: 'Cartão Débito' },
  { value: 'cartao_credito', label: 'Cartão Crédito' },
  { value: 'pix', label: 'PIX' },
  { value: 'crediario', label: 'Crediário' },
];

export default function PagamentoModal({ order, customer, onClose, onSuccess }) {
  const { company } = useCompany();
  const { toast } = useToast();
  const total = order?.total || 0;

  const [method, setMethod] = useState('dinheiro');
  const [downPayment, setDownPayment] = useState(0);
  const [installments, setInstallments] = useState(2);
  const [interestRate, setInterestRate] = useState(company?.default_interest_rate || 0);
  const [saving, setSaving] = useState(false);

  const remainingForCredit = total - (parseFloat(downPayment) || 0);
  const installmentAmount = installments > 0 ? (remainingForCredit * (1 + interestRate / 100)) / installments : 0;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      // Create sale
      const sale = await base44.entities.Sale.create({
        company_id: company.id,
        customer_id: order.customer_id,
        work_order_id: order.id,
        type: 'os',
        items: [...(order.parts_items || []).map(i => ({ ...i, type: 'part' })), ...(order.service_items || []).map(i => ({ ...i, type: 'service' }))],
        subtotal: (order.parts_total || 0) + (order.services_total || 0),
        discount: order.discount || 0,
        total: total,
        payment_method: method,
        payment_details: { downPayment, installments, interestRate },
        status: 'pago',
      });

      // Deduct stock for parts
      if (order.parts_items?.length > 0) {
        for (const item of order.parts_items) {
          if (item.part_id) {
            const part = await base44.entities.Part.get(item.part_id);
            const newStock = (part.stock_quantity || 0) - (item.quantity || 0);
            await base44.entities.Part.update(item.part_id, { stock_quantity: Math.max(0, newStock) });
            await base44.entities.StockMovement.create({
              company_id: company.id,
              part_id: item.part_id,
              type: 'saida',
              quantity: item.quantity,
              unit_cost: item.unit_price,
              reason: `OS #${order.order_number}`,
              reference_id: order.id,
              reference_type: 'work_order',
              previous_stock: part.stock_quantity,
              new_stock: Math.max(0, newStock),
            });
          }
        }
      }

      // If crediario: generate titles
      if (method === 'crediario') {
        const today = new Date();
        if (parseFloat(downPayment) > 0) {
          await base44.entities.AccountingEntry.create({
            company_id: company.id,
            date: today.toISOString().split('T')[0],
            type: 'credit',
            category: 'Vendas',
            description: `Entrada OS #${order.order_number}`,
            amount: parseFloat(downPayment),
            reference_id: sale.id,
            reference_type: 'sale',
          });
        }
        for (let i = 0; i < installments; i++) {
          const dueDate = new Date(today);
          dueDate.setMonth(dueDate.getMonth() + i + 1);
          await base44.entities.CreditTitle.create({
            company_id: company.id,
            customer_id: order.customer_id,
            sale_id: sale.id,
            title_number: `${sale.id.slice(-6)}-${String(i + 1).padStart(2, '0')}`,
            installment_number: i + 1,
            total_installments: installments,
            original_amount: installmentAmount,
            interest_amount: installmentAmount - (remainingForCredit / installments),
            total_amount: installmentAmount,
            paid_amount: 0,
            remaining_amount: installmentAmount,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'a_vencer',
          });
        }
      } else {
        // Cash sale accounting entry
        const today = new Date();
        await base44.entities.AccountingEntry.create({
          company_id: company.id,
          date: today.toISOString().split('T')[0],
          type: 'credit',
          category: 'Vendas',
          description: `Venda OS #${order.order_number}`,
          amount: total,
          reference_id: sale.id,
          reference_type: 'sale',
        });
      }

      // Update order status
      await base44.entities.WorkOrder.update(order.id, { status: 'faturada', sale_id: sale.id, closed_at: new Date().toISOString() });

      onSuccess();
    } catch (e) {
      toast({ title: 'Erro ao processar pagamento', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
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

          <div>
            <Label>Forma de Pagamento</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {method === 'crediario' && (
            <div className="space-y-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <h4 className="text-sm font-semibold text-yellow-800">Condições de Crediário</h4>
              <div>
                <Label className="text-xs">Entrada (R$)</Label>
                <Input className="mt-1" type="number" min="0" step="0.01" value={downPayment}
                  onChange={e => setDownPayment(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Nº de parcelas</Label>
                <Input className="mt-1" type="number" min="1" max="36" value={installments}
                  onChange={e => setInstallments(parseInt(e.target.value) || 1)} />
              </div>
              <div>
                <Label className="text-xs">Juros (%)</Label>
                <Input className="mt-1" type="number" min="0" step="0.1" value={interestRate}
                  onChange={e => setInterestRate(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="border-t border-yellow-200 pt-2 space-y-1 text-xs">
                <div className="flex justify-between"><span>Saldo a parcelar</span><span className="font-medium">{formatCurrency(remainingForCredit)}</span></div>
                <div className="flex justify-between font-semibold"><span>{installments}x de</span><span>{formatCurrency(installmentAmount)}</span></div>
              </div>
            </div>
          )}

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