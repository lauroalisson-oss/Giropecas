import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, AlertCircle, CheckCircle, Clock, Info } from 'lucide-react';

export default function NFe() {
  const { company } = useCompany();
  const [nfes, setNfes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (company?.id) loadNFes(); }, [company]);

  const loadNFes = async () => {
    setLoading(true);
    const data = await base44.entities.NFeRecord.filter({ company_id: company.id }, '-created_date');
    setNfes(data);
    setLoading(false);
  };

  const nfeStatusColor = (status) => {
    const map = {
      rascunho: 'bg-gray-100 text-gray-700',
      validando: 'bg-blue-100 text-blue-700',
      enviada: 'bg-yellow-100 text-yellow-700',
      autorizada: 'bg-green-100 text-green-700',
      rejeitada: 'bg-red-100 text-red-700',
      cancelada: 'bg-gray-100 text-gray-500',
    };
    return map[status] || 'bg-gray-100 text-gray-700';
  };

  const nfeStatusLabel = (status) => {
    const map = {
      rascunho: 'Rascunho', validando: 'Validando', enviada: 'Enviada',
      autorizada: 'Autorizada', rejeitada: 'Rejeitada', cancelada: 'Cancelada',
    };
    return map[status] || status;
  };

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">NF-e</h1>
        <p className="text-gray-500 text-sm">Notas Fiscais Eletrônicas</p>
      </div>

      {/* Module status banner */}
      {!company?.nfe_enabled && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-yellow-800">Módulo NF-e — Aguardando Ativação</p>
                <p className="text-sm text-yellow-700 mt-1">
                  O módulo de emissão de NF-e está estruturado e pronto para integração com o provedor SEFAZ.
                  Para ativar, configure o certificado digital e a URL do provedor nas
                  <strong> Configurações da Empresa</strong>.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className="bg-green-100 text-green-700">✓ Estrutura de dados pronta</Badge>
                  <Badge className="bg-green-100 text-green-700">✓ Campos NCM/CFOP configurados</Badge>
                  <Badge className="bg-yellow-100 text-yellow-700">⏳ Integração SEFAZ — Sprint 2</Badge>
                  <Badge className="bg-yellow-100 text-yellow-700">⏳ Certificado digital — Sprint 2</Badge>
                </div>
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
                    <div className="flex gap-2 mt-1">
                      {nfe.danfe_url && <a href={nfe.danfe_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">DANFE</a>}
                      {nfe.xml_url && <a href={nfe.xml_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">XML</a>}
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