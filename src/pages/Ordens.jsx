import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, ClipboardList, ChevronRight, Calendar } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'aberta', label: 'Aberta' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'aguardando_peca', label: 'Aguardando Peça' },
  { value: 'finalizada', label: 'Finalizada' },
  { value: 'faturada', label: 'Faturada' },
  { value: 'cancelada', label: 'Cancelada' },
];

export default function Ordens() {
  const { company } = useCompany();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (company?.id) loadOrders();
  }, [company]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const [ords, custs] = await Promise.all([
        base44.entities.WorkOrder.filter({ company_id: company.id }, '-created_date'),
        base44.entities.Customer.filter({ company_id: company.id })
      ]);
      setOrders(ords);
      const map = {};
      custs.forEach(c => { map[c.id] = c; });
      setCustomers(map);
    } finally {
      setLoading(false);
    }
  };

  const filtered = orders.filter(o => {
    const customer = customers[o.customer_id];
    const matchSearch = o.order_number?.includes(search) ||
      customer?.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ordens de Serviço</h1>
          <p className="text-gray-500 text-sm">{orders.length} OS no total</p>
        </div>
        <Link to="/ordens/nova">
          <Button className="bg-red-600 hover:bg-red-700 text-white"><Plus className="w-4 h-4 mr-2" />Nova OS</Button>
        </Link>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Buscar por número, cliente..." value={search}
            onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Carregando...</div> :
        filtered.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <h3 className="text-gray-600 font-medium mb-4">Nenhuma OS encontrada</h3>
            <Link to="/ordens/nova"><Button className="bg-red-600 hover:bg-red-700 text-white"><Plus className="w-4 h-4 mr-2" />Nova OS</Button></Link>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(order => {
              const customer = customers[order.customer_id];
              return (
                <Card key={order.id} className="cursor-pointer hover:shadow-sm transition-shadow"
                  onClick={() => navigate(`/ordens/${order.id}`)}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-gray-900">OS #{order.order_number || order.id.slice(-6)}</span>
                          <Badge className={`text-xs ${getStatusColor(order.status)}`}>{getStatusLabel(order.status)}</Badge>
                        </div>
                        <p className="text-sm text-gray-700 font-medium">{customer?.name || 'Cliente não encontrado'}</p>
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" />{formatDate(order.opened_at || order.created_date)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900">{formatCurrency(order.total)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {(order.parts_items?.length || 0)} peças • {(order.service_items?.length || 0)} serviços
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      }
    </div>
  );
}