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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { KeyRound, Plus, Copy, Ban, Trash2, Loader2 } from 'lucide-react';

const STATUS_BADGE = {
  available: { label: 'Disponível', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  active: { label: 'Ativa', className: 'bg-green-100 text-green-700 hover:bg-green-100' },
  expired: { label: 'Expirada', className: 'bg-gray-200 text-gray-600 hover:bg-gray-200' },
  revoked: { label: 'Revogada', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
};

export default function AdminChaves() {
  const { user, isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [duration, setDuration] = useState('30');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [lastCreated, setLastCreated] = useState([]);

  const superAdmin = isSuperAdmin(user);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.AccessKey.list('-created_date');
      setKeys(data);
    } catch (e) {
      toast({ title: 'Erro ao carregar chaves', description: e.message, variant: 'destructive' });
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
    const qty = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), 20);
    setCreating(true);
    try {
      const created = [];
      for (let i = 0; i < qty; i++) {
        const key = generateKey(Number(duration));
        const record = await base44.entities.AccessKey.create({
          key,
          duration_days: Number(duration),
          status: 'available',
          notes: notes.trim() || undefined,
        });
        created.push(record);
      }
      setLastCreated(created);
      setNotes('');
      toast({ title: qty === 1 ? 'Chave criada!' : `${qty} chaves criadas!` });
      loadKeys();
    } catch (e) {
      toast({ title: 'Erro ao criar chave', description: e.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const copyKey = (key) => {
    navigator.clipboard.writeText(key);
    toast({ title: 'Chave copiada!', description: key });
  };

  const revokeKey = async (record) => {
    try {
      await base44.entities.AccessKey.update(record.id, { status: 'revoked' });
      toast({ title: 'Chave revogada' });
      loadKeys();
    } catch (e) {
      toast({ title: 'Erro ao revogar', description: e.message, variant: 'destructive' });
    }
  };

  const deleteKey = async (record) => {
    try {
      await base44.entities.AccessKey.delete(record.id);
      toast({ title: 'Chave excluída' });
      loadKeys();
    } catch (e) {
      toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' });
    }
  };

  const expiryInfo = (k) => {
    if (!k.expires_at) return '—';
    const d = new Date(k.expires_at);
    const dateStr = d.toLocaleDateString('pt-BR');
    if (k.status === 'active' && !isExpired(k.expires_at)) {
      return `${dateStr} (${daysRemaining(k.expires_at)}d restantes)`;
    }
    return dateStr;
  };

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
          <KeyRound className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chaves de Acesso</h1>
          <p className="text-gray-500 text-sm">Crie e gerencie as licenças do sistema (exclusivo do super-admin)</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Criar novas chaves</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label>Duração</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map(o => (
                    <SelectItem key={o.days} value={String(o.days)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input type="number" min="1" max="20" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Input placeholder="Ex: cliente Oficina XYZ" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <Button onClick={handleCreate} disabled={creating} className="bg-red-600 hover:bg-red-700 text-white">
              {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Gerar chave
            </Button>
          </div>

          {lastCreated.length > 0 && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800 mb-2">Chaves geradas — copie e envie ao cliente:</p>
              <div className="space-y-1">
                {lastCreated.map(k => (
                  <div key={k.id} className="flex items-center gap-2">
                    <code className="font-mono text-sm bg-white px-2 py-1 rounded border border-green-200">{k.key}</code>
                    <span className="text-xs text-green-700">{durationLabel(k.duration_days)}</span>
                    <button onClick={() => copyKey(k.key)} className="text-green-700 hover:text-green-900">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Todas as chaves ({keys.length})</CardTitle></CardHeader>
        <CardContent className="px-0 sm:px-6">
          {loading ? (
            <div className="text-center py-8 text-gray-400">Carregando...</div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-gray-400">Nenhuma chave criada ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chave</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ativada por</TableHead>
                    <TableHead>Expira em</TableHead>
                    <TableHead>Obs.</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map(k => {
                    const badge = STATUS_BADGE[k.status] || STATUS_BADGE.available;
                    return (
                      <TableRow key={k.id}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{k.key}</TableCell>
                        <TableCell className="whitespace-nowrap">{durationLabel(k.duration_days)}</TableCell>
                        <TableCell><Badge className={badge.className}>{badge.label}</Badge></TableCell>
                        <TableCell className="text-sm">{k.activated_by || '—'}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{expiryInfo(k)}</TableCell>
                        <TableCell className="text-sm max-w-[160px] truncate">{k.notes || '—'}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" title="Copiar" onClick={() => copyKey(k.key)}>
                            <Copy className="w-4 h-4" />
                          </Button>
                          {k.status !== 'revoked' && (
                            <Button variant="ghost" size="icon" title="Revogar" onClick={() => revokeKey(k)}>
                              <Ban className="w-4 h-4 text-orange-600" />
                            </Button>
                          )}
                          {k.status !== 'active' && (
                            <Button variant="ghost" size="icon" title="Excluir" onClick={() => deleteKey(k)}>
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
