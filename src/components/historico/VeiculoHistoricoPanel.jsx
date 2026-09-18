import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Car, Wrench, ShieldCheck, Calendar, History } from 'lucide-react';

export default function VeiculoHistoricoPanel() {
  const { company } = useCompany();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  useEffect(() => { if (company?.id) loadData(); }, [company]);

  const loadData = async () => {
    setLoading(true);
    const [v, o] = await Promise.all([
      base44.entities.Vehicle.filter({ company_id: company.id }, '-created_date'),
      base44.entities.WorkOrder.filter({ company_id: company.id }, '-created_date', 500),
    ]);
    setVehicles(v);
    setOrders(o);
    setLoading(false);
  };

  // Filtrar veículos por placa ou modelo
  const filteredVehicles = search
    ? vehicles.filter(v =>
        v.plate?.toLowerCase().includes(search.toLowerCase()) ||
        v.model?.toLowerCase().includes(search.toLowerCase()) ||
        v.brand?.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  // Histórico de OS do veículo selecionado
  const vehicleOrders = selectedVehicle
    ? orders.filter(o => o.vehicle_id === selectedVehicle.id || o.plate === selectedVehicle.plate)
    : [];

  // Garantias: OS faturadas nos últimos 90 dias (garantia padrão 90 dias)
  const now = new Date();
  const garantias = vehicleOrders.filter(o => {
    if (!['faturada', 'finalizada'].includes(o.status)) return false;
    const closed = o.closed_at || o.created_date;
    if (!closed) return false;
    const days = Math.floor((now - new Date(closed)) / 86400000);
    return days <= 90;
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Buscar veículo por placa, modelo ou marca..."
          value={search}
          onChange={e => { setSearch(e.target.value); setSelectedVehicle(null); }}
          className="pl-10"
        />
      </div>

      {!selectedVehicle && search && filteredVehicles.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Veículos encontrados ({filteredVehicles.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {filteredVehicles.slice(0, 10).map(v => (
              <button key={v.id} onClick={() => setSelectedVehicle(v)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 border text-left transition-colors">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Car className="w-5 h-5 text-gray-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{v.brand} {v.model}</p>
                  <p className="text-xs text-gray-500">{v.plate} • {v.year || '—'}</p>
                </div>
                <Badge className="bg-blue-100 text-blue-700">{orders.filter(o => o.vehicle_id === v.id).length} OS</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {!selectedVehicle && !search && !loading && (
        <Card>
          <CardContent className="py-10 text-center">
            <Car className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Digite uma placa ou modelo para ver o histórico completo do veículo</p>
          </CardContent>
        </Card>
      )}

      {selectedVehicle && (
        <div className="space-y-4">
          {/* Vehicle info */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <Car className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{selectedVehicle.brand} {selectedVehicle.model}</h3>
                    <p className="text-sm text-gray-500">{selectedVehicle.plate} • {selectedVehicle.year || '—'} • {selectedVehicle.current_km || 0} km</p>
                  </div>
                </div>
                <Button variant="ghost" onClick={() => setSelectedVehicle(null)}>← Voltar</Button>
              </div>
            </CardContent>
          </Card>

          {/* Warranty summary */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-green-50 border-green-200"><CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1"><ShieldCheck className="w-4 h-4 text-green-600" /><p className="text-xs text-gray-600">Em Garantia</p></div>
              <p className="text-lg font-bold text-green-700">{garantias.length}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1"><Wrench className="w-4 h-4 text-blue-500" /><p className="text-xs text-gray-600">Total OS</p></div>
              <p className="text-lg font-bold text-blue-700">{vehicleOrders.length}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1"><Calendar className="w-4 h-4 text-gray-500" /><p className="text-xs text-gray-600">Total Gasto</p></div>
              <p className="text-lg font-bold text-gray-800">{formatCurrency(vehicleOrders.reduce((s, o) => s + (o.total || 0), 0))}</p>
            </CardContent></Card>
          </div>

          {/* Service history timeline */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><History className="w-4 h-4" />Histórico de Serviços</CardTitle></CardHeader>
            <CardContent>
              {vehicleOrders.length === 0 ? (
                <p className="text-center text-gray-400 py-6 text-sm">Nenhuma OS registrada para este veículo</p>
              ) : (
                <div className="space-y-3">
                  {vehicleOrders.map((o, i) => {
                    const isWarranty = garantias.includes(o);
                    const closedDate = o.closed_at || o.created_date;
                    const daysAgo = closedDate ? Math.floor((now - new Date(closedDate)) / 86400000) : null;
                    return (
                      <div key={o.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isWarranty ? 'bg-green-100' : 'bg-gray-100'}`}>
                            {isWarranty ? <ShieldCheck className="w-4 h-4 text-green-600" /> : <Wrench className="w-4 h-4 text-gray-500" />}
                          </div>
                          {i < vehicleOrders.length - 1 && <div className="w-px h-full bg-gray-200 flex-1" />}
                        </div>
                        <div className="flex-1 pb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">OS #{o.order_number || o.id.slice(-6)}</p>
                            {isWarranty && <Badge className="bg-green-100 text-green-700 text-xs">Em Garantia ({90 - daysAgo}d restantes)</Badge>}
                            <Badge className="text-xs bg-gray-100 text-gray-600">{o.status}</Badge>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{formatDate(closedDate)} • {daysAgo} dias atrás</p>
                          {o.complaint && <p className="text-sm text-gray-700 mt-1">Queixa: {o.complaint}</p>}
                          {o.diagnosis && <p className="text-xs text-gray-500 mt-0.5">Diagnóstico: {o.diagnosis}</p>}
                          <div className="mt-1.5 flex gap-3 text-xs text-gray-500">
                            <span>Peças: {formatCurrency(o.parts_total || 0)}</span>
                            <span>Serviços: {formatCurrency(o.services_total || 0)}</span>
                            <span className="font-medium text-gray-700">Total: {formatCurrency(o.total || 0)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}