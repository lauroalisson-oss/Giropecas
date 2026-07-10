import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { useLicense } from '@/lib/LicenseContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Users, FileText, CreditCard, Save, ShieldCheck, Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import TaxasCartao from './TaxasCartao';
import { useToast } from '@/components/ui/use-toast';
import { cadastrarEmpresaFiscal } from '@/lib/fiscal';

// Upload do certificado A1 + cadastro automático da empresa no provedor fiscal.
// A oficina resolve tudo aqui: o certificado vai direto para o gateway.
function CertificadoCard({ company, setCompany }) {
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [senha, setSenha] = useState('');
  const [sending, setSending] = useState(false);

  const handleUpload = async () => {
    if (!file) { toast({ title: 'Selecione o arquivo do certificado (.pfx)', variant: 'destructive' }); return; }
    if (!senha) { toast({ title: 'Informe a senha do certificado', variant: 'destructive' }); return; }
    setSending(true);
    try {
      const result = await cadastrarEmpresaFiscal({ companyId: company.id, certificado: file, senha });
      setCompany({ ...company, ...(result?.company || {}), fiscal_registered: true, fiscal_cert_expires_at: result?.cert_expires_at || company.fiscal_cert_expires_at });
      setFile(null); setSenha('');
      toast({ title: 'Empresa cadastrada no provedor!', description: 'Certificado enviado com sucesso. Já é possível emitir notas.' });
    } catch (e) {
      toast({ title: 'Erro ao cadastrar certificado', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const vencProximo = company.fiscal_cert_expires_at &&
    (new Date(company.fiscal_cert_expires_at).getTime() - Date.now()) < 30 * 86400000;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Certificado Digital A1</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {company.fiscal_registered ? (
          <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-green-800">Empresa cadastrada no provedor fiscal</p>
              {company.fiscal_cert_expires_at && (
                <p className={vencProximo ? 'text-red-600 mt-0.5' : 'text-green-700 mt-0.5'}>
                  Certificado válido até {new Date(company.fiscal_cert_expires_at).toLocaleDateString('pt-BR')}
                  {vencProximo && ' — renove em breve'}
                </p>
              )}
              <p className="text-green-700 mt-0.5">Envie um novo arquivo abaixo apenas para renovar/substituir o certificado.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Envie o certificado digital <strong>A1 (.pfx)</strong> da empresa para habilitar a emissão.
              O arquivo vai direto para o provedor fiscal e <strong>não fica salvo</strong> no sistema.
            </p>
          </div>
        )}

        <div>
          <Label>Arquivo do certificado (.pfx)</Label>
          <div className="mt-1 flex items-center gap-2">
            <label className="flex-1">
              <div className="flex items-center gap-2 px-3 h-10 border rounded-md cursor-pointer hover:bg-gray-50 text-sm text-gray-600">
                <Upload className="w-4 h-4" />
                <span className="truncate">{file ? file.name : 'Selecionar arquivo .pfx'}</span>
              </div>
              <input type="file" accept=".pfx,.p12" className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>
        <div>
          <Label>Senha do certificado</Label>
          <Input type="password" className="mt-1" value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••" autoComplete="off" />
        </div>

        <Button onClick={handleUpload} disabled={sending} className="w-full bg-red-600 hover:bg-red-700 text-white">
          {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
          {sending ? 'Enviando ao provedor...' : (company.fiscal_registered ? 'Atualizar certificado' : 'Cadastrar empresa no provedor')}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Configuracoes() {
  const { company, setCompany } = useCompany();
  const { isFiscal, noteLimit } = useLicense();
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

  const maskPhone = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
    return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
  };
  const maskCnpj = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 14);
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5').replace(/[./-]+$/, '');
  };
  const maskCep = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 8);
    return d.replace(/(\d{5})(\d{0,3})/, '$1-$2').replace(/-$/, '');
  };
  const isFiscalPlan = isFiscal; // plano vem da licença ativa

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
                    <Input className="mt-1" value={form.cnpj || ''} onChange={e => set('cnpj', maskCnpj(e.target.value))} placeholder="00.000.000/0000-00" maxLength={18} />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input className="mt-1" value={form.phone || ''} onChange={e => set('phone', maskPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} />
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
                  <Input className="mt-1" value={form.zip_code || ''} onChange={e => set('zip_code', maskCep(e.target.value))} placeholder="00000-000" maxLength={9} />
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

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Inscrição Estadual (IE)</Label>
                    <Input className="mt-1" value={form.ie || ''} onChange={e => set('ie', e.target.value)} placeholder="Isento ou nº da IE" />
                  </div>
                  <div>
                    <Label>Inscrição Municipal (IM)</Label>
                    <Input className="mt-1" value={form.im || ''} onChange={e => set('im', e.target.value)} placeholder="opcional" />
                  </div>
                </div>

                {!isFiscalPlan && (
                  <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <FileText className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-700">
                      Sua empresa está no plano <strong>Não-Fiscal</strong>. A emissão de NFC-e/NF-e não está incluída.
                      Para habilitar, contrate o <strong>plano Fiscal</strong> com o suporte.
                    </p>
                  </div>
                )}

                {isFiscalPlan && (
                  <div className="flex items-center justify-between gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <div>
                        <Label className="text-green-800">Plano Fiscal liberado pelo provedor</Label>
                        <p className="text-xs text-green-700">Emissão de NFC-e/NF-e habilitada • até {Number.isFinite(noteLimit) ? noteLimit : (company?.fiscal_note_limit || 100)} notas/mês</p>
                      </div>
                    </div>
                  </div>
                )}

                {isFiscalPlan && (
                  <div className="space-y-4 p-3 bg-gray-50 rounded-lg border">
                    <div>
                      <Label>Ambiente da SEFAZ</Label>
                      <Select value={form.nfe_environment || 'homologacao'} onValueChange={v => set('nfe_environment', v)}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="homologacao">Homologação (teste — sem valor fiscal)</SelectItem>
                          <SelectItem value="producao">Produção (nota real)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-400 mt-1">
                        Comece sempre em <strong>Homologação</strong> para testar. Só mude para Produção
                        depois que o contador validar os impostos.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Série NFC-e</Label>
                        <Input className="mt-1" value={form.nfce_series || '1'} onChange={e => set('nfce_series', e.target.value)} />
                      </div>
                      <div>
                        <Label>Série NF-e</Label>
                        <Input className="mt-1" value={form.nfe_series || '1'} onChange={e => set('nfe_series', e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>CSC (NFC-e)</Label>
                        <Input className="mt-1" value={form.csc || ''} onChange={e => set('csc', e.target.value)} placeholder="Código gerado na SEFAZ" />
                      </div>
                      <div>
                        <Label>ID do CSC</Label>
                        <Input className="mt-1" value={form.csc_id || ''} onChange={e => set('csc_id', e.target.value)} placeholder="ex: 000001" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">
                      O CSC é gerado gratuitamente no portal da SEFAZ do seu estado (necessário só para NFC-e).
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Button onClick={handleSaveCompany} disabled={saving} className="w-full bg-red-600 hover:bg-red-700 text-white">
              <Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Salvar Configurações Fiscais'}
            </Button>

            {isFiscalPlan && company?.id && (
              <CertificadoCard company={company} setCompany={setCompany} />
            )}
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