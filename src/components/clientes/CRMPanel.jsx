import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Phone, Mail, Clock, Star, AlertCircle, TrendingUp } from 'lucide-react';

export default function CRMPanel() {
  const { company } = useCompany();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => { if (company?.id) loadData(); }, [company]);

  const loadData = async () => {
    setLoading(true);
    const [c, s, v] = await Promise.all([
      base44.entities.Customer.filter({ company_id: company.id }, '-created_date'),
      base44.entities.Sale.filter({ company_id: company.id }, '-created_date', 1000),
      base44.entities.Vehicle.filter({ company_id: company.id }),
    ]);
    setCustomers(c); setSales(s); setVehicles(v);
    setLoading(false);
  };

  // Segmentação
  const now = new Date();
  const customerStats = customers.map(c => {
    const cSales = sales.filter(s => s.customer_id === c.id);
    const total = cSales.reduce((s, x) => s + (x.total || 0), 0);
    const lastSale = cSales.length > 0 ? cSales[0].created_date : null;
    const daysSince = lastSale ? Math.floor((now - new Date(lastSale)) / 86400000) : null;
    const count = cSales.length;
    return { ...c, totalGasto: total, ultimaCompra: lastSale, diasDesde: daysSince, numCompras: count, veiculos: vehicles.filter(vh => vh.customer_id === c.id).length };
  });

  const vip = customerStats.filter(c => c.totalGasto >= 1000).sort((a, b) => b.totalGasto - a.totalGasto);
  const inativos = customerStats.filter(c => c.diasDesde !== null && c.diasSince > 90);
  const novos = customerStats.filter(c => c.numCompras === 0 || c.diasSince === null);
  const followUp = customerStats.filter(c => c.diasDesde !== null && c.diasDesde > 45 && c.diasDesde <= 90);

  const filtered = search
    ? customerStats.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <div className="space-y-4">
      {/* Funil / Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-yellow-50 border-yellow-200"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Star className="w-4 h-4 text-yellow-600" /><p className="text-xs text-gray-600">Clientes VIP</p></div>
          <p className="text-lg font-bold text-yellow-700">{vip.length}</p>
          <p className="text-xs text-gray-500">R$ 1.000+ em compras</p>
        </CardContent></Card>
        <Card className="bg-green-50 border-green-200"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-green-600" /><p className="text-xs text-gray-600">Novos</p></div>
          <p className="text-lg font-bold text-green-700">{novos.length}</p>
          <p className="text-xs text-gray-500">Sem compras ainda</p>
        </CardContent></Card>
        <Card className="bg-orange-50 border-orange-200"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-orange-600" /><p className="text-xs text-gray-600">Follow-up</p></div>
          <p className="text-lg font-bold text-orange-700">{followUp.length}</p>
          <p className="text-xs text-gray-500">45-90 dias sem comprar</p>
        </CardContent></Card>
        <Card className="bg-red-50 border-red-200"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><AlertCircle className="w-4 h-4 text-red-600" /><p className="text-xs text-gray-600">Inativos</p></div>
          <p className="text-lg font-bold text-red-700">{inativos.length}</p>
          <p className="text-xs text-gray-500">+90 dias sem comprar</p>
        </CardContent></Card>
      </div>

      {/* Busca rápida */}
      <div className="relative">
        <Input placeholder="Buscar cliente para ver histórico de compras..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />
      </div>

      {search && filtered.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Resultado da busca</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {filtered.slice(0, 10).map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.numCompras} compras • {c.veiculos} veículo(s)</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{formatCurrency(c.totalGasto)}</p>
                  <p className="text-xs text-gray-400">{c.ultimaCompra ? formatDate(c.ultimaCompra) : 'Sem compras'}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Follow-up list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-orange-500" />Clientes para Follow-up ({followUp.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-gray-400 text-sm text-center py-4">Carregando...</p> :
            followUp.length === 0 ? <p className="text-gray-400 text-sm text-center py-4">Nenhum cliente precisa de follow-up agora</p> : (
            <div className="space-y-2">
              {followUp.slice(0, 15).map(c => (
                <div key={c.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-orange-700">{c.name?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-gray-500">Última compra: {formatDate(c.ultimaCompra)} • {c.diasDesde} dias</p>
                  </div>
                  <div className="flex gap-1">
                    {c.phone && <a href={`tel:${c.phone}`}><Button size="icon" variant="ghost" className="h-8 w-8 text-green-600"><Phone className="w-4 h-4" /></Button></a>}
                    {c.email && <a href={`mailto:${c.email}`}><Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600"><Mail className="w-4 h-4" /></Button></a>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* VIP list */}
      {vip.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Star className="w-4 h-4 text-yellow-500" />Top Clientes VIP</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {vip.slice(0, 10).map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <Badge className={i === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}>#{i + 1}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.numCompras} compras • {c.veiculos} veículo(s)</p>
                  </div>
                  <p className="text-sm font-bold text-yellow-700">{formatCurrency(c.totalGasto)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}