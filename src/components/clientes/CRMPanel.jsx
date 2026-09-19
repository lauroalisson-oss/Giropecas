import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { Phone, Clock, AlertCircle, TrendingUp, Cake, Trophy } from 'lucide-react';
import { resumoClientes, aniversariantesDoMes, idade } from '@/lib/crm';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function CRMPanel() {
  const { company } = useCompany();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => { if (company?.id) loadData(); }, [company]);

  const loadData = async () => {
    setLoading(true);
    // Ordens de serviço entram na conta: o cliente que só faz serviço
    // também é cliente, e antes ele não pontuava nada.
    const [c, s, o, v] = await Promise.all([
      base44.entities.Customer.filter({ company_id: company.id }, '-created_date'),
      base44.entities.Sale.filter({ company_id: company.id }, '-created_date', 1000),
      base44.entities.WorkOrder.filter({ company_id: company.id }, '-created_date', 1000),
      base44.entities.Vehicle.filter({ company_id: company.id }),
    ]);
    setCustomers(c); setSales(s); setOrders(o); setVehicles(v);
    setLoading(false);
  };

  const stats = useMemo(() => {
    const base = resumoClientes({ clientes: customers, vendas: sales, ordens: orders });
    return base.map(c => ({
      ...c,
      veiculos: vehicles.filter(v => v.customer_id === c.id).length,
    }));
  }, [customers, sales, orders, vehicles]);

  const mesAtual = new Date().getMonth() + 1;
  const aniversariantes = useMemo(
    () => aniversariantesDoMes(customers, mesAtual), [customers, mesAtual],
  );

  const ranking = [...stats].filter(c => c.pontos > 0).sort((a, b) => b.pontos - a.pontos);
  const novos = stats.filter(c => c.diasDesde === null);
  const followUp = stats.filter(c => c.diasDesde !== null && c.diasDesde > 45 && c.diasDesde <= 90);
  const inativos = stats.filter(c => c.diasDesde !== null && c.diasDesde > 90);

  const filtrados = search
    ? stats.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()))
    : [];

  const hoje = new Date().getDate();

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Resumo icone={Cake} cor="pink" titulo="Aniversariantes"
          valor={aniversariantes.length} nota={MESES[mesAtual - 1]} />
        <Resumo icone={TrendingUp} cor="green" titulo="Novos"
          valor={novos.length} nota="Sem compras ainda" />
        <Resumo icone={Clock} cor="orange" titulo="Follow-up"
          valor={followUp.length} nota="45 a 90 dias sem vir" />
        <Resumo icone={AlertCircle} cor="red" titulo="Inativos"
          valor={inativos.length} nota="+90 dias sem vir" />
      </div>

      {/* Aniversariantes do mês */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Cake className="w-4 h-4 text-pink-500" />
            Aniversariantes de {MESES[mesAtual - 1]} ({aniversariantes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Vazio texto="Carregando..." /> :
            aniversariantes.length === 0 ? (
              <Vazio texto="Nenhum aniversariante este mês." />
            ) : (
              <div className="space-y-1">
                {aniversariantes.map(c => {
                  const anos = idade(c.birth_date);
                  const ehHoje = c._dia === hoje;
                  return (
                    <div key={c.id} className={`flex items-center justify-between py-2 px-2 rounded border-b last:border-0 ${ehHoje ? 'bg-pink-50' : ''}`}>
                      <div className="min-w-0">
                        <Link to={`/clientes/${c.id}`} className="text-sm font-medium hover:underline">
                          {c.name}
                        </Link>
                        {ehHoje && <Badge className="ml-2 bg-pink-100 text-pink-700 hover:bg-pink-100">hoje</Badge>}
                        <p className="text-xs text-gray-500">
                          dia {String(c._dia).padStart(2, '0')}
                          {anos !== null && ` • faz ${anos + 1} anos`}
                        </p>
                      </div>
                      {c.phone && (
                        <a href={`https://wa.me/55${String(c.phone).replace(/\D/g, '')}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-xs text-green-700 hover:underline flex items-center gap-1 flex-shrink-0">
                          <Phone className="w-3 h-3" />Parabenizar
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </CardContent>
      </Card>

      {/* Ranking por pontos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" />Clientes por pontuação
          </CardTitle>
          <p className="text-xs text-gray-400">
            R$ 10 gastos = 1 ponto • cada compra = 5 • cada serviço = 15
          </p>
        </CardHeader>
        <CardContent>
          {loading ? <Vazio texto="Carregando..." /> :
            ranking.length === 0 ? (
              <Vazio texto="Ainda não há movimento para pontuar." />
            ) : (
              <div className="space-y-1">
                {ranking.slice(0, 15).map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <span className="text-xs text-gray-400 w-5 flex-shrink-0">{i + 1}º</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link to={`/clientes/${c.id}`} className="text-sm font-medium truncate hover:underline">
                          {c.name}
                        </Link>
                        <Badge className={`${c.faixa.cor} hover:${c.faixa.cor}`}>{c.faixa.nome}</Badge>
                      </div>
                      <p className="text-xs text-gray-500">
                        {c.numCompras} compra(s) • {c.numServicos} serviço(s) • {formatCurrency(c.totalGasto)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900">{c.pontos}</p>
                      <p className="text-xs text-gray-400">pontos</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>

      {/* Busca */}
      <div>
        <Input placeholder="Buscar cliente para ver o histórico..." value={search}
          onChange={e => setSearch(e.target.value)} className="max-w-md" />
      </div>

      {search && filtrados.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Resultado</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {filtrados.slice(0, 10).map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="min-w-0">
                  <Link to={`/clientes/${c.id}`} className="text-sm font-medium hover:underline">{c.name}</Link>
                  <p className="text-xs text-gray-500">
                    {c.numCompras} compra(s) • {c.numServicos} serviço(s) • {c.veiculos} veículo(s)
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold">{formatCurrency(c.totalGasto)}</p>
                  <p className="text-xs text-gray-400">
                    {c.ultimaVisita ? formatDate(c.ultimaVisita) : 'Sem movimento'}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Follow-up */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-500" />Clientes para contato ({followUp.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Vazio texto="Carregando..." /> :
            followUp.length === 0 ? (
              <Vazio texto="Ninguém precisa de contato agora." />
            ) : (
              <div className="space-y-1">
                {followUp.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="min-w-0">
                      <Link to={`/clientes/${c.id}`} className="text-sm font-medium hover:underline">{c.name}</Link>
                      <p className="text-xs text-gray-500">{c.diasDesde} dias sem vir</p>
                    </div>
                    {c.phone && (
                      <a href={`https://wa.me/55${String(c.phone).replace(/\D/g, '')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs text-green-700 hover:underline flex items-center gap-1 flex-shrink-0">
                        <Phone className="w-3 h-3" />WhatsApp
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

const CORES = {
  pink: ['bg-pink-50 border-pink-200', 'text-pink-600', 'text-pink-700'],
  green: ['bg-green-50 border-green-200', 'text-green-600', 'text-green-700'],
  orange: ['bg-orange-50 border-orange-200', 'text-orange-600', 'text-orange-700'],
  red: ['bg-red-50 border-red-200', 'text-red-600', 'text-red-700'],
  yellow: ['bg-yellow-50 border-yellow-200', 'text-yellow-600', 'text-yellow-700'],
};

function Resumo({ icone: Icone, cor, titulo, valor, nota }) {
  const [fundo, icone, texto] = CORES[cor] || CORES.yellow;
  return (
    <Card className={fundo}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Icone className={`w-4 h-4 ${icone}`} />
          <p className="text-xs text-gray-600">{titulo}</p>
        </div>
        <p className={`text-lg font-bold ${texto}`}>{valor}</p>
        <p className="text-xs text-gray-500">{nota}</p>
      </CardContent>
    </Card>
  );
}

function Vazio({ texto }) {
  return <p className="text-gray-400 text-sm text-center py-4">{texto}</p>;
}
