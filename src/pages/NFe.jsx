import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { useLicense } from '@/lib/LicenseContext';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import { NFE_STATUS_LABEL, NFE_STATUS_COLOR } from '@/lib/fiscal';
import {
  baixarXml, consultarNaSefin, liberarNotaPresa, temPonteDesktop,
  pendenciasNfse, nfseNoMes, MODELO_LABEL,
} from '@/lib/nfse';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  FileText, AlertCircle, CheckCircle, Clock, Info, RefreshCw, Gauge,
  Download, Copy, Monitor, Unlock,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export default function NFe() {
  const { company } = useCompany();
  const { isFiscal, noteLimit: planNoteLimit } = useLicense();
  const { toast } = useToast();
  const [nfes, setNfes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ocupado, setOcupado] = useState(null);

  const noDesktop = temPonteDesktop();

  useEffect(() => { if (company?.id) loadNFes(); }, [company]);

  const loadNFes = async () => {
    setLoading(true);
    const data = await base44.entities.NFeRecord.filter({ company_id: company.id }, '-created_date');
    setNfes(data);
    setLoading(false);
  };

  const consultar = async (nota) => {
    setOcupado(nota.id);
    try {
      const r = await consultarNaSefin(nota.number, company?.nfe_environment === 'producao');
      toast({
        title: 'Nota encontrada no Sefin',
        description: `Situação confirmada para a chave ${nota.number}.`,
      });
      if (r?.xmlNfse && !nota.xml_content) {
        await base44.entities.NFeRecord.update(nota.id, { xml_content: r.xmlNfse });
        loadNFes();
      }
    } catch (e) {
      toast({ title: 'Não foi possível consultar', description: e.message, variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const baixar = (nota) => {
    try {
      const nome = baixarXml(nota);
      toast({ title: 'XML baixado', description: nome });
    } catch (e) {
      toast({ title: 'Sem XML para baixar', description: e.message, variant: 'destructive' });
    }
  };

  const copiarChave = async (chave) => {
    try {
      await navigator.clipboard.writeText(chave);
      toast({ title: 'Chave copiada' });
    } catch {
      toast({ title: 'Não foi possível copiar', description: chave, variant: 'destructive' });
    }
  };

  const liberar = async (nota) => {
    setOcupado(nota.id);
    try {
      await liberarNotaPresa(nota.id);
      toast({
        title: 'Nota liberada',
        description: 'Você já pode tentar emitir a NFS-e desta OS novamente.',
      });
      loadNFes();
    } catch (e) {
      toast({ title: 'Não foi possível liberar', description: e.message, variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  // O medidor conta o mesmo que o servidor bloqueia: NFS-e autorizada no
  // mês corrente. Contar diferente aqui faria o lojista ver folga onde o
  // servidor já recusa.
  const usadasNoMes = useMemo(() => nfseNoMes(nfes), [nfes]);

  const noteLimit = Number.isFinite(planNoteLimit) ? planNoteLimit : (company?.fiscal_note_limit || 100);
  const limitReached = usadasNoMes >= noteLimit;
  const nearLimit = usadasNoMes >= noteLimit * 0.9;
  const pendencias = pendenciasNfse(company);

  const statusColor = (s) => NFE_STATUS_COLOR[s] || 'bg-gray-100 text-gray-700';
  const statusLabel = (s) => NFE_STATUS_LABEL[s] || s;

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notas Fiscais</h1>
        <p className="text-gray-500 text-sm">NFS-e — nota de serviço da oficina</p>
      </div>

      {!isFiscal && (
        <Card className="mb-6 border-slate-200 bg-slate-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-800">Plano Não-Fiscal</p>
                <p className="text-sm text-slate-600 mt-1">
                  Sua oficina está no plano <strong>Não-Fiscal</strong>, que não inclui emissão de notas.
                  Para emitir NFS-e, fale com o provedor sobre o <strong>plano Fiscal</strong>.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isFiscal && (
        <>
          <Card className={cn('mb-4', limitReached ? 'border-red-200 bg-red-50'
            : nearLimit ? 'border-orange-200 bg-orange-50' : 'border-gray-200')}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Gauge className={cn('w-5 h-5 mt-0.5 flex-shrink-0', limitReached ? 'text-red-600'
                  : nearLimit ? 'text-orange-600' : 'text-gray-500')} />
                <div className="flex-1">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="font-semibold text-gray-800">NFS-e emitidas neste mês</p>
                    <span className={cn('font-bold', limitReached ? 'text-red-600'
                      : nearLimit ? 'text-orange-600' : 'text-gray-700')}>
                      {usadasNoMes} / {noteLimit}
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', limitReached ? 'bg-red-500'
                      : nearLimit ? 'bg-orange-500' : 'bg-green-500')}
                      style={{ width: `${Math.min(100, (usadasNoMes / noteLimit) * 100)}%` }} />
                  </div>
                  {limitReached ? (
                    <p className="text-sm text-red-700 mt-2">
                      Limite do mês atingido — a emissão está bloqueada. Peça ao provedor
                      para aumentar o limite do seu plano.
                    </p>
                  ) : nearLimit ? (
                    <p className="text-sm text-orange-700 mt-2">
                      Perto do limite mensal. Ao chegar a {noteLimit}, a emissão é bloqueada
                      até o provedor liberar mais notas.
                    </p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          {pendencias.length > 0 && (
            <Card className="mb-4 border-amber-200 bg-amber-50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold text-amber-800">Cadastro fiscal incompleto</p>
                    <p className="text-amber-700 mt-1">
                      O Sefin recusa a nota sem estes dados: <strong>{pendencias.join(', ')}</strong>.
                    </p>
                    <p className="text-amber-700 mt-1">
                      Preencha em <strong>Configurações → Fiscal</strong>.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!noDesktop && (
            <Card className="mb-4 border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Monitor className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold text-blue-900">Você está no navegador</p>
                    <p className="text-blue-800 mt-1">
                      Dá para consultar as notas aqui, mas <strong>emitir</strong> só pelo aplicativo
                      Giropeças instalado no computador da oficina — é lá que fica o certificado digital.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {company?.nfe_environment !== 'producao' && (
            <Card className="mb-6 border-purple-200 bg-purple-50">
              <CardContent className="p-3">
                <p className="text-sm text-purple-800">
                  <strong>Ambiente de homologação (teste).</strong> As notas emitidas aqui
                  não têm valor fiscal. Mude para produção em Configurações → Fiscal quando
                  tudo estiver conferido.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

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

      {loading ? <div className="text-center py-12 text-gray-400">Carregando...</div>
        : nfes.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">Nenhuma nota emitida</p>
            <p className="text-gray-400 text-sm">
              A NFS-e é emitida pelo botão <strong>Emitir NFS-e</strong> na ordem de serviço.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {nfes.map(nota => {
              const ehNfse = nota.model === 'nfse';
              const presa = nota.status === 'validando';
              return (
                <Card key={nota.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-gray-900">
                            {MODELO_LABEL[nota.model] || 'Nota'}
                            {ehNfse && nota.rps_number ? ` nº ${nota.rps_number}` : ''}
                          </span>
                          <Badge className={`text-xs ${statusColor(nota.status)}`}>
                            {statusLabel(nota.status)}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500">{formatDateTime(nota.created_date)}</p>

                        {ehNfse && nota.number && (
                          <button onClick={() => copiarChave(nota.number)}
                            className="text-xs text-gray-600 mt-1 font-mono break-all text-left hover:text-gray-900 flex items-start gap-1">
                            <Copy className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            {nota.number}
                          </button>
                        )}

                        {ehNfse && Number(nota.iss_amount) > 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            ISS: {formatCurrency(nota.iss_amount)}
                          </p>
                        )}

                        {nota.rejection_reason && (
                          <p className="text-xs text-red-600 mt-1">{nota.rejection_reason}</p>
                        )}

                        {presa && (
                          <p className="text-xs text-amber-600 mt-1">
                            A transmissão não terminou. Se a nota não aparecer no Sefin,
                            libere para tentar de novo.
                          </p>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900">{formatCurrency(nota.total_amount)}</p>
                        <div className="flex gap-1 mt-1 items-center justify-end flex-wrap">
                          {nota.xml_content && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                              onClick={() => baixar(nota)}>
                              <Download className="w-3 h-3 mr-1" />XML
                            </Button>
                          )}
                          {ehNfse && nota.number && noDesktop && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                              disabled={ocupado === nota.id} onClick={() => consultar(nota)}>
                              <RefreshCw className={cn('w-3 h-3 mr-1', ocupado === nota.id && 'animate-spin')} />
                              Consultar
                            </Button>
                          )}
                          {presa && (
                            <Button size="sm" variant="ghost"
                              className="h-7 px-2 text-xs text-amber-700 hover:bg-amber-50"
                              disabled={ocupado === nota.id} onClick={() => liberar(nota)}>
                              <Unlock className="w-3 h-3 mr-1" />Liberar
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
    </div>
  );
}
