import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { maskCPF, maskCNPJ, maskPhone } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { UserPlus } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function QuickCustomerModal({ open, onOpenChange, onCreated }) {
  const { company } = useCompany();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', type: 'fisica', tax_id: '', phone: '', email: '', is_active: true
  });

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleTaxId = (v) => {
    if (form.type === 'juridica') set('tax_id', maskCNPJ(v));
    else set('tax_id', maskCPF(v));
  };

  const reset = () => setForm({ name: '', type: 'fisica', tax_id: '', phone: '', email: '', is_active: true });

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const created = await base44.entities.Customer.create({ ...form, company_id: company.id });
      toast({ title: 'Cliente cadastrado!' });
      onCreated?.(created);
      reset();
      onOpenChange?.(false);
    } catch (e) {
      toast({ title: 'Erro ao cadastrar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = (v) => {
    if (!v) reset();
    onOpenChange?.(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="w-4 h-4 text-red-600" />Cadastrar Cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select value={form.type} onValueChange={v => set('type', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fisica">Pessoa Física</SelectItem>
                <SelectItem value="juridica">Pessoa Jurídica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nome / Razão Social *</Label>
            <Input className="mt-1" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{form.type === 'juridica' ? 'CNPJ' : 'CPF'}</Label>
              <Input className="mt-1" value={form.tax_id} onChange={e => handleTaxId(e.target.value)}
                placeholder={form.type === 'juridica' ? '00.000.000/0000-00' : '000.000.000-00'}
                maxLength={form.type === 'juridica' ? 18 : 14} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input className="mt-1" value={form.phone} onChange={e => set('phone', maskPhone(e.target.value))}
                placeholder="(00) 00000-0000" maxLength={15} />
            </div>
          </div>
          <div>
            <Label>E-mail</Label>
            <Input className="mt-1" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
            {saving ? 'Salvando...' : 'Cadastrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}