// Painel do provedor — sistema fechado.
//
// Aqui o super-admin provisiona as oficinas: cria a empresa, o acesso com
// senha temporária e a licença já ativa, numa operação só. O lojista não
// digita chave nenhuma; recebe e-mail e senha e entra.
//
// A criação do usuário roda no servidor (/api/provisionarEmpresa), porque
// exige a chave service_role, que ignora a RLS e não pode ir ao navegador.

import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isSuperAdmin, durationLabel, DURATION_OPTIONS, isExpired, daysRemaining } from '@/lib/license';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  ShieldCheck, Building2, Plus, Copy, Loader2, Mail, Calendar, Store,
  Ban, Pencil, KeyRound, RefreshCw, CheckCircle2, AlertTriangle,
} from 'lucide-react';

export default function AdminChaves() {
  const { user, isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const [empresas, setEmpresas] = useState([]);
  const [licencas, setLicencas] = useState([]);
  const [carregando, setCarregando] = useState(true);

  // Formulário de provisionamento
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [duracao, setDuracao] = useState('');
  const [plano, setPlano] = useState('non_fiscal');
  const [limiteNotas, setLimiteNotas] = useState('100');
  const [provisionando, setProvisionando] = useState(false);

  // Credencial recém-criada — exibida UMA vez.
  const [credencial, setCredencial] = useState(null);

  const superAdmin = isSuperAdmin(user);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [emps, lics] = await Promise.all([
        base44.entities.Company.list('name'),
        base44.entities.AccessKey.list('-created_date'),
      ]);
      setEmpresas(emps);
      setLicencas(lics);
    } catch (e) {
      toast({ title: 'Erro ao carregar', description: e.message, variant: 'destructive' });
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => { if (superAdmin) carregar(); }, [superAdmin, carregar]);

  if (isLoadingAuth) return null;
  if (!superAdmin) return <Navigate to="/" replace />;

  const provisionar = async () => {
    if (!nome.trim()) { toast({ title: 'Informe o nome da oficina', variant: 'destructive' }); return; }
    if (!email.trim()) { toast({ title: 'Informe o e-mail de acesso', variant: 'destructive' }); return; }
    if (!duracao) { toast({ title: 'Selecione o tempo de uso', variant: 'destructive' }); return; }

    setProvisionando(true);
    setCredencial(null);
    try {
      const { data } = await base44.functions.invoke('provisionarEmpresa', {
        nome_empresa: nome.trim(),
        email: email.trim(),
        duracao_dias: Number(duracao),
        plano,
        limite_notas: plano === 'fiscal' ? Number(limiteNotas) || 100 : undefined,
      });
      setCredencial(data);
      setNome(''); setEmail(''); setDuracao(''); setPlano('non_fiscal'); setLimiteNotas('100');
      toast({ title: 'Oficina provisionada!', description: 'Envie o acesso ao cliente.' });
      carregar();
    } catch (e) {
      toast({ title: 'Não foi possível provisionar', description: e.message, variant: 'destructive' });
    } finally {
      setProvisionando(false);
    }
  };

  const copiar = (texto, titulo) => {
    navigator.clipboard?.writeText(texto);
    toast({ title: titulo });
  };

  const licencaDa = (empresaId) => licencas.find(l => l.company_id === empresaId) || null;

  const selo = (lic) => {
    if (!lic) return <Badge className="bg-gray-200 text-gray-600 hover:bg-gray-200">Sem licença</Badge>;
    if (lic.status === 'revoked') return <Badge className="bg-gray-200 text-gray-600 hover:bg-gray-200">Revogada</Badge>;
    if (lic.status === 'expired' || isExpired(lic.expires_at)) {
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Vencida</Badge>;
    }
    const dias = daysRemaining(lic.expires_at);
    return (
      <Badge className={cn('hover:bg-green-100', dias <= 5
        ? 'bg-orange-100 text-orange-700 hover:bg-orange-100' : 'bg-green-100 text-green-700')}>
        {dias}d restantes
      </Badge>
    );
  };

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 bg-red-600 rounded-xl flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Provedor</h1>
          <p className="text-gray-500 text-sm">Cadastro e gestão das oficinas clientes</p>
        </div>
      </div>

      {/* Credencial recém-criada — some ao sair da tela */}
      {credencial && (
        <Card className="mb-6 border-green-300 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-green-900">
                  {credencial.empresa?.nome} foi criada — envie este acesso ao cliente
                </p>

                <div className="mt-3 grid sm:grid-cols-2 gap-3">
                  <div className="bg-white border rounded-lg p-3">
                    <p className="text-xs text-gray-500">E-mail</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="font-mono text-sm truncate">{credencial.acesso?.email}</code>
                      <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0"
                        onClick={() => copiar(credencial.acesso.email, 'E-mail copiado')}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="bg-white border rounded-lg p-3">
                    <p className="text-xs text-gray-500">Senha temporária</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="font-mono text-sm font-bold">{credencial.acesso?.senha_temporaria}</code>
                      <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0"
                        onClick={() => copiar(credencial.acesso.senha_temporaria, 'Senha copiada')}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Anote agora.</strong> A senha não será exibida de novo — ela não fica
                    guardada em lugar nenhum. O lojista será obrigado a trocá-la no primeiro acesso.
                  </span>
                </div>

                <Button size="sm" variant="outline" className="mt-3"
                  onClick={() => copiar(
                    `Acesso ao GiroPeças\nE-mail: ${credencial.acesso.email}\nSenha temporária: ${credencial.acesso.senha_temporaria}\n\nNo primeiro acesso você definirá sua própria senha.`,
                    'Mensagem copiada — cole no WhatsApp ou e-mail')}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" />Copiar mensagem pronta
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Provisionar */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" />Cadastrar Nova Oficina
          </CardTitle>
          <p className="text-xs text-gray-500">
            O sistema cria o acesso e a licença. O cliente não digita código nenhum.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da Oficina *</Label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input className="pl-9" placeholder="Ex: Oficina do João" value={nome}
                  onChange={e => setNome(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>E-mail de acesso *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input className="pl-9" type="email" placeholder="oficina@email.com" value={email}
                  onChange={e => setEmail(e.target.value)} />
              </div>
              <p className="text-xs text-gray-400">Será o login do lojista.</p>
            </div>
            <div className="space-y-2">
              <Label>Tempo de uso *</Label>
              <Select value={duracao} onValueChange={setDuracao}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map(o => (
                    <SelectItem key={o.days} value={String(o.days)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">Ao vencer, o acesso é bloqueado até você renovar.</p>
            </div>
            <div className="space-y-2">
              <Label>Plano *</Label>
              <Select value={plano} onValueChange={setPlano}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="non_fiscal">Não-Fiscal (sem emissão de NF)</SelectItem>
                  <SelectItem value="fiscal">Fiscal (emite nota)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {plano === 'fiscal' && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Limite de notas por mês</Label>
                <Input type="number" min="0" value={limiteNotas}
                  onChange={e => setLimiteNotas(e.target.value)} placeholder="100" />
              </div>
            )}
          </div>

          <Button onClick={provisionar} disabled={provisionando}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white">
            {provisionando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            {provisionando ? 'Criando...' : 'Criar Oficina e Acesso'}
          </Button>
        </CardContent>
      </Card>

      {/* Oficinas */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" />Oficinas Cadastradas
          </CardTitle>
          <span className="text-sm text-gray-400">{empresas.length} total</span>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <div className="py-10 text-center text-gray-400 text-sm">Carregando...</div>
          ) : empresas.length === 0 ? (
            <div className="py-10 text-center">
              <Building2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Nenhuma oficina cadastrada ainda.</p>
              <p className="text-gray-400 text-xs mt-1">Use o formulário acima para criar a primeira.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {empresas.map(emp => (
                <OficinaLinha key={emp.id} empresa={emp} licenca={licencaDa(emp.id)}
                  selo={selo} toast={toast} onSaved={carregar} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OficinaLinha({ empresa, licenca, selo, toast, onSaved }) {
  const [editando, setEditando] = useState(false);

  return (
    <div className="border rounded-lg p-3 bg-gray-50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{empresa.name}</span>
            {selo(licenca)}
            {licenca && (
              <Badge className={licenca.plan_type === 'fiscal'
                ? 'bg-purple-100 text-purple-700 hover:bg-purple-100'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-100'}>
                {licenca.plan_type === 'fiscal' ? 'Fiscal' : 'Não-Fiscal'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-1.5 text-xs text-gray-500">
            {empresa.email && (
              <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{empresa.email}</span>
            )}
            {licenca?.expires_at && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Vence: {new Date(licenca.expires_at).toLocaleDateString('pt-BR')}
              </span>
            )}
            {licenca?.plan_type === 'fiscal' && (
              <span className="flex items-center gap-1">
                <KeyRound className="w-3 h-3" />{licenca.fiscal_note_limit || 100} notas/mês
              </span>
            )}
          </div>

          {editando && licenca && (
            <GerenciarLicenca licenca={licenca} toast={toast}
              onSaved={() => { setEditando(false); onSaved(); }}
              onCancel={() => setEditando(false)} />
          )}
        </div>

        {licenca && !editando && (
          <Button size="sm" variant="outline" className="flex-shrink-0"
            onClick={() => setEditando(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" />Gerenciar
          </Button>
        )}
      </div>
    </div>
  );
}

// Renovação, mudança de plano/limite e bloqueio — tudo sob controle do provedor.
function GerenciarLicenca({ licenca, toast, onSaved, onCancel }) {
  const [plano, setPlano] = useState(licenca.plan_type || 'non_fiscal');
  const [limite, setLimite] = useState(String(licenca.fiscal_note_limit ?? 100));
  const [renovar, setRenovar] = useState('');
  const [salvando, setSalvando] = useState(false);

  const vencida = licenca.status === 'expired' || isExpired(licenca.expires_at);

  const salvar = async () => {
    setSalvando(true);
    try {
      const patch = {
        plan_type: plano,
        fiscal_note_limit: plano === 'fiscal' ? Math.max(0, parseInt(limite, 10) || 100) : null,
      };

      // Renovar: conta a partir de hoje se já venceu, ou soma ao prazo atual.
      if (renovar) {
        const dias = Number(renovar);
        const base = vencida ? Date.now() : new Date(licenca.expires_at).getTime();
        patch.expires_at = new Date(base + dias * 86400000).toISOString();
        patch.status = 'active';
        patch.duration_days = dias;
      }

      await base44.entities.AccessKey.update(licenca.id, patch);
      toast({
        title: renovar ? 'Licença renovada' : 'Licença atualizada',
        description: renovar ? 'O acesso da oficina foi liberado.' : undefined,
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao atualizar', description: e.message, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const bloquear = async () => {
    if (!window.confirm(`Bloquear o acesso de "${licenca.client_name || 'esta oficina'}"? Os dados são preservados.`)) return;
    try {
      await base44.entities.AccessKey.update(licenca.id, { status: 'revoked' });
      toast({ title: 'Acesso bloqueado' });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao bloquear', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="mt-3 p-3 bg-white border rounded-lg space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Plano</Label>
          <Select value={plano} onValueChange={setPlano}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="non_fiscal">Não-Fiscal</SelectItem>
              <SelectItem value="fiscal">Fiscal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {plano === 'fiscal' && (
          <div className="space-y-1">
            <Label className="text-xs">Notas/mês</Label>
            <Input type="number" min="0" value={limite}
              onChange={e => setLimite(e.target.value)} className="h-8 w-24 text-xs" />
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">{vencida ? 'Renovar por' : 'Estender'}</Label>
          <Select value={renovar} onValueChange={setRenovar}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="não renovar" />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map(o => (
                <SelectItem key={o.days} value={String(o.days)}>{durationLabel(o.days)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {renovar && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          {vencida
            ? `Nova validade contada a partir de hoje (${durationLabel(Number(renovar))}).`
            : `Soma ${durationLabel(Number(renovar))} ao prazo atual.`}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1 border-t">
        <Button size="sm" className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
          disabled={salvando} onClick={salvar}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onCancel}>Cancelar</Button>
        {licenca.status !== 'revoked' && (
          <Button size="sm" variant="ghost" className="h-8 text-xs text-orange-600 ml-auto"
            onClick={bloquear}>
            <Ban className="w-3.5 h-3.5 mr-1" />Bloquear acesso
          </Button>
        )}
      </div>
    </div>
  );
}
