import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, Trash2, Search, Package, Wrench } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function OrdemForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { company } = useCompany();
  const { toast } = useToast();

  const params = new URLSearchParams(location.search);
  const presetCustomerId = params.get('customer_id');

  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [parts, setParts] = useState([]);
  const [services, setServices] = useState([]);
  const [mechanics, setMechanics] = useState([]);

  const [form, setForm] = useState({
    customer_id: presetCustomerId || '',
    vehicle_id: '',
    plate: '',
    mechanic_id: '',
    complaint: '',
    diagnosis: '',
    notes: '',
    vehicle_km: '',
    parts_items: [],
    service_items: [],
    discount: 0,
  });

  const [partSearch, setPartSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (form.customer_id) loadVehicles(form.customer_id);
  }, [form.customer_id]);

  const loadData = async () => {
    const [custs, pts, svcs, techs] = await Promise.all([
      base44.entities.Customer.filter({ company_id: company.id, is_active: true }),
      base44.entities.Part.filter({ company_id: company.id, is_active: true }),
      base44.entities.Service.filter({ company_id: company.id, is_active: true }),
      base44.entities.Technician.filter({ company_id: company.id, is_active: true }, 'name'),
    ]);
    setCustomers(custs);
    setParts(pts);
    setServices(svcs);
    setMechanics(techs);
  };

  const loadVehicles = async (customerId) => {
    const data = await base44.entities.Vehicle.filter({ customer_id: customerId });
    setVehicles(data);
    if (data.length === 1) setForm(prev => ({ ...prev, vehicle_id: data[0].id, plate: prev.plate || data[0].plate || '' }));
  };

  // Ao escolher um veículo, preenche a placa automaticamente (mantém editável)
  const selectVehicle = (vehicleId) => {
    const v = vehicles.find(x => x.id === vehicleId);
    setForm(prev => ({ ...prev, vehicle_id: vehicleId, plate: v?.plate || prev.plate || '' }));
  };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const addPart = (part) => {
    if (part.stock_quantity <= 0) {
      toast({ title: 'Peça sem estoque!', variant: 'destructive' });
      return;
    }
    setForm(prev => ({
      ...prev,
      parts_items: [...prev.parts_items, {
        part_id: part.id, description: part.description,
        quantity: 1, unit_price: part.sale_price, total_price: part.sale_price
      }]
    }));
    setPartSearch('');
  };

  const addService = (svc) => {
    setForm(prev => ({
      ...prev,
      service_items: [...prev.service_items, {
        service_id: svc.id, description: svc.name,
        hours: svc.standard_time_hours, unit_price: svc.labor_price, total_price: svc.labor_price
      }]
    }));
    setServiceSearch('');
  };

  const updatePartItem = (idx, field, value) => {
    setForm(prev => {
      const items = [...prev.parts_items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        items[idx].total_price = (parseFloat(items[idx].quantity) || 0) * (parseFloat(items[idx].unit_price) || 0);
      }
      return { ...prev, parts_items: items };
    });
  };

  const updateServiceItem = (idx, field, value) => {
    setForm(prev => {
      const items = [...prev.service_items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === 'hours' || field === 'unit_price') {
        items[idx].total_price = (parseFloat(items[idx].hours) || 0) * (parseFloat(items[idx].unit_price) || 0);
      }
      return { ...prev, service_items: items };
    });
  };

  const partsTotal = form.parts_items.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);
  const servicesTotal = form.service_items.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);
  const total = partsTotal + servicesTotal - (parseFloat(form.discount) || 0);

  const filteredParts = parts.filter(p => p.description?.toLowerCase().includes(partSearch.toLowerCase()) || p.sku?.toLowerCase().includes(partSearch.toLowerCase())).slice(0, 8);
  const filteredServices = services.filter(s => s.name?.toLowerCase().includes(serviceSearch.toLowerCase())).slice(0, 8);

  const handleSave = async (status = 'aberta') => {
    if (!form.customer_id) { toast({ title: 'Selecione o cliente', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const allOrders = await base44.entities.WorkOrder.filter({ company_id: company.id }, '-created_date', 1);
      const lastNum = allOrders.length > 0 ? (parseInt(allOrders[0].order_number?.replace(/\D/g, '') || '0') + 1) : 1;
      const order_number = String(lastNum).padStart(5, '0');

      const payload = {
        ...form,
        company_id: company.id,
        order_number,
        status,
        opened_at: new Date().toISOString(),
        parts_total: partsTotal,
        services_total: servicesTotal,
        total,
        vehicle_km: form.vehicle_km ? parseFloat(form.vehicle_km) : null,
        discount: parseFloat(form.discount) || 0,
      };
      const created = await base44.entities.WorkOrder.create(payload);
      toast({ title: `OS #${order_number} criada!` });
      navigate(`/ordens/${created.id}`);
    } catch (e) {
      toast({ title: 'Erro ao criar OS', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-900"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-xl font-bold text-gray-900">Nova Ordem de Serviço</h1>
      </div>

      <div className="space-y-4">
        {/* Client + Vehicle */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Cliente & Veículo</CardTitle></CardHeader>
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
            {vehicles.length > 0 && (
              <div>
                <Label>Veículo</Label>
                <Select value={form.vehicle_id} onValueChange={selectVehicle}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o veículo" /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.brand} {v.model} - {v.plate}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Placa do veículo</Label>
              <Input className="mt-1" value={form.plate} onChange={e => set('plate', e.target.value.toUpperCase())}
                placeholder="ABC-1234" />
              <p className="text-xs text-gray-400 mt-1">Preenchida ao escolher o veículo. Permite localizar a OS pela placa.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>KM atual</Label>
                <Input className="mt-1" type="number" value={form.vehicle_km} onChange={e => set('vehicle_km', e.target.value)} placeholder="15000" />
              </div>
              <div>
                <Label>Técnico Responsável</Label>
                <Select value={form.mechanic_id} onValueChange={v => set('mechanic_id', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nenhum —</SelectItem>
                    {mechanics.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Complaint */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Reclamação & Diagnóstico</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Reclamação do cliente</Label>
              <Textarea className="mt-1" value={form.complaint} onChange={e => set('complaint', e.target.value)} rows={2} placeholder="O que o cliente relatou..." />
            </div>
            <div>
              <Label>Diagnóstico</Label>
              <Textarea className="mt-1" value={form.diagnosis} onChange={e => set('diagnosis', e.target.value)} rows={2} placeholder="Diagnóstico técnico..." />
            </div>
            <div>
              <Label>Observações internas</Label>
              <Textarea className="mt-1" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
            </div>
          </CardContent>
        </Card>

        {/* Parts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4 text-red-600" />Peças</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Buscar peça por nome ou SKU..." value={partSearch}
                onChange={e => setPartSearch(e.target.value)} className="pl-10" />
            </div>
            {partSearch && filteredParts.length > 0 && (
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto bg-white shadow-sm">
                {filteredParts.map(p => (
                  <button key={p.id} onClick={() => addPart(p)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left">
                    <div>
                      <p className="text-sm font-medium">{p.description}</p>
                      <p className="text-xs text-gray-400">{p.sku} • Estoque: {p.stock_quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{formatCurrency(p.sale_price)}</p>
                      {p.stock_quantity <= 0 && <Badge className="bg-red-100 text-red-700 text-xs">Sem estoque</Badge>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {form.parts_items.length > 0 && (
              <div className="space-y-2">
                {form.parts_items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.description}</p>
                    </div>
                    <Input type="number" min="1" value={item.quantity}
                      onChange={e => updatePartItem(idx, 'quantity', e.target.value)}
                      className="w-16 text-center" />
                    <Input type="number" step="0.01" value={item.unit_price}
                      onChange={e => updatePartItem(idx, 'unit_price', e.target.value)}
                      className="w-24" />
                    <span className="text-sm font-bold w-20 text-right">{formatCurrency(item.total_price)}</span>
                    <button onClick={() => setForm(prev => ({ ...prev, parts_items: prev.parts_items.filter((_, i) => i !== idx) }))}>
                      <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                    </button>
                  </div>
                ))}
                <div className="text-right text-sm font-semibold text-gray-700">Peças: {formatCurrency(partsTotal)}</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Services */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Wrench className="w-4 h-4 text-red-600" />Serviços</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Buscar serviço..." value={serviceSearch}
                onChange={e => setServiceSearch(e.target.value)} className="pl-10" />
            </div>
            {serviceSearch && filteredServices.length > 0 && (
              <div className="border rounded-lg divide-y max-h-40 overflow-y-auto bg-white shadow-sm">
                {filteredServices.map(s => (
                  <button key={s.id} onClick={() => addService(s)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left">
                    <div>
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.standard_time_hours}h</p>
                    </div>
                    <p className="text-sm font-bold">{formatCurrency(s.labor_price)}</p>
                  </button>
                ))}
              </div>
            )}
            {form.service_items.length > 0 && (
              <div className="space-y-2">
                {form.service_items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.description}</p>
                    </div>
                    <Input type="number" step="0.5" min="0" value={item.hours}
                      onChange={e => updateServiceItem(idx, 'hours', e.target.value)}
                      className="w-16 text-center" placeholder="h" />
                    <Input type="number" step="0.01" value={item.unit_price}
                      onChange={e => updateServiceItem(idx, 'unit_price', e.target.value)}
                      className="w-24" />
                    <span className="text-sm font-bold w-20 text-right">{formatCurrency(item.total_price)}</span>
                    <button onClick={() => setForm(prev => ({ ...prev, service_items: prev.service_items.filter((_, i) => i !== idx) }))}>
                      <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                    </button>
                  </div>
                ))}
                <div className="text-right text-sm font-semibold text-gray-700">Serviços: {formatCurrency(servicesTotal)}</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Totals */}
        <Card className="border-gray-300">
          <CardContent className="p-4">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Peças</span><span>{formatCurrency(partsTotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Serviços</span><span>{formatCurrency(servicesTotal)}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Desconto (R$)</span>
                <Input type="number" min="0" step="0.01" value={form.discount}
                  onChange={e => set('discount', e.target.value)} className="w-24 text-right" />
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>Total</span><span className="text-red-600">{formatCurrency(total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={() => handleSave('aberta')} disabled={saving} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
            <Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Criar OS'}
          </Button>
        </div>
      </div>
    </div>
  );
}