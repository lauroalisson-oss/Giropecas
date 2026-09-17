import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Download, ClipboardList, ShoppingCart, Filter, X, Trash2, Edit2, AlertTriangle, Printer, FileText, Receipt } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { printDocument } from '@/components/PrintReceipt';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import EmitirNotaButton from '@/components/EmitirNotaButton';
import { NFE_STATUS_LABEL, NFE_STATUS_COLOR } from '@/lib/fiscal';

const STATUS_COLORS = {
  aberta: 'bg-blue-100 text-blue-700',
  em_andamento: 'bg-yellow-100 text-yellow-700',
  aguardando_peca: 'bg-orange-100 text-orange-700',
  finalizada: 'bg-purple-100 text-purple-700',
  faturada: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-700',
  pago: 'bg-green-100 text-green-700',
  pendente: 'bg-yellow-100 text-yellow-700',
};

const STATUS_LABELS = {
  aberta: 'Aberta', em_andamento: 'Em andamento', aguardando_peca: 'Ag. peça',
  finalizada: 'Finalizada', faturada: 'Faturada', cancelada: 'Cancelada',
  pago: 'Pago', pendente: 'Pendente',
};

const PAYMENT_LABELS = {
  dinheiro: 'Dinheiro', cartao_debito: 'Débito', cartao_credito: 'Crédito',
  pix: 'PIX', crediario: 'Crediário', misto: 'Misto',
};

function exportCSV(rows, filename) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename + '.csv'; a.click();
}

