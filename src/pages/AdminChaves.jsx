import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import {
  isSuperAdmin, generateKey, durationLabel, DURATION_OPTIONS, isExpired, daysRemaining,
} from '@/lib/license';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  ShieldCheck, KeyRound, Plus, Copy, Trash2, Loader2, Mail, Calendar, Store, User, Ban,
} from 'lucide-react';

export default function AdminChaves() {
  const { user, isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [duration, setDuration] = useState('');
  const [planType, setPlanType] = useState('non_fiscal');
  const [lastCreated, setLastCreated] = useState(null);

  const superAdmin = isSuperAdmin(user);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.AccessKey.list('-created_date');
      setKeys(data);
    } catch (e) {
      toast({ title: 'Erro ao carregar licenças', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (superAdmin) loadKeys();
  }, [superAdmin, loadKeys]);

  if (isLoadingAuth) return null;
  if (!superAdmin) return <Navigate to="/" replace />;

  const handleCreate = async () => {
    if (!clientName.trim()) {
      toast({ title: 'Informe o nome da loja/cliente', variant: 'destructive' });
      return;
    }
    if (!duration) {
      toast({ title: 'Selecione a duração da licença', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const { key, expiresAt } = generateKey(Number(duration));
      const record = await base44.entities.AccessKey.create({
        key,
        duration_days: Number(duration),
        status: 'available',
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || undefined,
        plan_type: planType,
        expires_at: expiresAt.toISOString(),
      });
      setLastCreated(record);
      setClientName('');
      setClientEmail('');
      setDuration('');
      setPlanType('non_fiscal');
      toast({ title: 'Licença gerada!', description: `${key} — envie ao cliente para liberar o acesso.` });
      loadKeys();
    } catch (e) {
      toast({ title: 'Erro ao gerar licença', description: e.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const copyKey = (key) => {
    navigator.clipboard.writeText(key);
    toast({ title: 'Chave copiada!', description: key });
  };

  const revokeKey = async (record) => {
    if (!window.confirm(`Revogar a licença de "${record.client_name || record.key}"? O acesso será bloqueado.`)) return;
    try {
      await base44.entities.AccessKey.update(record.id, { status: 'revoked' });
      toast({ title: 'Licença revogada' });
      loadKeys();
    } catch (e) {
      toast({ title: 'Erro ao revogar', description: e.message, variant: 'destructive' });
    }
  };

  const deleteKey = async (record) => {
    if (!window.confirm(`Excluir a licença de "${record.client_name || record.key}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await base44.entities.AccessKey.delete(record.id);
      toast({ title: 'Licença excluída' });
      loadKeys();
    } catch (e) {
      toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' });
    }
  };

  const keyBadge = (k) => {
    if (k.status === 'revoked') return <Badge className="bg-gray-200 text-gray-600 hover:bg-gray-200">Revogada</Badge>;
    if (k.status === 'expired' || isExpired(k.expires_at)) return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Expirada</Badge>;
    const days = daysRemaining(k.expires_at);
    return (
      <Badge className={cn('hover:bg-green-100', days <= 5 ? 'bg-orange-100 text-orange-700 hover:bg-orange-100' : 'bg-green-100 text-green-700')}>
        {days}d restantes
      </Badge>
    );
  };

  const isDead = (k) => k.status === 'revoked' || k.status === 'expired' || isExpired(k.expires_at);

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 bg-red-600 rounded-xl flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Provedor</h1>
          <p className="text-gray-500 text-sm">Geração e gestão de licenças para clientes</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4" />Gerar Nova Licença
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da Loja / Cliente *</Label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input className="pl-9" placeholder="Ex: Oficina do João" value={clientName}
                  onChange={e => setClientName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>E-mail do Cliente (opcional)</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input className="pl-9" type="email" placeholder="cliente@email.com" value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Duração da Licença *</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue placeholder="Selecione a duração..." /></SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map(o => (
                    <SelectItem key={o.days} value={String(o.days)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plano *</Label>
              <Select value={planType} onValueChange={setPlanType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="non_fiscal">Não-Fiscal (sem emissão de NF)</SelectItem>
                  <SelectItem value="fiscal">Fiscal (emite NFC-e/NF-e — até 100 notas/mês)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleCreate} disabled={creating} className="mt-4 bg-red-600 hover:bg-red-700 text-white">
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Gerar Licença
          </Button>

          {lastCreated && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800 mb-2">
                Licença gerada para <b>{lastCreated.client_name}</b> — envie a chave ao cliente:
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="font-mono text-base bg-white px-3 py-1.5 rounded border border-green-200">{lastCreated.key}</code>
                <Button size="sm" variant="outline" className="border-green-300 text-green-700" onClick={() => copyKey(lastCreated.key)}>
                  <Copy className="w-4 h-4 mr-1" />Copiar
                </Button>
                <span className="text-xs text-green-700">
                  {durationLabel(lastCreated.duration_days)} • vence em {new Date(lastCreated.expires_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" />Licenças Emitidas
          </CardTitle>
          <span className="text-sm text-gray-400">{keys.length} total</span>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-400">Carregando...</div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-gray-400">Nenhuma licença emitida ainda.</div>
          ) : (
            <div className="space-y-2">
              {keys.map(k => (
                <div key={k.id} className={cn(
                  'flex items-start justify-between gap-3 p-3.5 rounded-lg border',
                  isDead(k) ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                )}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{k.client_name || 'Sem nome'}</span>
                      {keyBadge(k)}
                      <Badge className={k.plan_type === 'fiscal'
                        ? 'bg-purple-100 text-purple-700 hover:bg-purple-100'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-100'}>
                        {k.plan_type === 'fiscal' ? 'Fiscal' : 'Não-Fiscal'}
                      </Badge>
                      <span className="text-xs text-gray-500">{durationLabel(k.duration_days)}</span>
                    </div>
                    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-1.5 text-xs text-gray-500">
                      <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">{k.key}</code>
                      {k.client_email && (
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{k.client_email}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />Vence: {k.expires_at ? new Date(k.expires_at).toLocaleDateString('pt-BR') : '—'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />Gerada: {k.created_date ? new Date(k.created_date).toLocaleDateString('pt-BR') : '—'}
                      </span>
                      {k.activated_by && (
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />Ativada por: {k.activated_by}</span>
                      )}
                    </div>
                    {k.plan_type === 'fiscal' && k.company_id && (
                      <NoteLimitControl companyId={k.company_id} toast={toast} />
                    )}
                  </div>
                  <div className="flex items-center flex-shrink-0">
                    <Button variant="ghost" size="icon" title="Copiar chave" onClick={() => copyKey(k.key)}>
                      <Copy className="w-4 h-4 text-gray-500" />
                    </Button>
                    {!isDead(k) && (
                      <Button variant="ghost" size="icon" title="Revogar (bloqueia o acesso)" onClick={() => revokeKey(k)}>
                        <Ban className="w-4 h-4 text-orange-600" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" title="Excluir" onClick={() => deleteKey(k)}>
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Controle do limite mensal de notas de uma empresa fiscal (usado pelo suporte
// para "negociar" mais notas quando o cliente estoura o teto do plano).
function NoteLimitControl({ companyId, toast }) {
  const [limit, setLimit] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    base44.entities.Company.get(companyId)
      .then(c => { if (active) { setLimit(String(c?.fiscal_note_limit ?? 100)); setLoaded(true); } })
      .catch(() => { if (active) { setLimit('100'); setLoaded(true); } });
    return () => { active = false; };
  }, [companyId]);

  const save = async () => {
    const value = Math.max(0, parseInt(limit, 10) || 0);
    setSaving(true);
    try {
      await base44.entities.Company.update(companyId, { fiscal_note_limit: value });
      toast({ title: 'Limite atualizado', description: `${value} notas/mês liberadas para esta empresa.` });
    } catch (e) {
      toast({ title: 'Erro ao atualizar limite', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-xs text-gray-500">Limite de notas/mês:</span>
      <Input type="number" min="0" value={limit} onChange={e => setLimit(e.target.value)} className="h-7 w-24 text-xs" />
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saving} onClick={save}>Salvar</Button>
    </div>
  );
}
