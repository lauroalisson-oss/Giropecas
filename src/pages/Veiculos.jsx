import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Car, ChevronRight } from 'lucide-react';

export default function Veiculos() {
  const { company } = useCompany();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (company?.id) loadVehicles();
  }, [company]);

  const loadVehicles = async () => {
    setLoading(true);
    try {
      const [vehs, custs] = await Promise.all([
        base44.entities.Vehicle.filter({ company_id: company.id }, '-created_date'),
        base44.entities.Customer.filter({ company_id: company.id })
      ]);
      setVehicles(vehs);
      const custMap = {};
      custs.forEach(c => { custMap[c.id] = c; });
      setCustomers(custMap);
    } finally {
      setLoading(false);
    }
  };

  const filtered = vehicles.filter(v =>
    v.model?.toLowerCase().includes(search.toLowerCase()) ||
    v.plate?.toLowerCase().includes(search.toLowerCase()) ||
    v.brand?.toLowerCase().includes(search.toLowerCase()) ||
    customers[v.customer_id]?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Veículos</h1>
          <p className="text-gray-500 text-sm">{vehicles.length} veículos cadastrados</p>
        </div>
        <Link to="/veiculos/novo">
          <Button className="bg-red-600 hover:bg-red-700 text-white"><Plus className="w-4 h-4 mr-2" />Novo</Button>
        </Link>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="Buscar por placa, modelo, marca..." value={search}
          onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Carregando...</div> :
        filtered.length === 0 ? (
          <div className="text-center py-16">
            <Car className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <h3 className="text-gray-600 font-medium mb-4">Nenhum veículo encontrado</h3>
            <Link to="/veiculos/novo"><Button className="bg-red-600 hover:bg-red-700 text-white"><Plus className="w-4 h-4 mr-2" />Novo Veículo</Button></Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filtered.map(v => (
              <Card key={v.id} className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/veiculos/${v.id}`)}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Car className="w-6 h-6 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{v.brand} {v.model}</p>
                      {v.year && <Badge variant="outline" className="text-xs">{v.year}</Badge>}
                    </div>
                    <p className="text-sm text-gray-500">{v.plate} • {v.color}</p>
                    {customers[v.customer_id] && (
                      <p className="text-xs text-gray-400 mt-1">{customers[v.customer_id].name}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </CardContent>
              </Card>
            ))}
          </div>
        )
      }
    </div>
  );
}