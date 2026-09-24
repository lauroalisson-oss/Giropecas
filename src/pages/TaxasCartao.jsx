import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard, Save, Trash2, Copy } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { BANDEIRAS, MAQUINAS } from '@/lib/caixa';

// A mesma lista das telas de pagamento — ver lib/caixa.js.
const BRANDS = BANDEIRAS;
const MACHINES = MAQUINAS;
const MAX_INSTALLMENTS = 21;

function emptyRates() {
  const r = {};
  for (let i = 1; i <= MAX_INSTALLMENTS; i++) r[String(i)] = 0;
  return r;
}

export default function TaxasCartao() {
  const { company } = useCompany();
  const { toast } = useToast();

  const [rates, setRates] = useState([]);
  const [saving, setSaving] = useState(false);

  // Batch form
  const [batchBrand, setBatchBrand] = useState('');
  const [batchMachine, setBatchMachine] = useState('Geral (todas)');
  const [batchDebit, setBatchDebit] = useState(0);
  const [batchCredit, setBatchCredit] = useState(emptyRates());

  // Clone
  const [cloneFrom, setCloneFrom] = useState('');
  const [cloneTo, setCloneTo] = useState('');

  useEffect(() => {
    if (company?.id) loadRates();
  }, [company]);

  const loadRates = async () => {
    const data = await base44.entities.CardRate.filter({ company_id: company.id });
    setRates(data);
  };

  const handleBatchCreditChange = (installment, value) => {
    setBatchCredit(prev => ({ ...prev, [String(installment)]: parseFloat(value) || 0 }));
  };

  const handleSaveBatch = async () => {
    if (!batchBrand) { toast({ title: 'Selecione a bandeira', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      // Check if already exists
      const existing = rates.find(r => r.brand === batchBrand && r.machine === batchMachine);
      const data = {
        company_id: company.id,
        brand: batchBrand,
        machine: batchMachine,
        debit_rate: parseFloat(batchDebit) || 0,
        credit_rates: batchCredit,
      };
      if (existing) {
        await base44.entities.CardRate.update(existing.id, data);
      } else {
        await base44.entities.CardRate.create(data);
      }
      toast({ title: `Taxas salvas para ${batchBrand} — ${batchMachine}` });
      loadRates();
      // Reset
      setBatchBrand('');
      setBatchDebit(0);
      setBatchCredit(emptyRates());
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    await base44.entities.CardRate.delete(id);
    toast({ title: 'Taxa removida' });
    loadRates();
  };

  const handleClone = async () => {
    if (!cloneFrom || !cloneTo) { toast({ title: 'Selecione as maquininhas', variant: 'destructive' }); return; }
    const source = rates.filter(r => r.machine === cloneFrom);
    if (source.length === 0) { toast({ title: 'Maquininha origem sem taxas', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      for (const s of source) {
        const exists = rates.find(r => r.brand === s.brand && r.machine === cloneTo);
        const data = { company_id: company.id, brand: s.brand, machine: cloneTo, debit_rate: s.debit_rate, credit_rates: s.credit_rates };
        if (exists) await base44.entities.CardRate.update(exists.id, data);
        else await base44.entities.CardRate.create(data);
      }
      toast({ title: `Taxas clonadas de ${cloneFrom} para ${cloneTo}` });
      loadRates();
    } catch (e) {
      toast({ title: 'Erro ao clonar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Group existing rates by machine
  const machines = [...new Set(rates.map(r => r.machine))];

  return (
    <div className="space-y-6">
      {/* Batch register */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-600" />
            Cadastro em lote
          </CardTitle>
          <p className="text-xs text-gray-500">Cadastre débito + crédito (1x a 21x) de uma bandeira de uma só vez.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Bandeira</Label>
              <Select value={batchBrand} onValueChange={setBatchBrand}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a bandeira" /></SelectTrigger>
                <SelectContent>
                  {BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Maquininha</Label>
              <Select value={batchMachine} onValueChange={setBatchMachine}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MACHINES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Taxa de débito (%)</Label>
            <Input className="mt-1 max-w-xs" type="number" min="0" step="0.01"
              value={batchDebit} onChange={e => setBatchDebit(e.target.value)} />
          </div>

          <div>
            <Label className="mb-2 block">Taxas de crédito por parcela (%)</Label>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: MAX_INSTALLMENTS }, (_, i) => i + 1).map(n => (
                <div key={n}>
                  <Label className="text-xs text-gray-500">{n}x</Label>
                  <Input
                    type="number" min="0" step="0.01" className="mt-0.5 text-sm h-8"
                    value={batchCredit[String(n)] || 0}
                    onChange={e => handleBatchCreditChange(n, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleSaveBatch} disabled={saving || !batchBrand} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Salvando...' : `Salvar lote (${MAX_INSTALLMENTS + 1} registros)`}
          </Button>
        </CardContent>
      </Card>

      {/* Clone */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Copy className="w-4 h-4" />Clonar taxas de uma maquininha para outra
          </p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label className="text-xs">De</Label>
              <Select value={cloneFrom} onValueChange={setCloneFrom}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Maquininha origem" /></SelectTrigger>
                <SelectContent>
                  {machines.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs">Para</Label>
              <Select value={cloneTo} onValueChange={setCloneTo}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Maquininha destino" /></SelectTrigger>
                <SelectContent>
                  {MACHINES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleClone} disabled={saving} variant="outline">Clonar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing rates by machine */}
      {machines.map(machine => (
        <Card key={machine}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{machine}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {rates.filter(r => r.machine === machine).map(rate => (
                <div key={rate.id} className="py-3 flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{rate.brand}</span>
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">Débito: {rate.debit_rate}%</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(rate.credit_rates || {}).filter(([, v]) => v > 0).map(([k, v]) => (
                        <span key={k} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                          {k}x: {v}%
                        </span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => handleDelete(rate.id)} className="text-red-400 hover:text-red-600 mt-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {rates.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          Nenhuma taxa cadastrada. Use o cadastro em lote acima.
        </div>
      )}
    </div>
  );
}