import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, Package, AlertTriangle, ChevronRight } from 'lucide-react';
import EstoqueAvancadoPanel from '@/components/pecas/EstoqueAvancadoPanel';

export default function Pecas() {
  const { company } = useCompany();
  const navigate = useNavigate();
  const [parts, setParts] = useState([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (company?.id) loadParts();
  }, [company]);

  const loadParts = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.Part.filter({ company_id: company.id }, '-created_date');
      setParts(data);
    } finally {
      setLoading(false);
    }
  };

  const filtered = parts.filter(p => {
    const matchSearch = p.description?.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.internal_code?.toLowerCase().includes(search.toLowerCase());
    if (tab === 'low') return matchSearch && (p.stock_quantity || 0) <= (p.min_stock || 1);
    if (tab === 'inactive') return matchSearch && !p.is_active;
    return matchSearch && p.is_active !== false;
  });

  const lowStockCount = parts.filter(p => (p.stock_quantity || 0) <= (p.min_stock || 1)).length;

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Peças & Estoque</h1>
          <p className="text-gray-500 text-sm">{parts.length} itens • {lowStockCount} com estoque baixo</p>
        </div>
        <Link to="/pecas/nova">
          <Button className="bg-red-600 hover:bg-red-700 text-white"><Plus className="w-4 h-4 mr-2" />Nova Peça</Button>
        </Link>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="Buscar por descrição, SKU, código..." value={search}
          onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="low" className="gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />Estoque Baixo {lowStockCount > 0 && `(${lowStockCount})`}
          </TabsTrigger>
          <TabsTrigger value="inactive">Inativos</TabsTrigger>
          <TabsTrigger value="avancado">Gestão Avançada</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'avancado' ? (
        <EstoqueAvancadoPanel />
      ) : loading ? <div className="text-center py-12 text-gray-400">Carregando...</div> :
        filtered.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <h3 className="text-gray-600 font-medium mb-4">Nenhuma peça encontrada</h3>
            <Link to="/pecas/nova"><Button className="bg-red-600 hover:bg-red-700 text-white"><Plus className="w-4 h-4 mr-2" />Nova Peça</Button></Link>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(part => {
              const isLow = (part.stock_quantity || 0) <= (part.min_stock || 1);
              return (
                <Card key={part.id} className="cursor-pointer hover:shadow-sm transition-shadow"
                  onClick={() => navigate(`/pecas/${part.id}`)}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 ${isLow ? 'bg-orange-100' : 'bg-gray-100'} rounded-lg flex items-center justify-center flex-shrink-0`}>
                        <Package className={`w-5 h-5 ${isLow ? 'text-orange-500' : 'text-gray-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 truncate">{part.description}</p>
                          {isLow && <Badge className="bg-orange-100 text-orange-700 text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Baixo</Badge>}
                          {!part.is_active && <Badge className="bg-gray-100 text-gray-600 text-xs">Inativo</Badge>}
                        </div>
                        <div className="flex gap-4 mt-1">
                          {part.sku && <span className="text-xs text-gray-400">SKU: {part.sku}</span>}
                          <span className="text-xs text-gray-500">Estoque: <span className={`font-medium ${isLow ? 'text-orange-600' : 'text-gray-700'}`}>{part.stock_quantity || 0}</span> {part.unit}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900">{formatCurrency(part.sale_price)}</p>
                        <p className="text-xs text-gray-400">Custo: {formatCurrency(part.cost_price)}</p>
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