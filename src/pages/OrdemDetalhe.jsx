import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Printer, CreditCard, Package, Wrench, User, Car, Edit } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PagamentoModal from '@/components/PagamentoModal';

const STATUS_FLOW = ['aberta', 'em_andamento', 'aguardando_peca', 'finalizada'];

export default function OrdemDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [order, setOrder] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

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
    } finally {
      setLoading(false);
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
    if (!confirm('Cancelar esta OS?')) return;
    await updateStatus('cancelada');
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div className="flex justify-center py-20 text-gray-400">Carregando...</div>;
  if (!order) return <div className="p-6 text-gray-500">OS não encontrada.</div>;

  const canAdvance = STATUS_FLOW.includes(order.status) && order.status !== 'finalizada';
  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1];
  const canBill = order.status === 'finalizada';

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
        <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" />Imprimir</Button>
      </div>

      {/* Status actions */}
      {order.status !== 'cancelada' && order.status !== 'faturada' && (
        <Card className="mb-4 border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-medium text-blue-800">Status atual</p>
                <p className="text-xs text-blue-600">{getStatusLabel(order.status)}</p>
              </div>
              <div className="flex gap-2">
                {canAdvance && (
                  <Button size="sm" onClick={() => updateStatus(nextStatus)} disabled={updating}
                    className="bg-blue-600 hover:bg-blue-700 text-white">
                    → {getStatusLabel(nextStatus)}
                  </Button>
                )}
                {canBill && (
                  <Button size="sm" onClick={() => setShowPayment(true)}
                    className="bg-green-600 hover:bg-green-700 text-white">
                    <CreditCard className="w-4 h-4 mr-1" />Faturar
                  </Button>
                )}
                {order.status !== 'cancelada' && (
                  <Button size="sm" variant="outline" onClick={cancelOrder}
                    className="text-red-600 border-red-200 hover:bg-red-50">Cancelar</Button>
                )}
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
                {order.vehicle_km && <p className="text-sm text-gray-400">{order.vehicle_km?.toLocaleString('pt-BR')} km</p>}
              </div>
            ) : <p className="text-gray-400 text-sm">Não informado</p>}
          </CardContent>
        </Card>
      </div>

      {/* Complaint + Diagnosis */}
      {(order.complaint || order.diagnosis) && (
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

      {showPayment && (
        <PagamentoModal
          order={order}
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