export default function Historico() {
  const { company } = useCompany();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [services, setServices] = useState([]);
  const [parts, setParts] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [nfes, setNfes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterService, setFilterService] = useState('all');
  const [filterPart, setFilterPart] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [search, setSearch] = useState('');

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(null); // { type: 'order'|'sale', item }
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (company?.id) loadData();
  }, [company]);

  const loadData = async () => {
    setLoading(true);
    const [ord, sal, custs, svcs, pts, techs, notas, vehs] = await Promise.all([
      base44.entities.WorkOrder.filter({ company_id: company.id }, '-created_date', 200),
      base44.entities.Sale.filter({ company_id: company.id }, '-created_date', 200),
      base44.entities.Customer.filter({ company_id: company.id }),
      base44.entities.Service.filter({ company_id: company.id }),
      base44.entities.Part.filter({ company_id: company.id }),
      base44.entities.Technician.filter({ company_id: company.id }),
      base44.entities.NFeRecord.filter({ company_id: company.id }, '-created_date', 300).catch(() => []),
      base44.entities.Vehicle.filter({ company_id: company.id }).catch(() => []),
    ]);
    setOrders(ord);
    setSales(sal);
    setCustomers(custs);
    setVehicles(vehs);
    setServices(svcs);
    setParts(pts);
    setTechnicians(techs);
    setNfes(notas);
    setLoading(false);
  };

  const customerMap = Object.fromEntries(customers.map(c => [c.id, c]));
  const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));
  // Normaliza placa: ignora maiúsculas, hífen e espaços (ABC-1234 = abc1234)
  const normPlate = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const serviceMap = Object.fromEntries(services.map(s => [s.id, s.name]));
  const partMap = Object.fromEntries(parts.map(p => [p.id, { description: p.description, stock: p.stock_quantity }]));
  const technicianMap = Object.fromEntries(technicians.map(t => [t.id, t]));
  const partsById = Object.fromEntries(parts.map(p => [p.id, p]));

  // Última nota fiscal por venda e por OS (para mostrar status/DANFE no histórico)
  const nfeBySale = {};
  const nfeByOrder = {};
  for (const n of nfes) {
    if (n.sale_id && !nfeBySale[n.sale_id]) nfeBySale[n.sale_id] = n;
    if (n.work_order_id && !nfeByOrder[n.work_order_id]) nfeByOrder[n.work_order_id] = n;
  }

  const inDateRange = (dateStr) => {
    if (!dateStr) return true;
    const d = dateStr.split('T')[0];
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  };

  // Separate OS sales from PDV sales
  const osSales = sales.filter(s => s.type === 'os');
  const pdvSales = sales.filter(s => s.type === 'pdv');

  const filteredOrders = orders.filter(o => {
    if (!inDateRange(o.created_date)) return false;
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (filterService !== 'all') {
      if (!(o.service_items || []).some(si => si.service_id === filterService)) return false;
    }
    if (filterPart !== 'all') {
      if (!(o.parts_items || []).some(pi => pi.part_id === filterPart)) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      const qPlate = normPlate(search);
      const matchName = customerMap[o.customer_id]?.name?.toLowerCase().includes(s);
      const matchNumber = o.order_number?.toLowerCase().includes(s);
      const matchPlate = qPlate && normPlate(o.plate || vehicleMap[o.vehicle_id]?.plate).includes(qPlate);
      if (!matchName && !matchNumber && !matchPlate) return false;
    }
    return true;
  });

  const filteredPdvSales = pdvSales.filter(s => {
    if (!inDateRange(s.created_date)) return false;
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (filterPayment !== 'all' && s.payment_method !== filterPayment) return false;
    if (filterPart !== 'all') {
      if (!(s.items || []).some(i => i.part_id === filterPart || i.id === filterPart)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!customerMap[s.customer_id]?.name?.toLowerCase().includes(q) && !s.sale_number?.toLowerCase().includes(q) && !s.id?.slice(-6).includes(q)) return false;
    }
    return true;
  });

  const clearFilters = () => {
    setDateFrom(''); setDateTo(''); setFilterService('all');
    setFilterPart('all'); setFilterStatus('all'); setFilterPayment('all'); setSearch('');
  };

  const hasFilters = dateFrom || dateTo || filterService !== 'all' || filterPart !== 'all' || filterStatus !== 'all' || filterPayment !== 'all' || search;

  // Selo da nota já emitida (com link para DANFE quando autorizada)
  const NotaSelo = ({ nota }) => {
    if (!nota) return null;
    const color = NFE_STATUS_COLOR[nota.status] || 'bg-gray-100 text-gray-600';
    return (
      <div className="flex items-center gap-1.5">
        <Badge className={`text-xs ${color}`}>NF: {NFE_STATUS_LABEL[nota.status] || nota.status}</Badge>
        {nota.danfe_url && (
          <a href={nota.danfe_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline">DANFE</a>
        )}
      </div>
    );
  };

  const totalOS = filteredOrders.reduce((s, o) => s + (o.total || 0), 0);
  const totalPDV = filteredPdvSales.reduce((s, sv) => s + (sv.total || 0), 0);

  // Restore stock for a list of items [{part_id, quantity}]
  const restoreStock = async (items) => {
    for (const item of (items || [])) {
      if (!item.part_id) continue;
      const part = parts.find(p => p.id === item.part_id);
      if (!part) continue;
      const newStock = (part.stock_quantity || 0) + (item.quantity || 0);
      await base44.entities.Part.update(item.part_id, { stock_quantity: newStock });
      await base44.entities.StockMovement.create({
        company_id: company.id, part_id: item.part_id, type: 'devolucao',
        quantity: item.quantity, unit_cost: item.unit_price || 0,
        reason: 'Exclusão de venda/OS via Histórico',
        previous_stock: part.stock_quantity, new_stock: newStock,
      });
    }
  };

  const handleDeleteOrder = async () => {
    const order = confirmDelete.item;
    setDeleting(true);
    try {
      // Restore parts stock
      await restoreStock(order.parts_items || []);
      // Delete associated sale if faturada
      if (order.sale_id) {
        const sale = osSales.find(s => s.id === order.sale_id);
        if (sale) {
          await base44.entities.CreditTitle.deleteMany({ sale_id: sale.id });
          await base44.entities.AccountingEntry.deleteMany({ reference_id: sale.id });
          await base44.entities.Sale.delete(sale.id);
        }
      }
      await base44.entities.WorkOrder.delete(order.id);
      toast({ title: 'OS excluída e estoque restaurado!' });
      setConfirmDelete(null);
      loadData();
    } catch (e) {
      toast({ title: 'Erro ao excluir OS', description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSale = async () => {
    const sale = confirmDelete.item;
    setDeleting(true);
    try {
      // Restore parts stock
      const partItems = (sale.items || []).filter(i => i.type === 'part' || i.part_id);
      await restoreStock(partItems);
      // Delete credit titles and accounting
      await base44.entities.CreditTitle.deleteMany({ sale_id: sale.id });
      await base44.entities.AccountingEntry.deleteMany({ reference_id: sale.id });
      await base44.entities.Sale.delete(sale.id);
      toast({ title: 'Venda excluída e estoque restaurado!' });
      setConfirmDelete(null);
      loadData();
    } catch (e) {
      toast({ title: 'Erro ao excluir venda', description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const exportOrders = filteredOrders.map(o => ({
    numero: o.order_number, data: formatDate(o.created_date),
    cliente: customerMap[o.customer_id]?.name || '-',
    placa: o.plate || vehicleMap[o.vehicle_id]?.plate || '-',
    status: STATUS_LABELS[o.status] || o.status,
    total: o.total || 0,
    servicos: (o.service_items || []).map(si => si.description || serviceMap[si.service_id] || si.service_id).join('; '),
    pecas: (o.parts_items || []).map(pi => pi.description || partMap[pi.part_id]?.description || pi.part_id).join('; '),
  }));

  const exportSales = filteredPdvSales.map(s => ({
    numero: s.sale_number || s.id.slice(-6), data: formatDate(s.created_date),
    cliente: customerMap[s.customer_id]?.name || 'Balcão',
    pagamento: PAYMENT_LABELS[s.payment_method] || s.payment_method,
    total: s.total || 0,
    itens: (s.items || []).map(i => i.description).join('; '),
  }));

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Histórico</h1>
        <p className="text-gray-500 text-sm">Busque e filtre todo o histórico de ordens e vendas</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Buscar por cliente, nº OS/venda ou placa..." value={search}
                onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">De</Label>
              <Input type="date" className="mt-0.5" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Até</Label>
              <Input type="date" className="mt-0.5" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Serviço</Label>
              <Select value={filterService} onValueChange={setFilterService}>
                <SelectTrigger className="mt-0.5"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os serviços</SelectItem>
                  {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Peça</Label>
              <Select value={filterPart} onValueChange={setFilterPart}>
                <SelectTrigger className="mt-0.5"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as peças</SelectItem>
                  {parts.map(p => <SelectItem key={p.id} value={p.id}>{p.description}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="mt-0.5"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="aberta">Aberta</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="finalizada">Finalizada</SelectItem>
                  <SelectItem value="faturada">Faturada</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Pagamento (PDV)</Label>
              <Select value={filterPayment} onValueChange={setFilterPayment}>
                <SelectTrigger className="mt-0.5"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="cartao_debito">Débito</SelectItem>
                  <SelectItem value="cartao_credito">Crédito</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="crediario">Crediário</SelectItem>
                  <SelectItem value="misto">Misto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {hasFilters && (
            <div className="mt-3 flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-500">Filtros ativos</span>
              <button onClick={clearFilters} className="text-xs text-red-600 hover:text-red-800 flex items-center gap-0.5">
                <X className="w-3 h-3" />Limpar filtros
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="os">
        <TabsList className="mb-4">
          <TabsTrigger value="os" className="flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5" />Ordens de Serviço
            <Badge className="ml-1 bg-gray-200 text-gray-700 text-xs px-1.5">{filteredOrders.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pdv" className="flex items-center gap-1.5">
            <ShoppingCart className="w-3.5 h-3.5" />Vendas PDV
            <Badge className="ml-1 bg-gray-200 text-gray-700 text-xs px-1.5">{filteredPdvSales.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* OS Tab */}
        <TabsContent value="os">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Ordens de Serviço</CardTitle>
                  <p className="text-xs text-gray-400 mt-0.5">Total filtrado: <span className="font-semibold text-gray-700">{formatCurrency(totalOS)}</span></p>
                </div>
                <Button size="sm" variant="outline" onClick={() => exportCSV(exportOrders, 'historico-os')}>
                  <Download className="w-3 h-3 mr-1" />Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-10 text-gray-400 text-sm">Carregando...</div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">Nenhuma OS encontrada.</div>
              ) : (
                <div className="divide-y">
                  {filteredOrders.map(order => (
                    <div key={order.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link to={`/ordens/${order.id}`} className="font-medium text-sm text-blue-700 hover:underline">
                              OS #{order.order_number || order.id.slice(-6)}
                            </Link>
                            <Badge className={`text-xs ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
                              {STATUS_LABELS[order.status] || order.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{customerMap[order.customer_id]?.name || 'Cliente não informado'} • {formatDate(order.created_date)}</span>
                            {(order.plate || vehicleMap[order.vehicle_id]?.plate) && (
                              <span className="font-mono uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{order.plate || vehicleMap[order.vehicle_id].plate}</span>
                            )}
                          </p>
                          {(order.service_items || []).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {order.service_items.map((si, i) => (
                                <span key={i} className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                                  {si.description || serviceMap[si.service_id] || 'Serviço'}
                                </span>
                              ))}
                            </div>
                          )}
                          {(order.parts_items || []).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {order.parts_items.map((pi, i) => (
                                <span key={i} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                  {pi.quantity}x {pi.description || partMap[pi.part_id]?.description || 'Peça'}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {nfeByOrder[order.id] && <NotaSelo nota={nfeByOrder[order.id]} />}
                            {(!nfeByOrder[order.id] || ['rejeitada', 'cancelada'].includes(nfeByOrder[order.id].status)) && (
                              <EmitirNotaButton workOrderId={order.id} items={order.parts_items} partsById={partsById} onEmitted={loadData} />
                            )}
                          </div>
                        </div>
                        <div className="flex items-start gap-2 flex-shrink-0">
                          <div className="text-right">
                            <p className="font-bold text-sm">{formatCurrency(order.total || 0)}</p>
                            <p className="text-xs text-gray-400">
                              S: {formatCurrency(order.services_total || 0)} | P: {formatCurrency(order.parts_total || 0)}
                            </p>
                          </div>
                          <div className="flex gap-1 mt-0.5">
                            <button onClick={() => navigate(`/ordens/${order.id}`)}
                              className="p-1.5 rounded hover:bg-blue-100 text-blue-600" title="Editar OS">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Imprimir">
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => printDocument({ type: 'os', doc: order, company, customer: customerMap[order.customer_id] || null, technician: technicianMap[order.mechanic_id] || null, format: 'a4' })}>
                                  <FileText className="w-3.5 h-3.5 mr-2" />Folha A4
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => printDocument({ type: 'os', doc: order, company, customer: customerMap[order.customer_id] || null, technician: technicianMap[order.mechanic_id] || null, format: 'cupom' })}>
                                  <Receipt className="w-3.5 h-3.5 mr-2" />Cupom 80mm
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <button onClick={() => setConfirmDelete({ type: 'order', item: order })}
                              className="p-1.5 rounded hover:bg-red-100 text-red-500" title="Excluir OS">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PDV Tab — only pdv type sales */}
        <TabsContent value="pdv">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Vendas PDV</CardTitle>
                  <p className="text-xs text-gray-400 mt-0.5">Total filtrado: <span className="font-semibold text-gray-700">{formatCurrency(totalPDV)}</span></p>
                </div>
                <Button size="sm" variant="outline" onClick={() => exportCSV(exportSales, 'historico-pdv')}>
                  <Download className="w-3 h-3 mr-1" />Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-10 text-gray-400 text-sm">Carregando...</div>
              ) : filteredPdvSales.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">Nenhuma venda PDV encontrada.</div>
              ) : (
                <div className="divide-y">
                  {filteredPdvSales.map(sale => (
                    <div key={sale.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              PDV #{sale.sale_number || sale.id.slice(-6)}
                            </span>
                            <Badge className={`text-xs ${STATUS_COLORS[sale.status] || 'bg-gray-100 text-gray-600'}`}>
                              {STATUS_LABELS[sale.status] || sale.status}
                            </Badge>
                            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {PAYMENT_LABELS[sale.payment_method] || sale.payment_method}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {customerMap[sale.customer_id]?.name || 'Balcão'} • {formatDate(sale.created_date)}
                          </p>
                          {(sale.items || []).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {sale.items.map((item, i) => (
                                <span key={i} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                  {item.quantity}x {item.description}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {nfeBySale[sale.id] && <NotaSelo nota={nfeBySale[sale.id]} />}
                            {(!nfeBySale[sale.id] || ['rejeitada', 'cancelada'].includes(nfeBySale[sale.id].status)) && (
                              <EmitirNotaButton saleId={sale.id} items={sale.items} partsById={partsById} onEmitted={loadData} />
                            )}
                          </div>
                        </div>
                        <div className="flex items-start gap-2 flex-shrink-0">
                          <div className="text-right">
                            <p className="font-bold text-sm">{formatCurrency(sale.total || 0)}</p>
                            {(sale.discount || 0) > 0 && (
                              <p className="text-xs text-green-600">-{formatCurrency(sale.discount)}</p>
                            )}
                          </div>
                          <div className="flex gap-1 mt-0.5">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Imprimir">
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => printDocument({ type: 'pdv', doc: sale, company, customer: customerMap[sale.customer_id] || null, format: 'a4' })}>
                                  <FileText className="w-3.5 h-3.5 mr-2" />Folha A4
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => printDocument({ type: 'pdv', doc: sale, company, customer: customerMap[sale.customer_id] || null, format: 'cupom' })}>
                                  <Receipt className="w-3.5 h-3.5 mr-2" />Cupom 80mm
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <button onClick={() => setConfirmDelete({ type: 'sale', item: sale })}
                              className="p-1.5 rounded hover:bg-red-100 text-red-500" title="Excluir venda">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <Dialog open onOpenChange={() => !deleting && setConfirmDelete(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                Confirmar Exclusão
              </DialogTitle>
            </DialogHeader>
            <div className="py-3 space-y-3">
              <p className="text-sm text-gray-700">
                {confirmDelete.type === 'order'
                  ? `Tem certeza que deseja excluir a OS #${confirmDelete.item.order_number || confirmDelete.item.id.slice(-6)}?`
                  : `Tem certeza que deseja excluir a venda PDV #${confirmDelete.item.sale_number || confirmDelete.item.id.slice(-6)}?`}
              </p>
              {(confirmDelete.type === 'order'
                ? (confirmDelete.item.parts_items || []).length > 0
                : (confirmDelete.item.items || []).some(i => i.part_id)
              ) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  <strong>⚠️ As peças usadas serão devolvidas ao estoque automaticamente.</strong>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <Button variant="outline" onClick={() => setConfirmDelete(null)} className="flex-1" disabled={deleting}>
                  Cancelar
                </Button>
                <Button
                  onClick={confirmDelete.type === 'order' ? handleDeleteOrder : handleDeleteSale}
                  disabled={deleting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  {deleting ? 'Excluindo...' : 'Excluir'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}