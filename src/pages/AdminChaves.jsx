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
  ShieldCheck, KeyRound, Plus, Copy, Trash2, Loader2, Mail, Calendar, Store, User, Ban, Pencil,
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
  const [noteLimit, setNoteLimit] = useState('100');
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
        fiscal_note_limit: planType === 'fiscal' ? (Math.max(0, parseInt(noteLimit, 10) || 100)) : undefined,
        expires_at: expiresAt.toISOString(),
      });
      setLastCreated(record);
      setClientName('');
      setClientEmail('');
      setDuration('');
      setPlanType('non_fiscal');
      setNoteLimit('100');
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
                  <SelectItem value="fiscal">Fiscal (emite NFC-e/NF-e)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {planType === 'fiscal' && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Limite de notas por mês</Label>
                <Input type="number" min="0" value={noteLimit} onChange={e => setNoteLimit(e.target.value)} placeholder="100" />
                <p className="text-xs text-gray-400">
                  Notas incluídas no plano da empresa. Padrão 100. Você pode alterar depois, a qualquer momento, nas licenças abaixo.
                </p>
              </div>
            )}
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
                    {!isDead(k) && (
                      <LicenseManageControl licenseKey={k} toast={toast} onSaved={loadKeys} />
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

// Gerenciamento da empresa por licença: o super-admin pode, a qualquer momento,
// alternar o plano (Fiscal / Não-Fiscal) e ajustar o limite de notas/mês.
// A alteração vale na chave e também na empresa já vinculada (efeito imediato).
function LicenseManageControl({ licenseKey, toast, onSaved }) {
  const k = licenseKey;
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState(k.plan_type || 'non_fiscal');
  const [limit, setLimit] = useState(String(k.fiscal_note_limit ?? 100));
  const [saving, setSaving] = useState(false);

  const dirty = plan !== (k.plan_type || 'non_fiscal') ||
    (plan === 'fiscal' && Number(limit) !== Number(k.fiscal_note_limit ?? 100));

  const save = async () => {
    setSaving(true);
    try {
      const noteLimit = Math.max(0, parseInt(limit, 10) || 0);
      // 1) Atualiza a chave (fonte da permissão)
      await base44.entities.AccessKey.update(k.id, {
        plan_type: plan,
        fiscal_note_limit: plan === 'fiscal' ? noteLimit : undefined,
      });
      // 2) Se a empresa já ativou a chave, aplica na empresa (efeito imediato)
      if (k.company_id) {
        const patch = { plan_type: plan };
        if (plan === 'fiscal') { patch.fiscal_note_limit = noteLimit; patch.nfe_enabled = true; }
        else { patch.nfe_enabled = false; }
        try { await base44.entities.Company.update(k.company_id, patch); } catch { /* empresa pode não existir ainda */ }
      }
      toast({ title: 'Licença atualizada', description: plan === 'fiscal' ? `Plano Fiscal • ${noteLimit} notas/mês.` : 'Plano Não-Fiscal.' });
      setOpen(false);
      onSaved?.();
    } catch (e) {
      toast({ title: 'Erro ao atualizar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800">
        <Pencil className="w-3 h-3" />Gerenciar plano e limite
      </button>
    );
  }

  return (
    <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Plano</Label>
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="non_fiscal">Não-Fiscal</SelectItem>
            <SelectItem value="fiscal">Fiscal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {plan === 'fiscal' && (
        <div className="space-y-1">
          <Label className="text-xs">Limite de notas/mês</Label>
          <Input type="number" min="0" value={limit} onChange={e => setLimit(e.target.value)} className="h-8 w-28 text-xs" />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white" disabled={saving || !dirty} onClick={save}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setOpen(false); setPlan(k.plan_type || 'non_fiscal'); setLimit(String(k.fiscal_note_limit ?? 100)); }}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
