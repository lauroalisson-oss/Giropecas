import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { maskCPF, maskCNPJ, maskPhone } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import StatusCrediario from '@/components/StatusCrediario';

const EMPTY = {
  name: '', type: 'fisica', tax_id: '', birth_date: '', phone: '', email: '',
  address: '', city: '', state: '', zip_code: '', credit_limit: 0,
  notes: '', is_active: true, lgpd_consent: false
};

export default function ClienteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { company } = useCompany();
  const { toast } = useToast();
  const isEdit = !!id;

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) loadCustomer();
  }, [id]);

  const loadCustomer = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.Customer.get(id);
      setForm(data);
    } finally {
      setLoading(false);
    }
  };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleTaxId = (v) => {
    if (form.type === 'juridica') set('tax_id', maskCNPJ(v));
    else set('tax_id', maskCPF(v));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, company_id: company.id };
      if (isEdit) {
        await base44.entities.Customer.update(id, payload);
        toast({ title: 'Cliente atualizado com sucesso!' });
      } else {
        await base44.entities.Customer.create(payload);
        toast({ title: 'Cliente cadastrado com sucesso!' });
      }
      navigate('/clientes');
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Excluir este cliente?')) return;
    await base44.entities.Customer.delete(id);
    toast({ title: 'Cliente excluído' });
    navigate('/clientes');
  };

  if (loading) return <div className="flex justify-center py-20 text-gray-400">Carregando...</div>;

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-900">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Editar Cliente' : 'Novo Cliente'}</h1>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Dados Pessoais</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Tipo de pessoa</Label>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{form.type === 'juridica' ? 'CNPJ' : 'CPF'}</Label>
                <Input className="mt-1" value={form.tax_id} onChange={e => handleTaxId(e.target.value)}
                  placeholder={form.type === 'juridica' ? '00.000.000/0000-00' : '000.000.000-00'} maxLength={form.type === 'juridica' ? 18 : 14} />
              </div>
              <div>
                <Label>Data de nascimento</Label>
                <Input className="mt-1" type="date" value={form.birth_date || ''}
                  onChange={e => set('birth_date', e.target.value)} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input className="mt-1" value={form.phone}
                  onChange={e => set('phone', maskPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} />
              </div>
            </div>
            <div>
              <Label>E-mail</Label>
              <Input className="mt-1" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Endereço</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Label>Endereço</Label>
                <Input className="mt-1" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Rua, número" />
              </div>
              <div>
                <Label>CEP</Label>
                <Input className="mt-1" value={form.zip_code} onChange={e => set('zip_code', e.target.value)} placeholder="00000-000" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Label>Cidade</Label>
                <Input className="mt-1" value={form.city} onChange={e => set('city', e.target.value)} />
              </div>
              <div>
                <Label>UF</Label>
                <Input className="mt-1" value={form.state} onChange={e => set('state', e.target.value)} maxLength={2} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Crediário & Observações</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <StatusCrediario cliente={form} />
            <div>
              <Label>Limite de Crédito (R$)</Label>
              <Input className="mt-1" type="number" min="0" value={form.credit_limit}
                onChange={e => set('credit_limit', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea className="mt-1" value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
              <Label>Cliente ativo</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.lgpd_consent} onCheckedChange={v => set('lgpd_consent', v)} />
              <Label className="text-sm text-gray-600">Consentimento LGPD</Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
            <Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Salvar'}
          </Button>
          {isEdit && (
            <Button variant="outline" onClick={handleDelete} className="text-red-600 border-red-200 hover:bg-red-50">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}