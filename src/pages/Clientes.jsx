import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCPF, formatCNPJ, formatPhone, getStatusLabel } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Search, User, Phone, Mail, Car, Edit, ChevronRight, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CRMPanel from '@/components/clientes/CRMPanel';

export default function Clientes() {
  const { company } = useCompany();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (company?.id) loadCustomers();
  }, [company]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.Customer.filter({ company_id: company.id }, '-created_date');
      setCustomers(data);
    } finally {
      setLoading(false);
    }
  };

  const filtered = customers.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.tax_id?.includes(search) ||
    c.phone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm">{customers.length} clientes cadastrados</p>
        </div>
        <Link to="/clientes/novo">
          <Button className="bg-red-600 hover:bg-red-700 text-white">
            <Plus className="w-4 h-4 mr-2" />Novo
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="lista">
        <TabsList className="mb-4">
          <TabsTrigger value="lista">Lista de Clientes</TabsTrigger>
          <TabsTrigger value="crm">CRM & Segmentação</TabsTrigger>
        </TabsList>

        <TabsContent value="lista">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar por nome, CPF/CNPJ, telefone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12 text-gray-400">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-14 h-14 text-gray-200 mx-auto mb-4" />
              <h3 className="text-gray-600 font-medium mb-1">Nenhum cliente encontrado</h3>
              <p className="text-gray-400 text-sm mb-6">Cadastre o primeiro cliente da oficina</p>
              <Link to="/clientes/novo">
                <Button className="bg-red-600 hover:bg-red-700 text-white"><Plus className="w-4 h-4 mr-2" />Novo Cliente</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(customer => (
                <Card key={customer.id} className="hover:shadow-sm transition-shadow cursor-pointer"
                  onClick={() => navigate(`/clientes/${customer.id}`)}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 truncate">{customer.name}</p>
                          <Badge variant="outline" className="text-xs">
                            {customer.type === 'juridica' ? 'PJ' : 'PF'}
                          </Badge>
                          {!customer.is_active && <Badge className="bg-gray-100 text-gray-600 text-xs">Inativo</Badge>}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                          {customer.tax_id && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              {customer.type === 'juridica' ? formatCNPJ(customer.tax_id) : formatCPF(customer.tax_id)}
                            </span>
                          )}
                          {customer.phone && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Phone className="w-3 h-3" />{formatPhone(customer.phone)}
                            </span>
                          )}
                          {customer.email && (
                            <span className="text-xs text-gray-500 flex items-center gap-1 truncate max-w-40">
                              <Mail className="w-3 h-3" />{customer.email}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="crm">
          <CRMPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}