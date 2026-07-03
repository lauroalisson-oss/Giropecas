import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { formatCPF, formatCNPJ, formatPhone, formatCurrency, formatDate, getStatusColor, getStatusLabel } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Car, ClipboardList, CreditCard, Phone, Mail, MapPin } from 'lucide-react';

export default function ClienteDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [orders, setOrders] = useState([]);
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, [id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cust, vehs, ords, crds] = await Promise.all([
        base44.entities.Customer.get(id),
        base44.entities.Vehicle.filter({ customer_id: id }),
        base44.entities.WorkOrder.filter({ customer_id: id }, '-created_date', 10),
        base44.entities.CreditTitle.filter({ customer_id: id }, '-due_date', 10),
      ]);
      setCustomer(cust);
      setVehicles(vehs);
      setOrders(ords);
      setCredits(crds);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20 text-gray-400">Carregando...</div>;
  if (!customer) return <div className="p-6 text-gray-500">Cliente não encontrado.</div>;

  const totalDebt = credits.filter(c => c.status !== 'pago' && c.status !== 'cancelado')
    .reduce((s, c) => s + (c.remaining_amount || 0), 0);

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-900">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{customer.name}</h1>
          <p className="text-gray-500 text-sm">{customer.type === 'juridica' ? formatCNPJ(customer.tax_id) : formatCPF(customer.tax_id)}</p>
        </div>
        <Link to={`/clientes/${id}/editar`}>
          <Button variant="outline" size="sm"><Edit className="w-4 h-4 mr-1" />Editar</Button>
        </Link>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{vehicles.length}</p>
          <p className="text-xs text-gray-500">Veículos</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
          <p className="text-xs text-gray-500">OS</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-lg font-bold text-green-600">{formatCurrency(customer.credit_limit || 0)}</p>
          <p className="text-xs text-gray-500">Limite</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-lg font-bold text-red-600">{formatCurrency(totalDebt)}</p>
          <p className="text-xs text-gray-500">Em aberto</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="mb-4">
          <TabsTrigger value="info">Dados</TabsTrigger>
          <TabsTrigger value="veiculos">Veículos ({vehicles.length})</TabsTrigger>
          <TabsTrigger value="os">OS ({orders.length})</TabsTrigger>
          <TabsTrigger value="crediario">Crediário ({credits.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardContent className="p-4 space-y-3">
              {customer.phone && <div className="flex items-center gap-3 text-sm"><Phone className="w-4 h-4 text-gray-400" />{formatPhone(customer.phone)}</div>}
              {customer.email && <div className="flex items-center gap-3 text-sm"><Mail className="w-4 h-4 text-gray-400" />{customer.email}</div>}
              {customer.address && <div className="flex items-center gap-3 text-sm"><MapPin className="w-4 h-4 text-gray-400" />{customer.address}, {customer.city} - {customer.state}</div>}
              {customer.notes && <div className="pt-2 border-t"><p className="text-sm text-gray-600">{customer.notes}</p></div>}
              <div className="flex gap-2 pt-2">
                <Badge className={customer.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}>
                  {customer.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
                {customer.lgpd_consent && <Badge className="bg-blue-100 text-blue-700">LGPD OK</Badge>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="veiculos">
          <div className="space-y-2">
            <Link to={`/veiculos/novo?customer_id=${id}`}>
              <Button size="sm" className="mb-3 bg-red-600 hover:bg-red-700 text-white"><Car className="w-4 h-4 mr-2" />Novo Veículo</Button>
            </Link>
            {vehicles.length === 0 ? <p className="text-gray-400 text-sm">Nenhum veículo cadastrado</p> :
              vehicles.map(v => (
                <Link key={v.id} to={`/veiculos/${v.id}`}>
                  <Card className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{v.brand} {v.model} {v.year}</p>
                        <p className="text-sm text-gray-500">{v.plate} • {v.color}</p>
                      </div>
                      <Badge variant="outline">{v.current_km?.toLocaleString('pt-BR')} km</Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))
            }
          </div>
        </TabsContent>

        <TabsContent value="os">
          <div className="space-y-2">
            <Link to={`/ordens/nova?customer_id=${id}`}>
              <Button size="sm" className="mb-3 bg-red-600 hover:bg-red-700 text-white"><ClipboardList className="w-4 h-4 mr-2" />Nova OS</Button>
            </Link>
            {orders.length === 0 ? <p className="text-gray-400 text-sm">Nenhuma OS encontrada</p> :
              orders.map(o => (
                <Link key={o.id} to={`/ordens/${o.id}`}>
                  <Card className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">OS #{o.order_number || o.id.slice(-6)}</p>
                        <p className="text-sm text-gray-500">{formatDate(o.created_date)}</p>
                      </div>
                      <Badge className={getStatusColor(o.status)}>{getStatusLabel(o.status)}</Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))
            }
          </div>
        </TabsContent>

        <TabsContent value="crediario">
          <div className="space-y-2">
            {credits.length === 0 ? <p className="text-gray-400 text-sm">Nenhum título de crediário</p> :
              credits.map(c => (
                <Card key={c.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Parc. {c.installment_number}/{c.total_installments}</p>
                      <p className="text-xs text-gray-500">Venc: {formatDate(c.due_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">{formatCurrency(c.remaining_amount)}</p>
                      <Badge className={`text-xs ${getStatusColor(c.status)}`}>{getStatusLabel(c.status)}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            }
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}