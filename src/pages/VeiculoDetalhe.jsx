import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { formatDate, getStatusColor, getStatusLabel } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Edit, ClipboardList, Car } from 'lucide-react';

export default function VeiculoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const v = await base44.entities.Vehicle.get(id);
        setVehicle(v);
        if (v.customer_id) {
          const c = await base44.entities.Customer.get(v.customer_id);
          setCustomer(c);
        }
        const ords = await base44.entities.WorkOrder.filter({ vehicle_id: id }, '-created_date');
        setOrders(ords);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) return <div className="flex justify-center py-20 text-gray-400">Carregando...</div>;
  if (!vehicle) return <div className="p-6 text-gray-500">Veículo não encontrado.</div>;

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-900"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{vehicle.brand} {vehicle.model} {vehicle.year}</h1>
          <p className="text-gray-500 text-sm">{vehicle.plate}</p>
        </div>
        <Link to={`/veiculos/${id}/editar`}>
          <Button variant="outline" size="sm"><Edit className="w-4 h-4 mr-1" />Editar</Button>
        </Link>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4 grid grid-cols-2 gap-3">
          {[
            ['Marca', vehicle.brand], ['Modelo', vehicle.model], ['Ano', vehicle.year],
            ['Placa', vehicle.plate], ['Cor', vehicle.color], ['Motor', vehicle.engine],
            ['KM', vehicle.current_km?.toLocaleString('pt-BR') + ' km'], ['Chassi', vehicle.chassis],
          ].filter(([, v]) => v).map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-sm font-medium text-gray-900">{value}</p>
            </div>
          ))}
          {customer && (
            <div className="col-span-2 border-t pt-3 mt-1">
              <p className="text-xs text-gray-400">Proprietário</p>
              <Link to={`/clientes/${customer.id}`} className="text-sm font-medium text-red-600 hover:underline">{customer.name}</Link>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Histórico de OS ({orders.length})</h2>
        <Link to={`/ordens/nova?customer_id=${vehicle.customer_id}`}>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white"><ClipboardList className="w-4 h-4 mr-1" />Nova OS</Button>
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Car className="w-10 h-10 mx-auto mb-2 text-gray-200" />
          <p>Nenhuma OS para este veículo</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(o => (
            <Link key={o.id} to={`/ordens/${o.id}`}>
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">OS #{o.order_number || o.id.slice(-6)}</p>
                    <p className="text-sm text-gray-400">{formatDate(o.created_date)}</p>
                  </div>
                  <Badge className={getStatusColor(o.status)}>{getStatusLabel(o.status)}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}