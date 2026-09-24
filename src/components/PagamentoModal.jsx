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
import { dividirPagamento, lancamentosDaVenda, taxaDeCartao, totalDeTaxas } from '@/lib/caixa';
import { avisoFaltaEmEstoque } from '@/lib/estoque';
import { CreditCard, DollarSign, PlusCircle, X } from 'lucide-react';
import { hoje, somarMeses } from '@/lib/datas';

const ALL_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_debito', label: 'Débito' },
  { value: 'cartao_credito', label: 'Crédito' },
  { value: 'pix', label: 'PIX' },
  { value: 'crediario', label: 'Crediário' },
];

function newPayment(amount = 0) {
  // `machine` igual ao PDV: as duas telas passam a mesma forma de
  // pagamento para a mesma função de taxa.
  return { method: 'dinheiro', amount, installments: 1, brand: '', machine: 'Geral (todas)', absorbFee: false };
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

  // A conta da taxa mora em lib/caixa.js, junto com a do PDV. Aqui havia
  // uma cópia, e a cópia tinha divergido em três pontos: somava errado,
  // ignorava a maquininha e zerava a taxa quando a empresa a absorvia.
  const getCardFee = (payment) => taxaDeCartao(payment, cardRates);

  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const totalFees = totalDeTaxas(payments, cardRates);
  const hasCash = payments.some(p => p.method === 'dinheiro');
  const change = hasCash ? Math.max(0, totalPaid - total) : 0;
  // O que sobra para financiar é o total menos TUDO que entrou agora —
  // entrada e qualquer outro meio lançado na mesma venda. Descontar só a
  // entrada financiaria dinheiro que já está no caixa.
  const { recebidoAgora, financiado: remainingForCredit } = dividirPagamento({
    total, pagamentos: payments, entrada: downPayment,
  });
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
    // Amount validation — cash payments can exceed total (change); non-cash must match exactly
    if (!hasCrediario) {
      const isValid = hasCash ? totalPaid >= total - 0.01 : Math.abs(totalPaid - total) <= 0.01;
      if (!isValid) {
        toast({ title: 'Valor não confere', description: `Total: ${formatCurrency(total)} | Pago: ${formatCurrency(totalPaid)}`, variant: 'destructive' });
        return;
      }
    }

    setSaving(true);
    try {
      const primaryMethod = payments.length === 1 ? payments[0].method : 'misto';

      // Lê as peças ANTES de criar a venda: o custo precisa ser gravado
      // no item, e a baixa de estoque usa a mesma leitura.
      const ids = [...new Set((order.parts_items || []).map(i => i.part_id).filter(Boolean))];
      const pecas = {};
      for (const id of ids) {
        const p = await base44.entities.Part.get(id).catch(() => null);
        if (p) pecas[id] = p;
      }

      const sale = await base44.entities.Sale.create({
        company_id: company.id,
        customer_id: order.customer_id,
        work_order_id: order.id,
        type: 'os',
        items: [
          // O custo da peça é gravado NO ITEM, congelado no momento da
          // venda. O cadastro guarda o último custo de compra e muda a
          // cada entrada — usá-lo depois faria a margem deste mês mudar
          // sozinha quando chegasse a próxima compra.
          ...(order.parts_items || []).map(i => ({
            ...i,
            type: 'part',
            cost_price: i.cost_price ?? (Number(pecas[i.part_id]?.cost_price) || 0),
          })),
          ...(order.service_items || []).map(i => ({ ...i, type: 'service' })),
        ],
        subtotal: (order.parts_total || 0) + (order.services_total || 0),
        discount: order.discount || 0,
        total,
        payment_method: primaryMethod,
        payment_details: { payments, downPayment, installments, interestRate, totalFees },
        status: 'pago',
      });

      // Baixa de estoque.
      //
      // O saldo PODE ficar negativo, e isso é de propósito: a peça já foi
      // instalada na moto do cliente. Zerar e engolir a diferença faria a
      // oficina achar que a contagem bate.
      const faltas = [];
      if (order.parts_items?.length > 0) {
        for (const item of order.parts_items) {
          if (item.part_id) {
            const part = pecas[item.part_id];
            if (!part) continue;
            const saldo = part.stock_quantity || 0;
            const qtd = item.quantity || 0;
            if (qtd > saldo) {
              faltas.push({ part_id: item.part_id, descricao: part.description || item.description, saldo, pedido: qtd, falta: qtd - saldo });
            }
            const newStock = saldo - qtd;
            await base44.entities.Part.update(item.part_id, { stock_quantity: newStock });
            await base44.entities.StockMovement.create({
              company_id: company.id, part_id: item.part_id, type: 'saida',
              // unit_cost é o CUSTO da peça, não o preço de venda. Estava
              // guardando unit_price, e qualquer relatório construído sobre
              // este campo leria o preço de venda como se fosse custo.
              quantity: item.quantity, unit_cost: Number(part.cost_price) || 0,
              reason: `OS #${order.order_number}`, reference_id: order.id, reference_type: 'work_order',
              previous_stock: part.stock_quantity, new_stock: newStock,
            });
          }
        }
      }

      const aviso = avisoFaltaEmEstoque(faltas);
      if (aviso) toast({ title: 'Estoque negativo', description: aviso, variant: 'destructive' });

      // Crediário titles
      if (hasCrediario) {
        // Vencimento: somarMeses segura o dia 31 no último dia do mês.
        // setMonth cru jogava 31/01 + 1 mês em 03/03 — a parcela de
        // fevereiro sumia e o cliente recebia duas cobranças em março.
        const base = hoje();
        for (let i = 0; i < installments; i++) {
          const dueDate = somarMeses(base, i + 1);
          await base44.entities.CreditTitle.create({
            company_id: company.id, customer_id: order.customer_id, sale_id: sale.id,
            title_number: `${sale.id.slice(-6)}-${String(i + 1).padStart(2, '0')}`,
            installment_number: i + 1, total_installments: installments,
            original_amount: installmentAmount,
            interest_amount: installmentAmount - (remainingForCredit / installments),
            total_amount: installmentAmount, paid_amount: 0, remaining_amount: installmentAmount,
            due_date: dueDate, status: 'a_vencer',
          });
        }
      }

      // Caixa: só o que ENTROU agora.
      //
      // O valor financiado no crediário não é dinheiro em caixa — vira
      // dívida do cliente e entra parcela a parcela. Lançar o total aqui
      // somava a mesma venda duas vezes no faturamento.
      const { lancamentos } = lancamentosDaVenda({
        total,
        pagamentos: payments,
        entrada: downPayment,
        taxas: totalFees,
        categoria: 'Vendas OS',
        descricao: `Venda OS #${order.order_number}`,
        data: hoje(),
        saleId: sale.id,
        companyId: company.id,
      });
      for (const l of lancamentos) await base44.entities.AccountingEntry.create(l);

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
                    <Label className="text-xs">{pay.method === 'dinheiro' ? 'Valor recebido (R$)' : 'Valor (R$)'}</Label>
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

                      {/* Quem pagou a taxa — anotação, não conta.
                          A maquininha desconta a taxa do depósito de
                          qualquer jeito, então o débito no caixa existe
                          nas duas posições. O que muda é se ela já foi
                          embutida no preço da OS. Antes, "empresa
                          absorve" zerava a taxa: a única posição que
                          prometia lucro menor era justamente a que
                          deixava o lucro intacto. */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updatePayment(idx, 'absorbFee', !pay.absorbFee)}
                          className={`relative w-9 h-5 rounded-full transition-colors ${pay.absorbFee ? 'bg-blue-500' : 'bg-gray-300'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${pay.absorbFee ? 'translate-x-4' : ''}`} />
                        </button>
                        <span className="text-xs text-gray-600">
                          {pay.absorbFee
                            ? 'A oficina absorveu a taxa (não entrou no preço)'
                            : 'A taxa já está embutida no preço da OS'}
                        </span>
                      </div>

                      {/* Fee preview */}
                      {getCardFee(pay) > 0 && (
                        <p className="text-xs text-orange-600 bg-orange-50 rounded px-2 py-1">
                          Taxa da maquininha: -{formatCurrency(getCardFee(pay))} — sai do caixa nas duas opções
                        </p>
                      )}
                      {getCardFee(pay) === 0 && (pay.method === 'cartao_credito' || pay.method === 'cartao_debito') && (
                        <p className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
                          Sem taxa cadastrada para esta maquininha/bandeira — cadastre em Taxas de Cartão
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
              <div className={`flex justify-between text-xs ${Math.abs(totalPaid - total) < 0.01 || (hasCash && totalPaid >= total) ? 'text-green-600' : 'text-red-500'}`}>
                <span>Total recebido</span><span>{formatCurrency(totalPaid)}</span>
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
            {hasCash && change > 0.01 && (
              <div className="flex justify-between font-bold text-green-700 bg-green-50 rounded-lg px-3 py-2 mt-1">
                <span>💵 Troco</span><span>{formatCurrency(change)}</span>
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