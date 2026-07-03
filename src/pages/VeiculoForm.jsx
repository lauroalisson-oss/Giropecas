import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const EMPTY = { brand: '', model: '', year: '', plate: '', chassis: '', color: '', current_km: '', engine: '', notes: '', is_active: true, customer_id: '' };

export default function VeiculoForm() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { company } = useCompany();
  const { toast } = useToast();
  const isEdit = !!id;

  const params = new URLSearchParams(location.search);
  const presetCustomerId = params.get('customer_id');

  const [form, setForm] = useState({ ...EMPTY, customer_id: presetCustomerId || '' });
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCustomers();
    if (isEdit) loadVehicle();
  }, []);

  const loadCustomers = async () => {
    const data = await base44.entities.Customer.filter({ company_id: company.id, is_active: true });
    setCustomers(data);
  };

  const loadVehicle = async () => {
    setLoading(true);
    const data = await base44.entities.Vehicle.get(id);
    setForm(data);
    setLoading(false);
  };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.model.trim() || !form.customer_id) {
      toast({ title: 'Modelo e cliente são obrigatórios', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, company_id: company.id, year: form.year ? parseInt(form.year) : null, current_km: form.current_km ? parseFloat(form.current_km) : null };
      if (isEdit) {
        await base44.entities.Vehicle.update(id, payload);
        toast({ title: 'Veículo atualizado!' });
      } else {
        await base44.entities.Vehicle.create(payload);
        toast({ title: 'Veículo cadastrado!' });
      }
      navigate(presetCustomerId ? `/clientes/${presetCustomerId}` : '/veiculos');
    } catch (e) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Excluir este veículo?')) return;
    await base44.entities.Vehicle.delete(id);
    toast({ title: 'Veículo excluído' });
    navigate('/veiculos');
  };

  if (loading) return <div className="flex justify-center py-20 text-gray-400">Carregando...</div>;

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-900"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Editar Veículo' : 'Novo Veículo'}</h1>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Dados do Veículo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Cliente *</Label>
              <Select value={form.customer_id} onValueChange={v => set('customer_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Marca</Label>
                <Input className="mt-1" value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="Honda, Yamaha..." />
              </div>
              <div>
                <Label>Modelo *</Label>
                <Input className="mt-1" value={form.model} onChange={e => set('model', e.target.value)} placeholder="CG 160, Factor..." />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Ano</Label>
                <Input className="mt-1" type="number" value={form.year} onChange={e => set('year', e.target.value)} placeholder="2023" />
              </div>
              <div>
                <Label>Placa</Label>
                <Input className="mt-1" value={form.plate} onChange={e => set('plate', e.target.value.toUpperCase())} placeholder="ABC-1234" />
              </div>
              <div>
                <Label>Cor</Label>
                <Input className="mt-1" value={form.color} onChange={e => set('color', e.target.value)} placeholder="Preto" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>KM Atual</Label>
                <Input className="mt-1" type="number" value={form.current_km} onChange={e => set('current_km', e.target.value)} placeholder="15000" />
              </div>
              <div>
                <Label>Motor/Cilindrada</Label>
                <Input className="mt-1" value={form.engine} onChange={e => set('engine', e.target.value)} placeholder="160cc" />
              </div>
            </div>
            <div>
              <Label>Chassi</Label>
              <Input className="mt-1" value={form.chassis} onChange={e => set('chassis', e.target.value)} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea className="mt-1" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
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