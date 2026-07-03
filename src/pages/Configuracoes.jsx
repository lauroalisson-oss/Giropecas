import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Users, FileText, CreditCard, Save } from 'lucide-react';
import TaxasCartao from './TaxasCartao';
import { useToast } from '@/components/ui/use-toast';

export default function Configuracoes() {
  const { company, setCompany } = useCompany();
  const { toast } = useToast();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (company) {
      setForm({ ...company });
      loadUsers();
    }
  }, [company]);

  const loadUsers = async () => {
    try {
      const data = await base44.entities.User.list();
      setUsers(data);
    } catch (e) {}
  };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSaveCompany = async () => {
    setSaving(true);
    try {
      if (company?.id) {
        await base44.entities.Company.update(company.id, form);
        setCompany({ ...company, ...form });
        toast({ title: 'Configurações salvas!' });
      } else {
        const created = await base44.entities.Company.create(form);
        setCompany(created);
        toast({ title: 'Empresa cadastrada!' });
      }
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCompany = async () => {
    if (!form.name?.trim()) { toast({ title: 'Nome obrigatório', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const created = await base44.entities.Company.create({ ...form });
      setCompany(created);
      toast({ title: 'Empresa criada com sucesso!' });
    } catch (e) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-gray-500 text-sm">Gerencie sua empresa e preferências</p>
      </div>

      {!company && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="font-semibold text-red-800">Empresa não configurada</p>
            <p className="text-sm text-red-600 mt-1">Configure os dados da sua oficina para começar a usar o sistema.</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="empresa">
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="empresa">Empresa</TabsTrigger>
          <TabsTrigger value="fiscal">Fiscal & NF-e</TabsTrigger>
          <TabsTrigger value="crediario">Crediário</TabsTrigger>
          <TabsTrigger value="cartao" className="flex items-center gap-1"><CreditCard className="w-3 h-3" />Taxas de Cartão</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
        </TabsList>

        <TabsContent value="empresa">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4" />Dados da Empresa</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Nome da Oficina *</Label>
                  <Input className="mt-1" value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="Oficina do João" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>CNPJ</Label>
                    <Input className="mt-1" value={form.cnpj || ''} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input className="mt-1" value={form.phone || ''} onChange={e => set('phone', e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input className="mt-1" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} />
                </div>
                <div>
                  <Label>Endereço</Label>
                  <Input className="mt-1" value={form.address || ''} onChange={e => set('address', e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <Label>Cidade</Label>
                    <Input className="mt-1" value={form.city || ''} onChange={e => set('city', e.target.value)} />
                  </div>
                  <div>
                    <Label>UF</Label>
                    <Input className="mt-1" value={form.state || ''} onChange={e => set('state', e.target.value)} maxLength={2} />
                  </div>
                </div>
                <div>
                  <Label>CEP</Label>
                  <Input className="mt-1" value={form.zip_code || ''} onChange={e => set('zip_code', e.target.value)} placeholder="00000-000" />
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSaveCompany} disabled={saving} className="w-full bg-red-600 hover:bg-red-700 text-white">
              <Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Salvar Dados da Empresa'}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="fiscal">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" />Configurações Fiscais</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Regime Tributário</Label>
                  <Select value={form.tax_regime || 'simples_nacional'} onValueChange={v => set('tax_regime', v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                      <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                      <SelectItem value="lucro_real">Lucro Real</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-3 py-2">
                  <Switch checked={form.nfe_enabled || false} onCheckedChange={v => set('nfe_enabled', v)} />
                  <div>
                    <Label>Módulo NF-e habilitado</Label>
                    <p className="text-xs text-gray-400">Ativar emissão de Nota Fiscal Eletrônica</p>
                  </div>
                </div>

                {form.nfe_enabled && (
                  <div className="space-y-3 p-3 bg-gray-50 rounded-lg border">
                    <div>
                      <Label>URL do Provedor NF-e</Label>
                      <Input className="mt-1" value={form.nfe_provider_url || ''} onChange={e => set('nfe_provider_url', e.target.value)} placeholder="https://api.provedor-nfe.com.br" />
                    </div>
                    <div>
                      <Label>Certificado Digital (Sprint 2)</Label>
                      <Input className="mt-1" disabled placeholder="Upload do certificado A1 (.pfx) — em breve" />
                      <p className="text-xs text-gray-400 mt-1">Integração com SEFAZ será configurada na Sprint 2</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Button onClick={handleSaveCompany} disabled={saving} className="w-full bg-red-600 hover:bg-red-700 text-white">
              <Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Salvar Configurações Fiscais'}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="crediario">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Condições de Crediário</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Taxa de Juros Padrão (%)</Label>
                  <Input className="mt-1" type="number" min="0" step="0.1"
                    value={form.default_interest_rate || 0} onChange={e => set('default_interest_rate', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <Label>Máximo de Parcelas</Label>
                  <Input className="mt-1" type="number" min="1" max="48"
                    value={form.max_installments || 12} onChange={e => set('max_installments', parseInt(e.target.value) || 12)} />
                </div>
              </div>
              <div>
                <Label>Condições de Crediário</Label>
                <Textarea className="mt-1" value={form.credit_conditions || ''} onChange={e => set('credit_conditions', e.target.value)}
                  placeholder="Descreva as condições gerais do crediário da oficina..." rows={3} />
              </div>
              <Button onClick={handleSaveCompany} disabled={saving} className="w-full bg-red-600 hover:bg-red-700 text-white">
                <Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cartao">
          <TaxasCartao />
        </TabsContent>

        <TabsContent value="usuarios">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" />Usuários do Sistema</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium text-sm">{u.full_name || u.email}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-600 capitalize">{u.role}</span>
                  </div>
                ))}
                {users.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Nenhum usuário encontrado</p>}
              </div>
              <p className="text-xs text-gray-400 mt-4">Para convidar novos usuários, utilize o painel administrativo do Base44.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}