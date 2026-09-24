import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, CheckCircle2, Clock, Percent, Target, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  resumoComissoes, totaisComissoes, podePagarComissao, lancamentoComissao,
  competenciaDe, REFERENCIA_COMISSAO,
} from '@/lib/comissoes';

// Os últimos 12 meses, para escolher a competência a pagar.
function mesesRecentes(n = 12) {
  const hoje = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    return {
      valor: competenciaDe(d),
      rotulo: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    };
  });
}

export default function ComissoesPanel() {
  const { company } = useCompany();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [technicians, setTechnicians] = useState([]);
  const [orders, setOrders] = useState([]);
  const [paidCommissions, setPaidCommissions] = useState([]);
  // A competência é sempre um MÊS. A comissão é quitada mês a mês; sem
  // saber qual mês está sendo pago, não há como cruzar o pagamento com o
  // serviço que ele quita.
  const [competencia, setCompetencia] = useState(competenciaDe(new Date()));
  const [pagando, setPagando] = useState(null);

  const meses = mesesRecentes();

  useEffect(() => { if (company?.id) loadData(); }, [company]);

  const loadData = async () => {
    setLoading(true);
    const [techs, ords, entries] = await Promise.all([
      base44.entities.Technician.filter({ company_id: company.id }, 'name'),
      base44.entities.WorkOrder.filter({ company_id: company.id }, '-created_date', 500),
      base44.entities.AccountingEntry.filter(
        { company_id: company.id, reference_type: REFERENCIA_COMISSAO }, '-date', 500),
    ]);
    setTechnicians(techs);
    setOrders(ords);
    setPaidCommissions(entries);
    setLoading(false);
  };

  // A conta inteira mora em lib/comissoes.js — a mesma que a suíte
  // confere. Estava aqui dentro, e daqui divergia do relatório.
  const comissoes = resumoComissoes({
    ordens: orders, tecnicos: technicians, pagamentos: paidCommissions, competencia,
  });
  const totais = totaisComissoes(comissoes);

  const payCommission = async (c) => {
    // Marcar como paga cria uma saída no caixa e não se desfaz sozinha.
    // O botão só sumia DEPOIS de a tela recarregar — tempo de sobra para
    // o segundo clique lançar a despesa em dobro.
    if (pagando) return;
    const impedimento = podePagarComissao(c, competencia);
    if (impedimento) {
      toast({ title: 'Não é possível pagar', description: impedimento.erro, variant: 'destructive' });
      return;
    }

    setPagando(c.tecnico.id);
    try {
      await base44.entities.AccountingEntry.create(lancamentoComissao({
        tecnico: c.tecnico,
        valor: c.pendente,
        competencia,
        data: new Date().toISOString().split('T')[0],
        companyId: company.id,
      }));
      toast({ title: `Comissão de ${c.tecnico.name} paga`, description: `Competência ${competencia}` });
      await loadData();
    } catch (e) {
      toast({ title: 'Erro ao registrar o pagamento', description: e.message, variant: 'destructive' });
    } finally {
      setPagando(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Select value={competencia} onValueChange={setCompetencia}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {meses.map(m => <SelectItem key={m.valor} value={m.valor}>{m.rotulo}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-orange-50 border-orange-200"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-orange-600" /><p className="text-xs text-gray-600">A Pagar</p></div>
          <p className="text-lg font-bold text-orange-700">{formatCurrency(totais.aPagar)}</p>
        </CardContent></Card>
        <Card className="bg-green-50 border-green-200"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><CheckCircle2 className="w-4 h-4 text-green-600" /><p className="text-xs text-gray-600">Pago</p></div>
          <p className="text-lg font-bold text-green-700">{formatCurrency(totais.pago)}</p>
        </CardContent></Card>
        <Card className="bg-blue-50 border-blue-200"><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-blue-600" /><p className="text-xs text-gray-600">Total Gerado</p></div>
          <p className="text-lg font-bold text-blue-700">{formatCurrency(totais.gerado)}</p>
        </CardContent></Card>
      </div>

      {/* Lista por técnico */}
      {loading ? <p className="text-gray-400 text-sm text-center py-6">Carregando...</p> : (
        <div className="space-y-2">
          {comissoes.map(c => (
            <Card key={c.tecnico.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-red-700">{c.tecnico.name?.[0]?.toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{c.tecnico.name}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Percent className="w-3 h-3" />{c.percentual}%</span>
                        <span>• {c.ordens} OS</span>
                        {c.meta > 0 && (
                          <span className={`flex items-center gap-1 ${c.metaAtingida ? 'text-green-600' : 'text-orange-600'}`}>
                            <Target className="w-3 h-3" />{c.metaAtingida ? 'Meta atingida' : `Meta: ${formatCurrency(c.meta)}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Receita serviços</p>
                    <p className="font-bold text-gray-900">{formatCurrency(c.maoDeObra)}</p>
                  </div>
                </div>
                {c.meta > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500 flex items-center gap-1"><Target className="w-3 h-3" />Meta mensal</span>
                      <span className="font-medium">{formatCurrency(c.maoDeObra)} / {formatCurrency(c.meta)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${c.metaAtingida ? 'bg-green-500' : 'bg-orange-400'}`} style={{ width: `${c.metaPct}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-400">{c.metaPct.toFixed(0)}% da meta</span>
                      {/* A meta é alvo, não condição: a comissão é paga
                          do mesmo jeito. O texto antigo dizia "Faz jus à
                          comissão" / "Abaixo da meta", como se a meta
                          liberasse o pagamento — e logo abaixo o botão
                          oferecia pagar assim mesmo. */}
                      {c.metaAtingida ? (
                        <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Meta batida</span>
                      ) : (
                        <span className="text-xs text-orange-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Ainda não bateu a meta</span>
                      )}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-center text-sm border-t pt-3 mt-3">
                  <div>
                    <p className="text-xs text-gray-500">Comissão</p>
                    <p className="font-bold text-gray-800">{formatCurrency(c.gerado)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Pago</p>
                    <p className="font-bold text-green-600">{formatCurrency(c.pago)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Pendente</p>
                    <p className="font-bold text-orange-600">{formatCurrency(c.pendente)}</p>
                  </div>
                </div>
                {c.pendente > 0.01 && (
                  <Button size="sm" disabled={pagando === c.tecnico.id}
                    className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => payCommission(c)}>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {pagando === c.tecnico.id ? 'Registrando...' : `Pagar ${formatCurrency(c.pendente)}`}
                  </Button>
                )}
                {c.pendente >= -0.01 && c.pendente <= 0.01 && c.gerado > 0 && (
                  <Badge className="mt-3 w-full justify-center bg-green-100 text-green-700">Quitado</Badge>
                )}
                {/* Pago a mais não pode se esconder atrás de "Quitado":
                    é dinheiro que saiu sem lastro, e só o dono resolve. */}
                {c.pendente < -0.01 && (
                  <Badge className="mt-3 w-full justify-center bg-red-100 text-red-700">
                    Pago {formatCurrency(-c.pendente)} a mais neste mês
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
          {comissoes.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">Nenhum mecânico cadastrado</p>}
        </div>
      )}
    </div>
  );
}