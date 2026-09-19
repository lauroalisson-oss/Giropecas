import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { revisoesDoVeiculo } from '@/lib/crm';

// Situação das manutenções preventivas de um veículo.
//
// Calculado a partir das OS já feitas: para cada serviço com intervalo
// definido, a última execução + o intervalo diz quando vence. Vence pelo
// primeiro critério atingido — tempo ou km.
export default function RevisoesVeiculo({ vehicleId, kmAtual = null, compacto = false }) {
  const { company } = useCompany();
  const [revisoes, setRevisoes] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    if (!company?.id || !vehicleId) { setCarregando(false); return; }

    (async () => {
      try {
        const [ordens, servicos] = await Promise.all([
          base44.entities.WorkOrder.filter(
            { company_id: company.id, vehicle_id: vehicleId }, '-created_date', 100,
          ),
          base44.entities.Service.filter({ company_id: company.id }),
        ]);
        if (!ativo) return;
        const porId = Object.fromEntries(servicos.map(s => [s.id, s]));
        setRevisoes(revisoesDoVeiculo({ ordens, servicosPorId: porId, kmAtual }));
      } catch {
        if (ativo) setRevisoes([]);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();

    return () => { ativo = false; };
  }, [company?.id, vehicleId, kmAtual]);

  if (carregando || revisoes.length === 0) return null;

  const pendentes = revisoes.filter(r => r.status !== 'em_dia');

  // Em telas apertadas, só o que exige ação.
  if (compacto && pendentes.length === 0) return null;
  const lista = compacto ? pendentes : revisoes;

  return (
    <Card className={pendentes.length ? 'border-amber-300' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="w-4 h-4" />Manutenção preventiva
          {pendentes.length > 0 && (
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
              {pendentes.length} pendente{pendentes.length > 1 ? 's' : ''}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {lista.map(r => <LinhaRevisao key={r.servico_id} r={r} />)}
      </CardContent>
    </Card>
  );
}

function LinhaRevisao({ r }) {
  const estilo = {
    vencido: ['bg-red-50 border-red-200', 'text-red-700', AlertTriangle],
    proximo: ['bg-amber-50 border-amber-200', 'text-amber-800', AlertTriangle],
    em_dia: ['bg-gray-50 border-gray-200', 'text-gray-600', CheckCircle2],
  }[r.status];
  const [fundo, cor, Icone] = estilo;

  const partes = [];
  if (r.vence_em) partes.push(new Date(r.vence_em).toLocaleDateString('pt-BR'));
  if (r.vence_km) partes.push(`${Number(r.vence_km).toLocaleString('pt-BR')} km`);

  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-lg border ${fundo}`}>
      <Icone className={`w-4 h-4 flex-shrink-0 mt-0.5 ${cor}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{r.servico_nome}</p>
        <p className={`text-xs ${cor}`}>
          {r.status === 'vencido' && `Vencida (por ${r.motivo})`}
          {r.status === 'proximo' && `Vence em breve (por ${r.motivo})`}
          {r.status === 'em_dia' && 'Em dia'}
          {partes.length > 0 && ` • próxima: ${partes.join(' ou ')}`}
        </p>
        {r.dias_restantes !== null && r.status !== 'em_dia' && (
          <p className="text-xs text-gray-500 mt-0.5">
            {r.dias_restantes > 0
              ? `faltam ${r.dias_restantes} dia(s)`
              : `atrasada há ${Math.abs(r.dias_restantes)} dia(s)`}
            {r.km_restantes !== null && (r.km_restantes > 0
              ? ` • faltam ${r.km_restantes.toLocaleString('pt-BR')} km`
              : ` • ${Math.abs(r.km_restantes).toLocaleString('pt-BR')} km além do previsto`)}
          </p>
        )}
      </div>
    </div>
  );
}
