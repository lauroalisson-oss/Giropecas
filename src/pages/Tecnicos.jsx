import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit2, Search, HardHat, Phone, Mail, Wrench, Percent } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ComissoesPanel from '@/components/tecnicos/ComissoesPanel';

const EMPTY = { name: '', cpf: '', phone: '', email: '', specialty: '', commission_percent: 0, notes: '', is_active: true };

export default function Tecnicos() {
  const { company } = useCompany();
  const { toast } = useToast();
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (company?.id) load(); }, [company]);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.Technician.filter({ company_id: company.id }, 'name');
    setTechnicians(data);
    setLoading(false);
  };

  const openNew = () => { setEditing(null); setForm(EMPTY); setShowForm(true); };
  const openEdit = (t) => { setEditing(t.id); setForm({ ...t }); setShowForm(true); };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: 'Nome obrigatório', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = { ...form, company_id: company.id, commission_percent: parseFloat(form.commission_percent) || 0 };
      if (editing) await base44.entities.Technician.update(editing, payload);
      else await base44.entities.Technician.create(payload);
      toast({ title: editing ? 'Técnico atualizado!' : 'Técnico cadastrado!' });
      setShowForm(false);
      load();
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const filtered = technicians.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.specialty?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Técnicos</h1>
          <p className="text-gray-500 text-sm">Prestadores de serviço e mecânicos</p>
        </div>
        <Button onClick={openNew} className="bg-red-600 hover:bg-red-700 text-white">
          <Plus className="w-4 h-4 mr-2" />Novo Técnico
        </Button>
      </div>

      <Tabs defaultValue="cadastro">
        <TabsList className="mb-4">
          <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
          <TabsTrigger value="comissoes">Comissões</TabsTrigger>
        </TabsList>

        <TabsContent value="cadastro">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Buscar por nome ou especialidade..." value={search}
              onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4">
                <p className="text-xs text-red-600 font-medium">Total</p>
                <p className="text-2xl font-bold text-red-700">{technicians.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4">
                <p className="text-xs text-green-600 font-medium">Ativos</p>
                <p className="text-2xl font-bold text-green-700">{technicians.filter(t => t.is_active).length}</p>
              </CardContent>
            </Card>
          </div>

          {/* List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {loading ? (
              <p className="text-gray-400 text-sm col-span-2 text-center py-10">Carregando...</p>
            ) : filtered.length === 0 ? (
              <div className="col-span-2 text-center py-14">
                <HardHat className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400">Nenhum técnico encontrado.</p>
                <Button onClick={openNew} className="mt-3 bg-red-600 hover:bg-red-700 text-white">
                  <Plus className="w-4 h-4 mr-2" />Cadastrar Técnico
                </Button>
              </div>
            ) : filtered.map(t => (
              <Card key={t.id} className={`transition-shadow hover:shadow-md ${!t.is_active ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                          <HardHat className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{t.name}</p>
                          {t.specialty && <p className="text-xs text-gray-500">{t.specialty}</p>}
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        {t.phone && <p className="text-xs text-gray-500 flex items-center gap-1.5"><Phone className="w-3 h-3" />{t.phone}</p>}
                        {t.email && <p className="text-xs text-gray-500 flex items-center gap-1.5"><Mail className="w-3 h-3" />{t.email}</p>}
                        {t.commission_percent > 0 && (
                          <p className="text-xs text-orange-600 flex items-center gap-1.5"><Percent className="w-3 h-3" />Comissão: {t.commission_percent}%</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className={t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                        {t.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="comissoes">
          <ComissoesPanel />
        </TabsContent>
      </Tabs>

      {/* Form Modal */}
      <Dialog open={showForm} onOpenChange={v => !saving && setShowForm(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Técnico' : 'Novo Técnico'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Nome *</Label>
              <Input className="mt-1" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CPF</Label>
                <Input className="mt-1" value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input className="mt-1" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div>
              <Label>E-mail</Label>
              <Input className="mt-1" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Especialidade</Label>
                <Input className="mt-1" value={form.specialty} onChange={e => set('specialty', e.target.value)} placeholder="Ex: Motor, Freios..." />
              </div>
              <div>
                <Label>Comissão (%)</Label>
                <Input className="mt-1" type="number" min="0" max="100" step="0.5"
                  value={form.commission_percent} onChange={e => set('commission_percent', e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea className="mt-1" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
              <Label>Ativo</Label>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving} className="flex-1">Cancelar</Button>
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