import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Save, Trash2, TrendingUp } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const EMPTY = {
  sku: '', internal_code: '', ncm: '', cfop_default: '5102', description: '', unit: 'un',
  cost_price: 0, sale_price: 0, margin_percent: 0, stock_quantity: 0, min_stock: 1,
  location: '', supplier_id: '', lead_time_days: 1, brand: '', notes: '', is_active: true
};

export default function PecaForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { company } = useCompany();
  const { toast } = useToast();
  const isEdit = !!id;

  const [form, setForm] = useState(EMPTY);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSuppliers();
    if (isEdit) loadPart();
  }, []);

  const loadSuppliers = async () => {
    const data = await base44.entities.Supplier.filter({ company_id: company.id });
    setSuppliers(data);
  };

  const loadPart = async () => {
    setLoading(true);
    const data = await base44.entities.Part.get(id);
    setForm(data);
    setLoading(false);
  };

  const set = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Auto-calc margin
      if ((field === 'cost_price' || field === 'sale_price') && next.cost_price > 0) {
        next.margin_percent = ((next.sale_price - next.cost_price) / next.cost_price * 100).toFixed(1);
      }
      if (field === 'margin_percent' && prev.cost_price > 0) {
        next.sale_price = (parseFloat(prev.cost_price) * (1 + parseFloat(value) / 100)).toFixed(2);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!form.description.trim()) {
      toast({ title: 'Descrição obrigatória', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form, company_id: company.id,
        cost_price: parseFloat(form.cost_price) || 0,
        sale_price: parseFloat(form.sale_price) || 0,
        margin_percent: parseFloat(form.margin_percent) || 0,
        stock_quantity: parseFloat(form.stock_quantity) || 0,
        min_stock: parseFloat(form.min_stock) || 1,
        lead_time_days: parseInt(form.lead_time_days) || 1,
      };
      if (isEdit) {
        await base44.entities.Part.update(id, payload);
        toast({ title: 'Peça atualizada!' });
      } else {
        await base44.entities.Part.create(payload);
        toast({ title: 'Peça cadastrada!' });
      }
      navigate('/pecas');
    } catch (e) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Excluir esta peça?')) return;
    await base44.entities.Part.delete(id);
    toast({ title: 'Peça excluída' });
    navigate('/pecas');
  };

  if (loading) return <div className="flex justify-center py-20 text-gray-400">Carregando...</div>;

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-900"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Editar Peça' : 'Nova Peça'}</h1>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Identificação</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Descrição *</Label>
              <Input className="mt-1" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ex: Filtro de óleo Honda CG 160" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label>SKU</Label>
                <Input className="mt-1" value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="SKU001" />
              </div>
              <div>
                <Label>Cód. Interno</Label>
                <Input className="mt-1" value={form.internal_code} onChange={e => set('internal_code', e.target.value)} />
              </div>
              <div>
                <Label>Marca</Label>
                <Input className="mt-1" value={form.brand} onChange={e => set('brand', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>NCM</Label>
                <Input className="mt-1" value={form.ncm} onChange={e => set('ncm', e.target.value)} placeholder="8714.99.00" />
              </div>
              <div>
                <Label>CFOP Padrão</Label>
                <Input className="mt-1" value={form.cfop_default} onChange={e => set('cfop_default', e.target.value)} placeholder="5102" />
              </div>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={form.unit} onValueChange={v => set('unit', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="un">Unidade (un)</SelectItem>
                  <SelectItem value="pc">Peça (pc)</SelectItem>
                  <SelectItem value="kg">Quilograma (kg)</SelectItem>
                  <SelectItem value="lt">Litro (lt)</SelectItem>
                  <SelectItem value="cx">Caixa (cx)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4" />Preços</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Custo (R$)</Label>
                <Input className="mt-1" type="number" step="0.01" min="0" value={form.cost_price}
                  onChange={e => set('cost_price', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Margem (%)</Label>
                <Input className="mt-1" type="number" step="0.1" value={form.margin_percent}
                  onChange={e => set('margin_percent', e.target.value)} />
              </div>
              <div>
                <Label>Venda (R$)</Label>
                <Input className="mt-1" type="number" step="0.01" min="0" value={form.sale_price}
                  onChange={e => set('sale_price', parseFloat(e.target.value) || 0)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Estoque</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Qtd. em Estoque</Label>
                <Input className="mt-1" type="number" min="0" value={form.stock_quantity}
                  onChange={e => set('stock_quantity', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Estoque Mínimo</Label>
                <Input className="mt-1" type="number" min="0" value={form.min_stock}
                  onChange={e => set('min_stock', parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Localização</Label>
                <Input className="mt-1" value={form.location} onChange={e => set('location', e.target.value)} placeholder="Prateleira A2" />
              </div>
              <div>
                <Label>Prazo Reposição (dias)</Label>
                <Input className="mt-1" type="number" min="1" value={form.lead_time_days}
                  onChange={e => set('lead_time_days', e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Fornecedor</Label>
              <Select value={form.supplier_id || 'none'} onValueChange={v => set('supplier_id', v === 'none' ? '' : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar fornecedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <Label>Observações</Label>
              <Textarea className="mt-1" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
              <Label>Peça ativa</Label>
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