import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatPhone } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Truck, Edit, Trash2, Phone, Mail } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const EMPTY = { name: '', cnpj: '', contact_name: '', phone: '', email: '', address: '', city: '', state: '', payment_terms: '', notes: '', is_active: true };

export default function Fornecedores() {
  const { company } = useCompany();
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (company?.id) loadSuppliers(); }, [company]);

  const loadSuppliers = async () => {
    setLoading(true);
    const data = await base44.entities.Supplier.filter({ company_id: company.id });
    setSuppliers(data);
    setLoading(false);
  };

  const filtered = suppliers.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.cnpj?.includes(search) ||
    s.contact_name?.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => { setForm(EMPTY); setEditId(null); setShowForm(true); };
  const openEdit = (s) => { setForm(s); setEditId(s.id); setShowForm(true); };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: 'Nome obrigatório', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = { ...form, company_id: company.id };
      if (editId) await base44.entities.Supplier.update(editId, payload);
      else await base44.entities.Supplier.create(payload);
      toast({ title: editId ? 'Fornecedor atualizado!' : 'Fornecedor cadastrado!' });
      setShowForm(false);
      loadSuppliers();
    } catch (e) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s) => {
    if (!confirm(`Excluir fornecedor "${s.name}"?`)) return;
    await base44.entities.Supplier.delete(s.id);
    toast({ title: 'Fornecedor excluído' });
    loadSuppliers();
  };

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fornecedores</h1>
          <p className="text-gray-500 text-sm">{suppliers.length} fornecedores</p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" />Novo
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="Buscar fornecedores..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Carregando...</div> :
        filtered.length === 0 ? (
          <div className="text-center py-16">
            <Truck className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">Nenhum fornecedor cadastrado</p>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openNew}><Plus className="w-4 h-4 mr-2" />Novo Fornecedor</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(s => (
              <Card key={s.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Truck className="w-5 h-5 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{s.name}</p>
                    <div className="flex gap-4 mt-0.5">
                      {s.phone && <span className="text-xs text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{formatPhone(s.phone)}</span>}
                      {s.email && <span className="text-xs text-gray-500 flex items-center gap-1"><Mail className="w-3 h-3" />{s.email}</span>}
                      {s.contact_name && <span className="text-xs text-gray-400">{s.contact_name}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(s)} className="text-blue-500 hover:text-blue-700"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(s)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      }

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Nome *</Label><Input className="mt-1" value={form.name} onChange={e => set('name', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CNPJ</Label><Input className="mt-1" value={form.cnpj} onChange={e => set('cnpj', e.target.value)} /></div>
              <div><Label>Contato</Label><Input className="mt-1" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Telefone</Label><Input className="mt-1" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
              <div><Label>E-mail</Label><Input className="mt-1" type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
            </div>
            <div><Label>Endereço</Label><Input className="mt-1" value={form.address} onChange={e => set('address', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cidade</Label><Input className="mt-1" value={form.city} onChange={e => set('city', e.target.value)} /></div>
              <div><Label>UF</Label><Input className="mt-1" value={form.state} onChange={e => set('state', e.target.value)} maxLength={2} /></div>
            </div>
            <div><Label>Condições de pagamento</Label><Input className="mt-1" value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} placeholder="Ex: 30/60 dias" /></div>
            <div><Label>Observações</Label><Textarea className="mt-1" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} /></div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}