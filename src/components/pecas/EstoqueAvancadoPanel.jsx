import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Package, TrendingUp, AlertTriangle, DollarSign, ArrowUpDown, History } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { ajusteDeEstoque, estoqueBaixo, efeitoNoSaldo } from '@/lib/estoque';

export default function EstoqueAvancadoPanel() {
  const { company } = useCompany();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [parts, setParts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustPart, setAdjustPart] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ new_quantity: '', reason: '' });
  const [ajustando, setAjustando] = useState(false);
  const [busca, setBusca] = useState('');

  useEffect(() => { if (company?.id) loadData(); }, [company]);

  const loadData = async () => {
    setLoading(true);
    const [p, m] = await Promise.all([
      base44.entities.Part.filter({ company_id: company.id }),
      base44.entities.StockMovement.filter({ company_id: company.id }, '-created_date', 50),
    ]);
    setParts(p);
    setMovements(m);
    setLoading(false);
  };

  // Valorização
  const valorCusto = parts.reduce((s, p) => s + (p.cost_price || 0) * (p.stock_quantity || 0), 0);
  const valorVenda = parts.reduce((s, p) => s + (p.sale_price || 0) * (p.stock_quantity || 0), 0);
  const margemPotencial = valorVenda - valorCusto;
  const totalItens = parts.reduce((s, p) => s + (p.stock_quantity || 0), 0);
  const baixoEstoque = parts.filter(estoqueBaixo);
  const semEstoque = parts.filter(p => (p.stock_quantity || 0) === 0);

  // Curva ABC por valor de venda
  const sorted = [...parts].sort((a, b) => ((b.sale_price || 0) * (b.stock_quantity || 0)) - ((a.sale_price || 0) * (a.stock_quantity || 0)));
  const totalValor = sorted.reduce((s, p) => s + (p.sale_price || 0) * (p.stock_quantity || 0), 0);
  let acumulado = 0;
  const abc = sorted.map(p => {
    const valor = (p.sale_price || 0) * (p.stock_quantity || 0);
    acumulado += valor;
    const pct = totalValor > 0 ? (acumulado / totalValor) * 100 : 0;
    const classe = pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C';
    return { ...p, valorEstoque: valor, pctAcumulado: pct, classe };
  });

  const classeA = abc.filter(p => p.classe === 'A');
  const classeB = abc.filter(p => p.classe === 'B');
  const classeC = abc.filter(p => p.classe === 'C');

  const openAdjust = (part) => {
    setAdjustPart(part);
    setAdjustForm({ new_quantity: String(part.stock_quantity ?? 0), reason: '' });
    setShowAdjust(true);
  };

  // Todas as peças podem ser ajustadas. A lista mostrava só as 10 primeiras
  // (`parts.slice(0, 10)`), sem busca: numa oficina com 300 peças, 290 não
  // tinham como receber ajuste por aqui.
  const termo = busca.trim().toLowerCase();
  const paraAjustar = (termo
    ? parts.filter(p => [p.description, p.sku, p.internal_code, p.barcode, p.brand]
      .some(v => String(v || '').toLowerCase().includes(termo)))
    : parts
  ).slice(0, 50);

  const handleAdjust = async () => {
    // Ajuste mexe no estoque e grava histórico; o clique duplo gravava dois.
    if (!adjustPart || ajustando) return;
    setAjustando(true);
    try {
      // O estoque de agora, do banco — não o da lista carregada quando a
      // tela abriu. Uma venda no meio do caminho mudava a diferença.
      const atual = await base44.entities.Part.get(adjustPart.id);
      const r = ajusteDeEstoque({
        peca: adjustPart, atual: atual?.stock_quantity, contado: adjustForm.new_quantity,
        motivo: adjustForm.reason, companyId: company.id,
      });
      if (r.erro) {
        toast({ title: 'Ajuste não feito', description: r.erro, variant: 'destructive' });
        return;
      }
      // Movimento primeiro, saldo depois: se o saldo falhar, a conferência
      // acha a diferença; o contrário não deixava rastro.
      await base44.entities.StockMovement.create(r.movimento);
      await base44.entities.Part.update(adjustPart.id, { stock_quantity: r.novoEstoque });
      toast({
        title: 'Estoque ajustado',
        description: `${adjustPart.description}: ${r.movimento.previous_stock} → ${r.novoEstoque}`,
      });
      setShowAdjust(false);
      loadData();
    } catch (e) {
      toast({ title: 'Erro ao ajustar', description: e.message, variant: 'destructive' });
    } finally {
      setAjustando(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Valorização */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-blue-600" /><p className="text-xs text-gray-500">Valor Custo</p></div>
          <p className="text-lg font-bold text-blue-700">{formatCurrency(valorCusto)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-green-600" /><p className="text-xs text-gray-500">Valor Venda</p></div>
          <p className="text-lg font-bold text-green-700">{formatCurrency(valorVenda)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Package className="w-4 h-4 text-gray-600" /><p className="text-xs text-gray-500">Total Itens</p></div>
          <p className="text-lg font-bold text-gray-800">{totalItens} un</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-orange-600" /><p className="text-xs text-gray-500">Baixo/Sem Estoque</p></div>
          <p className="text-lg font-bold text-orange-700">{baixoEstoque.length} / {semEstoque.length}</p>
        </CardContent></Card>
      </div>

      {/* Curva ABC */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Curva ABC — Valorização de Estoque</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-green-50 rounded-lg">
              <Badge className="bg-green-600 text-white mb-1">Classe A (80%)</Badge>
              <p className="text-lg font-bold text-green-700">{classeA.length} itens</p>
              <p className="text-xs text-gray-500">{formatCurrency(classeA.reduce((s, p) => s + p.valorEstoque, 0))}</p>
            </div>
            <div className="p-3 bg-yellow-50 rounded-lg">
              <Badge className="bg-yellow-600 text-white mb-1">Classe B (15%)</Badge>
              <p className="text-lg font-bold text-yellow-700">{classeB.length} itens</p>
              <p className="text-xs text-gray-500">{formatCurrency(classeB.reduce((s, p) => s + p.valorEstoque, 0))}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <Badge className="bg-gray-600 text-white mb-1">Classe C (5%)</Badge>
              <p className="text-lg font-bold text-gray-700">{classeC.length} itens</p>
              <p className="text-xs text-gray-500">{formatCurrency(classeC.reduce((s, p) => s + p.valorEstoque, 0))}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ajustes rápidos */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ArrowUpDown className="w-4 h-4" />Ajuste Rápido de Estoque</CardTitle></CardHeader>
        <CardContent>
          <Input className="mb-2 h-8" placeholder="Buscar peça por nome, código ou marca..."
            value={busca} onChange={e => setBusca(e.target.value)} />
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {paraAjustar.length === 0 && (
              <p className="text-center text-gray-400 py-3 text-sm">Nenhuma peça encontrada</p>
            )}
            {paraAjustar.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.description}</p>
                  <p className="text-xs text-gray-500">Estoque atual: <span className="font-medium">{p.stock_quantity || 0}</span> {p.unit}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openAdjust(p)}>Ajustar</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Últimas movimentações */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><History className="w-4 h-4" />Últimas Movimentações</CardTitle></CardHeader>
        <CardContent>
          {movements.length === 0 ? <p className="text-center text-gray-400 py-4 text-sm">Sem movimentações</p> : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {movements.map(m => {
                const part = parts.find(p => p.id === m.part_id);
                const typeColors = { entrada: 'text-green-600', saida: 'text-red-600', ajuste: 'text-blue-600', devolucao: 'text-orange-600' };
                return (
                  <div key={m.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
                    <div>
                      <p className="font-medium">{part?.description || 'Peça removida'}</p>
                      <p className="text-xs text-gray-400">{m.type} • {m.reason || '—'}</p>
                    </div>
                    <div className="text-right">
                      {/* O sinal sai de efeitoNoSaldo: o ajuste que ACHOU
                          peças aparecia com "-". */}
                      <p className={`font-bold ${typeColors[m.type] || ''}`}>{efeitoNoSaldo(m) >= 0 ? '+' : '-'}{m.quantity}</p>
                      <p className="text-xs text-gray-400">{m.previous_stock} → {m.new_stock}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adjust dialog */}
      <Dialog open={showAdjust} onOpenChange={setShowAdjust}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ajustar Estoque</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">{adjustPart?.description}</p>
            <div>
              <Label>Quantidade contada</Label>
              <p className="text-xs text-gray-500 mb-1">Estoque no sistema: {adjustPart?.stock_quantity ?? 0}</p>
              <Input type="number" min="0" step="any" value={adjustForm.new_quantity} onChange={e => setAdjustForm(f => ({ ...f, new_quantity: e.target.value }))} />
            </div>
            <div>
              <Label>Motivo *</Label>
              <Input value={adjustForm.reason} onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))} placeholder="Ex: Contagem física, perda..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjust(false)}>Cancelar</Button>
            <Button onClick={handleAdjust} disabled={ajustando} className="bg-red-600 hover:bg-red-700 text-white">
              {ajustando ? 'Ajustando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}