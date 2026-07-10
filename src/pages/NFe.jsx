import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { useLicense } from '@/lib/LicenseContext';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import { consultarNota, notesThisMonth, NFE_STATUS_LABEL, NFE_STATUS_COLOR } from '@/lib/fiscal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, AlertCircle, CheckCircle, Clock, Info, RefreshCw, Gauge } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export default function NFe() {
  const { company } = useCompany();
  const { isFiscal, noteLimit: planNoteLimit } = useLicense();
  const { toast } = useToast();
  const [nfes, setNfes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(null);

  useEffect(() => { if (company?.id) loadNFes(); }, [company]);

  const loadNFes = async () => {
    setLoading(true);
    const data = await base44.entities.NFeRecord.filter({ company_id: company.id }, '-created_date');
    setNfes(data);
    setLoading(false);
  };

  const handleCheck = async (nfeId) => {
    setChecking(nfeId);
    try {
      const result = await consultarNota(nfeId);
      toast({ title: `Status: ${NFE_STATUS_LABEL[result.status] || result.status}` });
      loadNFes();
    } catch (e) {
      toast({ title: 'Erro ao consultar', description: e.message, variant: 'destructive' });
    } finally {
      setChecking(null);
    }
  };

  const nfeStatusColor = (status) => NFE_STATUS_COLOR[status] || 'bg-gray-100 text-gray-700';
  const nfeStatusLabel = (status) => NFE_STATUS_LABEL[status] || status;

  const isFiscalPlan = isFiscal;
  const noteLimit = Number.isFinite(planNoteLimit) ? planNoteLimit : (company?.fiscal_note_limit || 100);
  const usedThisMonth = notesThisMonth(nfes);
  const limitReached = usedThisMonth >= noteLimit;
  const nearLimit = usedThisMonth >= noteLimit * 0.9;

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">NF-e</h1>
        <p className="text-gray-500 text-sm">Notas Fiscais Eletrônicas</p>
      </div>

      {/* Plano Não-Fiscal */}
      {!isFiscalPlan && (
        <Card className="mb-6 border-slate-200 bg-slate-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-800">Plano Não-Fiscal</p>
                <p className="text-sm text-slate-600 mt-1">
                  Sua empresa está no plano <strong>Não-Fiscal</strong>, que não inclui emissão de notas.
                  Para emitir NFC-e/NF-e, contrate o <strong>plano Fiscal</strong> com o suporte.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Medidor de notas do mês (plano fiscal) */}
      {isFiscalPlan && (
        <Card className={cn('mb-6', limitReached ? 'border-red-200 bg-red-50' : nearLimit ? 'border-orange-200 bg-orange-50' : 'border-gray-200')}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Gauge className={cn('w-5 h-5 mt-0.5 flex-shrink-0', limitReached ? 'text-red-600' : nearLimit ? 'text-orange-600' : 'text-gray-500')} />
              <div className="flex-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-semibold text-gray-800">Notas emitidas neste mês</p>
                  <span className={cn('font-bold', limitReached ? 'text-red-600' : nearLimit ? 'text-orange-600' : 'text-gray-700')}>
                    {usedThisMonth} / {noteLimit}
                  </span>
                </div>
                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full', limitReached ? 'bg-red-500' : nearLimit ? 'bg-orange-500' : 'bg-green-500')}
                    style={{ width: `${Math.min(100, (usedThisMonth / noteLimit) * 100)}%` }} />
                </div>
                {limitReached ? (
                  <p className="text-sm text-red-700 mt-2">
                    Limite do plano atingido. Notas adicionais custam <strong>R$ 2,00 cada</strong> —
                    entre em contato com o suporte para liberar mais notas ou negociar seu plano.
                  </p>
                ) : nearLimit ? (
                  <p className="text-sm text-orange-700 mt-2">
                    Você está perto do limite mensal. Ao atingir {noteLimit}, a emissão é bloqueada
                    (notas extras: R$ 2,00 cada, mediante contato com o suporte).
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Module status banner */}
      {isFiscalPlan && !company?.nfe_enabled && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-yellow-800">Módulo Fiscal desativado</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Para emitir NFC-e (balcão) e NF-e, ative o módulo em
                  <strong> Configurações → Fiscal &amp; NF-e</strong> e conclua a configuração do provedor fiscal.
                  O passo a passo completo está em <code>docs/NOTA-FISCAL.md</code>.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: nfes.length, icon: FileText, color: 'text-gray-600', bg: 'bg-gray-100' },
          { label: 'Autorizadas', value: nfes.filter(n => n.status === 'autorizada').length, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
          { label: 'Pendentes', value: nfes.filter(n => ['rascunho', 'validando', 'enviada'].includes(n.status)).length, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100' },
          { label: 'Rejeitadas', value: nfes.filter(n => n.status === 'rejeitada').length, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{loading ? '...' : value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Carregando...</div> :
        nfes.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">Nenhuma NF-e emitida</p>
            <p className="text-gray-400 text-sm">As NF-e serão criadas a partir da finalização de OS ou vendas</p>
          </div>
        ) : (
          <div className="space-y-2">
            {nfes.map(nfe => (
              <Card key={nfe.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">NF-e #{nfe.number || nfe.id.slice(-6)}</span>
                      <Badge className={`text-xs ${nfeStatusColor(nfe.status)}`}>{nfeStatusLabel(nfe.status)}</Badge>
                    </div>
                    <p className="text-xs text-gray-500">{formatDateTime(nfe.created_date)}</p>
                    {nfe.rejection_reason && <p className="text-xs text-red-500 mt-1">{nfe.rejection_reason}</p>}
                    {nfe.protocol && <p className="text-xs text-green-600">Protocolo: {nfe.protocol}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-900">{formatCurrency(nfe.total_amount)}</p>
                    <div className="flex gap-2 mt-1 items-center justify-end">
                      {nfe.danfe_url && <a href={nfe.danfe_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">DANFE</a>}
                      {nfe.xml_url && <a href={nfe.xml_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">XML</a>}
                      {['enviada', 'validando'].includes(nfe.status) && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={checking === nfe.id}
                          onClick={() => handleCheck(nfe.id)}>
                          <RefreshCw className={`w-3 h-3 mr-1 ${checking === nfe.id ? 'animate-spin' : ''}`} />
                          Consultar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      }
    </div>
  );
}