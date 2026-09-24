import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Printer, CreditCard, Package, Wrench, User, Car, Edit, Save, X, Trash2, Search, HardHat, FileText, Receipt } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PagamentoModal from '@/components/PagamentoModal';
import EmitirNotaButton from '@/components/EmitirNotaButton';
import EmitirNfseButton from '@/components/EmitirNfseButton';
import { printDocument } from '@/components/PrintReceipt';
import { revisoesDaOrdem } from '@/lib/crm';
import { saldoADevolver } from '@/lib/estoque';
import { notaAutorizadaDe, motivoNaoExcluir } from '@/lib/nfse-dados';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import RevisoesVeiculo from '@/components/RevisoesVeiculo';

const STATUS_FLOW = ['aberta', 'em_andamento', 'aguardando_peca', 'finalizada'];

export default function OrdemDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { company } = useCompany();

  const [order, setOrder] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [technician, setTechnician] = useState(null);
  const [allTechnicians, setAllTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [allParts, setAllParts] = useState([]);
  const [allServices, setAllServices] = useState([]);
  const [partSearch, setPartSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadOrder(); }, [id]);

  const loadOrder = async () => {
    setLoading(true);
    try {
      const ord = await base44.entities.WorkOrder.get(id);
      setOrder(ord);
      if (ord.customer_id) {
        const cust = await base44.entities.Customer.get(ord.customer_id);
        setCustomer(cust);
      }
      if (ord.vehicle_id) {
        const veh = await base44.entities.Vehicle.get(ord.vehicle_id);
        setVehicle(veh);
      }
      if (ord.mechanic_id) {
        const tech = await base44.entities.Technician.get(ord.mechanic_id);
        setTechnician(tech);
      } else {
        setTechnician(null);
      }
      const techs = await base44.entities.Technician.filter({ company_id: ord.company_id, is_active: true }, 'name');
      setAllTechnicians(techs);
      // Peças: pré-checagem fiscal (NCM) do botão Emitir Nota.
      // Serviços: intervalos de revisão impressos na OS — por isso são
      // carregados sempre, não só ao entrar em modo de edição.
      if (!allParts.length) {
        const pts = await base44.entities.Part.filter({ company_id: ord.company_id });
        setAllParts(pts);
      }
      if (!allServices.length) {
        const svcs = await base44.entities.Service.filter({ company_id: ord.company_id });
        setAllServices(svcs);
      }
    } finally {
      setLoading(false);
    }
  };

  const enterEdit = async () => {
    if (!allParts.length) {
      const [pts, svcs] = await Promise.all([
        base44.entities.Part.filter({ company_id: company.id, is_active: true }),
        base44.entities.Service.filter({ company_id: company.id, is_active: true }),
      ]);
      setAllParts(pts);
      setAllServices(svcs);
    }
    setEditForm({
      complaint: order.complaint || '',
      diagnosis: order.diagnosis || '',
      notes: order.notes || '',
      vehicle_km: order.vehicle_km || '',
      mechanic_id: order.mechanic_id || '',
      discount: order.discount || 0,
      parts_items: order.parts_items ? JSON.parse(JSON.stringify(order.parts_items)) : [],
      service_items: order.service_items ? JSON.parse(JSON.stringify(order.service_items)) : [],
    });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setPartSearch(''); setServiceSearch(''); };

  const setField = (field, value) => setEditForm(prev => ({ ...prev, [field]: value }));

  const addPart = (part) => {
    setEditForm(prev => ({
      ...prev,
      parts_items: [...prev.parts_items, {
        part_id: part.id, description: part.description,
        quantity: 1, unit_price: part.sale_price, total_price: part.sale_price
      }]
    }));
    setPartSearch('');
  };

  const addService = (svc) => {
    setEditForm(prev => ({
      ...prev,
      service_items: [...prev.service_items, {
        service_id: svc.id, description: svc.name,
        hours: svc.standard_time_hours, unit_price: svc.labor_price, total_price: svc.labor_price * svc.standard_time_hours
      }]
    }));
    setServiceSearch('');
  };

  const updatePartItem = (idx, field, value) => {
    setEditForm(prev => {
      const items = [...prev.parts_items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        items[idx].total_price = (parseFloat(items[idx].quantity) || 0) * (parseFloat(items[idx].unit_price) || 0);
      }
      return { ...prev, parts_items: items };
    });
  };

  const updateServiceItem = (idx, field, value) => {
    setEditForm(prev => {
      const items = [...prev.service_items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === 'hours' || field === 'unit_price') {
        items[idx].total_price = (parseFloat(items[idx].hours) || 0) * (parseFloat(items[idx].unit_price) || 0);
      }
      return { ...prev, service_items: items };
    });
  };

  const partsTotal = editForm.parts_items?.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0) || 0;
  const servicesTotal = editForm.service_items?.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0) || 0;
  const editTotal = partsTotal + servicesTotal - (parseFloat(editForm.discount) || 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      const mechId = editForm.mechanic_id && editForm.mechanic_id !== 'none' ? editForm.mechanic_id : null;
      const payload = {
        ...editForm,
        mechanic_id: mechId,
        parts_total: partsTotal,
        services_total: servicesTotal,
        total: editTotal,
        vehicle_km: editForm.vehicle_km ? parseFloat(editForm.vehicle_km) : null,
        discount: parseFloat(editForm.discount) || 0,
      };
      await base44.entities.WorkOrder.update(id, payload);
      toast({ title: 'OS atualizada com sucesso!' });
      setEditing(false);
      loadOrder();
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (newStatus) => {
    setUpdating(true);
    await base44.entities.WorkOrder.update(id, { status: newStatus });
    setOrder(prev => ({ ...prev, status: newStatus }));
    toast({ title: `Status atualizado: ${getStatusLabel(newStatus)}` });
    setUpdating(false);
  };

  const cancelOrder = async () => {
    // Cancelar a OS não cancela a nota: com NFS-e autorizada, o governo
    // continuaria considerando o serviço prestado e o ISS devido, enquanto
    // o sistema diria que ele não aconteceu. Busca na hora — a tela não
    // carrega as notas, e a trava não pode depender de ter carregado.
    const notas = await base44.entities.NFeRecord.filter({ company_id: company.id, work_order_id: id })
      .catch(() => []);
    const nota = notaAutorizadaDe(notas, { workOrderId: id, saleId: order?.sale_id });
    if (nota) {
      toast({ title: 'Não é possível cancelar', description: motivoNaoExcluir(nota), variant: 'destructive' });
      return;
    }

    if (!confirm('Cancelar esta OS?')) return;
    setUpdating(true);
    try {
      // Se a OS já foi paga, as peças saíram da prateleira. Cancelar sem
      // devolvê-las deixaria o estoque do sistema menor que o real, e a
      // oficina compraria peça que já tem.
      const movimentos = await base44.entities.StockMovement.filter({ reference_id: id });
      const pendentes = saldoADevolver(movimentos);

      for (const item of pendentes) {
        const part = await base44.entities.Part.get(item.part_id);
        const novo = (part.stock_quantity || 0) + item.quantity;
        await base44.entities.Part.update(item.part_id, { stock_quantity: novo });
        await base44.entities.StockMovement.create({
          company_id: company.id, part_id: item.part_id, type: 'devolucao',
          quantity: item.quantity, reason: `Cancelamento da OS #${order.order_number || ''}`,
          reference_id: id, reference_type: 'estorno',
          previous_stock: part.stock_quantity, new_stock: novo,
        });
      }

      await base44.entities.WorkOrder.update(id, { status: 'cancelada' });
      setOrder(prev => ({ ...prev, status: 'cancelada' }));
      toast({
        title: 'OS cancelada',
        description: pendentes.length > 0
          ? `${pendentes.length} peça(s) devolvida(s) ao estoque.`
          : 'Nenhuma peça a devolver — esta OS não tinha baixado estoque.',
      });
    } catch (e) {
      toast({ title: 'Erro ao cancelar', description: e.message, variant: 'destructive' });
    } finally {
      setUpdating(false);
    }
  };

  const handlePrint = (format) => {
    // Avisos de próxima revisão vão impressos na OS que o cliente leva.
    const revisoes = revisoesDaOrdem({
      ordem: order,
      servicosPorId: Object.fromEntries(allServices.map(s => [s.id, s])),
    });
    printDocument({ type: 'os', doc: { ...order, vehicle }, company, customer, technician, revisoes, format });
  };

  if (loading) return <div className="flex justify-center py-20 text-gray-400">Carregando...</div>;
  if (!order) return <div className="p-6 text-gray-500">OS não encontrada.</div>;

  const isActive = order.status !== 'cancelada' && order.status !== 'faturada';
  const canAdvance = STATUS_FLOW.includes(order.status) && order.status !== 'finalizada';
  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1];

  const filteredParts = allParts.filter(p =>
    p.description?.toLowerCase().includes(partSearch.toLowerCase()) || p.sku?.toLowerCase().includes(partSearch.toLowerCase())
  ).slice(0, 8);

  const filteredServices = allServices.filter(s =>
    s.name?.toLowerCase().includes(serviceSearch.toLowerCase())
  ).slice(0, 8);

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-900"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">OS #{order.order_number || id.slice(-6)}</h1>
            <Badge className={getStatusColor(order.status)}>{getStatusLabel(order.status)}</Badge>
          </div>
          <p className="text-gray-500 text-sm">{formatDateTime(order.opened_at || order.created_date)}</p>
        </div>
        <div className="flex gap-2">
          {isActive && !editing && (
            <Button variant="outline" size="sm" onClick={enterEdit}>
              <Edit className="w-4 h-4 mr-1" />Editar
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><Printer className="w-4 h-4 mr-1" />Imprimir</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handlePrint('a4')}><FileText className="w-4 h-4 mr-2" />Folha A4</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePrint('cupom')}><Receipt className="w-4 h-4 mr-2" />Cupom 80mm</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Status actions */}
      {isActive && !editing && (
        <Card className="mb-4 border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-medium text-blue-800">Status atual</p>
                </div>
                <Select value={order.status} onValueChange={updateStatus} disabled={updating}>
                  <SelectTrigger className="h-8 text-xs bg-white border-blue-300 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">Aberta</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="aguardando_peca">Aguardando Peça</SelectItem>
                    <SelectItem value="finalizada">Finalizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 flex-wrap">
                {/* Payment available in any active status */}
                <Button size="sm" onClick={() => setShowPayment(true)}
                  className="bg-green-600 hover:bg-green-700 text-white">
                  <CreditCard className="w-4 h-4 mr-1" />
                  {order.status === 'finalizada' ? 'Faturar' : 'Registrar Pagamento'}
                </Button>
                <EmitirNotaButton
                  workOrderId={id}
                  items={order.parts_items}
                  partsById={Object.fromEntries(allParts.map(p => [p.id, p]))}
                  onEmitted={loadOrder}
                />
                <EmitirNfseButton
                  workOrderId={id}
                  temServicos={(order.service_items?.length || 0) > 0}
                  onEmitted={loadOrder}
                />
                <Button size="sm" variant="outline" onClick={cancelOrder}
                  className="text-red-600 border-red-200 hover:bg-red-50">Cancelar</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer + Vehicle */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><User className="w-4 h-4" />Cliente</CardTitle></CardHeader>
          <CardContent className="p-4 pt-2">
            {customer ? (
              <Link to={`/clientes/${customer.id}`} className="hover:underline">
                <p className="font-medium text-gray-900">{customer.name}</p>
                <p className="text-sm text-gray-500">{customer.phone}</p>
                <p className="text-sm text-gray-400">{customer.email}</p>
              </Link>
            ) : <p className="text-gray-400 text-sm">Não informado</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Car className="w-4 h-4" />Veículo</CardTitle></CardHeader>
          <CardContent className="p-4 pt-2">
            {vehicle ? (
              <div>
                <p className="font-medium text-gray-900">{vehicle.brand} {vehicle.model} {vehicle.year}</p>
                <p className="text-sm text-gray-500">{vehicle.plate} • {vehicle.color}</p>
                {(editing ? editForm.vehicle_km : order.vehicle_km) && (
                  <p className="text-sm text-gray-400">
                    {(editing ? editForm.vehicle_km : order.vehicle_km)?.toLocaleString?.('pt-BR') || (editing ? editForm.vehicle_km : order.vehicle_km)} km
                  </p>
                )}
              </div>
            ) : <p className="text-gray-400 text-sm">Não informado</p>}
          </CardContent>
        </Card>
      </div>

      {/* Revisões previstas deste veículo, a partir das OS já feitas */}
      {vehicle?.id && (
        <div className="mb-4">
          <RevisoesVeiculo vehicleId={vehicle.id} kmAtual={order.vehicle_km ?? null} />
        </div>
      )}

      {/* Technician card (view mode) */}
      {technician && !editing && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><HardHat className="w-4 h-4 text-red-600" />Técnico Responsável</CardTitle></CardHeader>
          <CardContent className="p-4 pt-2">
            <p className="font-medium text-gray-900">{technician.name}</p>
            {technician.specialty && <p className="text-sm text-gray-500">{technician.specialty}</p>}
            {technician.phone && <p className="text-sm text-gray-400">{technician.phone}</p>}
          </CardContent>
        </Card>
      )}

      {/* EDIT MODE */}
      {editing ? (
        <div className="space-y-4">
          {/* Reclamação & Diagnóstico editable */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Reclamação & Diagnóstico</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">KM atual do veículo</Label>
                  <Input className="mt-1" type="number" value={editForm.vehicle_km} onChange={e => setField('vehicle_km', e.target.value)} placeholder="15000" />
                </div>
                <div>
                  <Label className="text-xs">Técnico Responsável</Label>
                  <Select value={editForm.mechanic_id || 'none'} onValueChange={v => setField('mechanic_id', v === 'none' ? '' : v)}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nenhum —</SelectItem>
                      {allTechnicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Reclamação do cliente</Label>
                <Textarea className="mt-1" value={editForm.complaint} onChange={e => setField('complaint', e.target.value)} rows={2} />
              </div>
              <div>
                <Label className="text-xs">Diagnóstico</Label>
                <Textarea className="mt-1" value={editForm.diagnosis} onChange={e => setField('diagnosis', e.target.value)} rows={2} />
              </div>
              <div>
                <Label className="text-xs">Observações internas</Label>
                <Textarea className="mt-1" value={editForm.notes} onChange={e => setField('notes', e.target.value)} rows={2} />
              </div>
            </CardContent>
          </Card>

          {/* Parts editable */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4 text-red-600" />Peças</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input placeholder="Buscar peça..." value={partSearch} onChange={e => setPartSearch(e.target.value)} className="pl-10" />
              </div>
              {partSearch && filteredParts.length > 0 && (
                <div className="border rounded-lg divide-y max-h-44 overflow-y-auto bg-white shadow-sm z-10 relative">
                  {filteredParts.map(p => (
                    <button key={p.id} onClick={() => addPart(p)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left">
                      <div>
                        <p className="text-sm font-medium">{p.description}</p>
                        <p className="text-xs text-gray-400">{p.sku} • Estoque: {p.stock_quantity}</p>
                      </div>
                      <p className="text-sm font-bold">{formatCurrency(p.sale_price)}</p>
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                {editForm.parts_items?.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{item.description}</p></div>
                    <Input type="number" min="1" value={item.quantity} onChange={e => updatePartItem(idx, 'quantity', e.target.value)} className="w-16 text-center" />
                    <Input type="number" step="0.01" value={item.unit_price} onChange={e => updatePartItem(idx, 'unit_price', e.target.value)} className="w-24" />
                    <span className="text-sm font-bold w-20 text-right">{formatCurrency(item.total_price)}</span>
                    <button onClick={() => setEditForm(prev => ({ ...prev, parts_items: prev.parts_items.filter((_, i) => i !== idx) }))}>
                      <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                    </button>
                  </div>
                ))}
                {editForm.parts_items?.length > 0 && (
                  <div className="text-right text-sm font-semibold text-gray-700">Peças: {formatCurrency(partsTotal)}</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Services editable */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Wrench className="w-4 h-4 text-red-600" />Serviços</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input placeholder="Buscar serviço..." value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} className="pl-10" />
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
              <div className="space-y-2">
                {editForm.service_items?.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{item.description}</p></div>
                    <Input type="number" step="0.5" min="0" value={item.hours} onChange={e => updateServiceItem(idx, 'hours', e.target.value)} className="w-16 text-center" placeholder="h" />
                    <Input type="number" step="0.01" value={item.unit_price} onChange={e => updateServiceItem(idx, 'unit_price', e.target.value)} className="w-24" />
                    <span className="text-sm font-bold w-20 text-right">{formatCurrency(item.total_price)}</span>
                    <button onClick={() => setEditForm(prev => ({ ...prev, service_items: prev.service_items.filter((_, i) => i !== idx) }))}>
                      <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                    </button>
                  </div>
                ))}
                {editForm.service_items?.length > 0 && (
                  <div className="text-right text-sm font-semibold text-gray-700">Serviços: {formatCurrency(servicesTotal)}</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Totals + discount editable */}
          <Card className="border-gray-300">
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Peças</span><span>{formatCurrency(partsTotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Serviços</span><span>{formatCurrency(servicesTotal)}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Desconto (R$)</span>
                <Input type="number" min="0" step="0.01" value={editForm.discount} onChange={e => setField('discount', e.target.value)} className="w-24 text-right" />
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>Total</span><span className="text-red-600">{formatCurrency(editTotal)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Save / Cancel buttons */}
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
              <Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
            <Button variant="outline" onClick={cancelEdit} disabled={saving}>
              <X className="w-4 h-4 mr-1" />Cancelar
            </Button>
          </div>
        </div>
      ) : (
        /* VIEW MODE */
        <>
          {/* Complaint + Diagnosis */}
          {(order.complaint || order.diagnosis || order.notes) && (
            <Card className="mb-4">
              <CardContent className="p-4 space-y-2">
                {order.complaint && <div><p className="text-xs font-medium text-gray-500 uppercase">Reclamação</p><p className="text-sm text-gray-800 mt-1">{order.complaint}</p></div>}
                {order.diagnosis && <div><p className="text-xs font-medium text-gray-500 uppercase">Diagnóstico</p><p className="text-sm text-gray-800 mt-1">{order.diagnosis}</p></div>}
                {order.notes && <div><p className="text-xs font-medium text-gray-500 uppercase">Observações</p><p className="text-sm text-gray-800 mt-1">{order.notes}</p></div>}
              </CardContent>
            </Card>
          )}

          {/* Parts */}
          {order.parts_items?.length > 0 && (
            <Card className="mb-4">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4 text-red-600" />Peças</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="space-y-2">
                  {order.parts_items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <div><p className="text-sm font-medium">{item.description}</p></div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">{item.quantity}x {formatCurrency(item.unit_price)}</p>
                        <p className="text-sm font-bold">{formatCurrency(item.total_price)}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between font-medium text-sm pt-1"><span>Subtotal peças</span><span>{formatCurrency(order.parts_total)}</span></div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Services */}
          {order.service_items?.length > 0 && (
            <Card className="mb-4">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Wrench className="w-4 h-4 text-red-600" />Serviços</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="space-y-2">
                  {order.service_items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <div><p className="text-sm font-medium">{item.description}</p></div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">{item.hours}h x {formatCurrency(item.unit_price)}/h</p>
                        <p className="text-sm font-bold">{formatCurrency(item.total_price)}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between font-medium text-sm pt-1"><span>Subtotal serviços</span><span>{formatCurrency(order.services_total)}</span></div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Totals */}
          <Card className="mb-4 border-gray-300">
            <CardContent className="p-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Peças</span><span>{formatCurrency(order.parts_total)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Serviços</span><span>{formatCurrency(order.services_total)}</span></div>
              {order.discount > 0 && <div className="flex justify-between text-green-600"><span>Desconto</span><span>- {formatCurrency(order.discount)}</span></div>}
              <div className="flex justify-between font-bold text-lg pt-2 border-t"><span>Total</span><span className="text-red-600">{formatCurrency(order.total)}</span></div>
            </CardContent>
          </Card>
        </>
      )}

      {showPayment && (
        <PagamentoModal
          order={editing ? { ...order, ...editForm, parts_total: partsTotal, services_total: servicesTotal, total: editTotal } : order}
          customer={customer}
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            setShowPayment(false);
            loadOrder();
            toast({ title: 'Venda registrada com sucesso!' });
          }}
        />
      )}
    </div>
  );
}