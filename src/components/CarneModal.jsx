import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Printer, X } from 'lucide-react';

export default function CarneModal({ titles, customer, company, sale, onClose }) {
  const printRef = useRef(null);

  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=800,height=900');
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>Carnê - ${customer?.name}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 12px; background: #fff; }
            .carne-page { padding: 10px; }
            .parcela { border: 1px solid #333; border-radius: 4px; margin-bottom: 8px; page-break-inside: avoid; }
            .parcela-header { background: #1a1a1a; color: white; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center; border-radius: 3px 3px 0 0; }
            .parcela-header .empresa { font-size: 13px; font-weight: bold; }
            .parcela-header .num { font-size: 11px; }
            .parcela-body { padding: 8px 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
            .parcela-body .field { margin-bottom: 2px; }
            .parcela-body .label { font-size: 9px; color: #666; text-transform: uppercase; }
            .parcela-body .value { font-size: 11px; font-weight: 600; color: #111; }
            .parcela-footer { border-top: 1px dashed #999; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center; }
            .valor-total { font-size: 16px; font-weight: bold; color: #c00; }
            .vencimento { font-size: 10px; color: #444; }
            .itens { padding: 4px 10px 6px; border-top: 1px solid #eee; }
            .itens-label { font-size: 9px; text-transform: uppercase; color: #888; margin-bottom: 2px; }
            .item-row { font-size: 10px; color: #333; display: flex; justify-content: space-between; }
            .assinatura { border-top: 1px solid #aaa; margin-top: 6px; padding-top: 4px; font-size: 9px; color: #888; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body><div class="carne-page">${content}</div></body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  const sortedTitles = [...titles].sort((a, b) => a.installment_number - b.installment_number);
  const items = sale?.items || [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Carnê de Crediário — {customer?.name}</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={handlePrint} className="bg-red-600 hover:bg-red-700 text-white">
                <Printer className="w-4 h-4 mr-1" />Imprimir
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Preview */}
        <div ref={printRef} className="space-y-3 mt-2">
          {sortedTitles.map((title) => (
            <div key={title.id} className="parcela border border-gray-800 rounded">
              {/* Cabeçalho */}
              <div className="parcela-header bg-gray-900 text-white px-3 py-2 flex justify-between items-center rounded-t">
                <span className="empresa font-bold text-sm">{company?.name || 'Oficina'}</span>
                <span className="num text-xs">Parcela {title.installment_number}/{title.total_installments}</span>
              </div>

              {/* Dados */}
              <div className="parcela-body grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2">
                <div className="field">
                  <div className="label text-xs text-gray-500">Cliente</div>
                  <div className="value text-sm font-semibold">{customer?.name}</div>
                </div>
                <div className="field">
                  <div className="label text-xs text-gray-500">CPF</div>
                  <div className="value text-sm font-semibold">{customer?.tax_id || '—'}</div>
                </div>
                <div className="field">
                  <div className="label text-xs text-gray-500">Telefone</div>
                  <div className="value text-sm font-semibold">{customer?.phone || '—'}</div>
                </div>
                <div className="field">
                  <div className="label text-xs text-gray-500">Título</div>
                  <div className="value text-sm font-semibold">{title.title_number}</div>
                </div>
              </div>

              {/* Itens comprados */}
              {items.length > 0 && (
                <div className="itens px-3 pb-2 border-t border-gray-200">
                  <div className="itens-label text-xs text-gray-400 mt-1 mb-1">Itens</div>
                  {items.slice(0, 4).map((item, idx) => (
                    <div key={idx} className="item-row flex justify-between text-xs text-gray-600">
                      <span className="truncate max-w-[180px]">{item.description} x{item.quantity}</span>
                      <span>{formatCurrency(item.total_price)}</span>
                    </div>
                  ))}
                  {items.length > 4 && <div className="text-xs text-gray-400">+{items.length - 4} itens...</div>}
                </div>
              )}

              {/* Rodapé com valor e vencimento */}
              <div className="parcela-footer flex items-center justify-between px-3 py-2 border-t border-dashed border-gray-400">
                <div>
                  <div className="text-xs text-gray-500">Vencimento</div>
                  <div className="text-sm font-semibold">{formatDate(title.due_date)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Valor</div>
                  <div className="text-lg font-bold text-red-600">{formatCurrency(title.total_amount)}</div>
                </div>
              </div>

              {/* Assinatura */}
              <div className="px-3 pb-2">
                <div className="border-t border-gray-300 pt-2 text-xs text-gray-400">
                  Assinatura do devedor: ___________________________________
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}