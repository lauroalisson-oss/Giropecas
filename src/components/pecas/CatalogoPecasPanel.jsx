import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { CATALOGO_PECAS, baixarCSVCatalogo } from '@/lib/catalogoPecas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Download, Package, Plus, Check, ChevronDown, ChevronRight, Bike, Car, Search } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { movimentoSaldoInicial } from '@/lib/estoque';

export default function CatalogoPecasPanel({ onImported }) {
  const { company } = useCompany();
  const { toast } = useToast();
  const [tipo, setTipo] = useState('motos');
  const [expandedCat, setExpandedCat] = useState(null);
  const [search, setSearch] = useState('');
  const [quantidades, setQuantidades] = useState({});
  const [custos, setCustos] = useState({});
  const [vendas, setVendas] = useState({});
  const [importing, setImporting] = useState(false);
  const [importedIds, setImportedIds] = useState(new Set());

  const grupo = CATALOGO_PECAS[tipo];

  const filtrarPecas = (pecas) => {
    if (!search.trim()) return pecas;
    return pecas.filter(p =>
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      p.ncm.includes(search)
    );
  };

  const totalPecas = grupo.categorias.reduce((s, c) => s + c.pecas.length, 0);
  const pecasComQtd = Object.entries(quantidades).filter(([, q]) => q && parseFloat(q) > 0);

  const importarPeca = async (peca, catNome, idx) => {
    const qtd = parseFloat(quantidades[`${tipo}-${catNome}-${idx}`]) || 0;
    if (qtd <= 0) { toast({ title: 'Informe a quantidade', variant: 'destructive' }); return; }
    const custo = parseFloat(custos[`${tipo}-${catNome}-${idx}`]) || 0;
    const venda = parseFloat(vendas[`${tipo}-${catNome}-${idx}`]) || 0;
    setImporting(true);
    try {
      const criada = await base44.entities.Part.create({
        company_id: company.id,
        description: `${peca.description} (${grupo.label})`,
        ncm: peca.ncm,
        unit: peca.unit,
        cfop_default: peca.cfop,
        stock_quantity: qtd,
        cost_price: custo,
        sale_price: venda,
        min_stock: 1,
        is_active: true,
      });
      // O saldo com que a peça nasce vira movimento — ver
      // movimentoSaldoInicial. Sem ele, a conferência nunca fechava.
      const inicial = movimentoSaldoInicial({ peca: criada, companyId: company.id, motivo: 'Saldo inicial (catálogo)' });
      if (inicial) await base44.entities.StockMovement.create(inicial);
      setImportedIds(prev => new Set(prev).add(`${tipo}-${catNome}-${idx}`));
      toast({ title: `"${peca.description}" adicionada ao estoque!`, description: `${qtd} ${peca.unit} • NCM ${peca.ncm}` });
      if (onImported) onImported();
    } catch (e) {
      toast({ title: 'Erro ao importar', description: e.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const importarCategoria = async (cat) => {
    const itens = cat.pecas
      .map((p, idx) => ({ p, idx, q: parseFloat(quantidades[`${tipo}-${cat.nome}-${idx}`]) || 0 }))
      .filter(i => i.q > 0);
    if (itens.length === 0) { toast({ title: 'Informe quantidades para importar', variant: 'destructive' }); return; }
    setImporting(true);
    try {
      const records = itens.map(({ p, q }) => ({
        company_id: company.id,
        description: `${p.description} (${grupo.label})`,
        ncm: p.ncm,
        unit: p.unit,
        cfop_default: p.cfop,
        stock_quantity: q,
        cost_price: 0,
        sale_price: 0,
        min_stock: 1,
        is_active: true,
      }));
      const criadas = await base44.entities.Part.bulkCreate(records);
      const iniciais = criadas
        .map(peca => movimentoSaldoInicial({ peca, companyId: company.id, motivo: 'Saldo inicial (catálogo)' }))
        .filter(Boolean);
      if (iniciais.length) await base44.entities.StockMovement.bulkCreate(iniciais);
      itens.forEach(({ p, idx }) => setImportedIds(prev => new Set(prev).add(`${tipo}-${cat.nome}-${idx}`)));
      toast({ title: `${itens.length} peças importadas!`, description: `Categoria: ${cat.nome}` });
      if (onImported) onImported();
    } catch (e) {
      toast({ title: 'Erro ao importar categoria', description: e.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Intro */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Package className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">Catálogo de peças com NCM pré-cadastrado</p>
              <p className="text-xs text-blue-700 mt-0.5">
                Selecione as peças, informe a quantidade (e opcionalmente custo/venda) e clique em "Adicionar ao Estoque".
                Os dados tributários (NCM, CFOP e unidade) já vêm preenchidos. Você também pode baixar a lista em CSV.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => baixarCSVCatalogo(tipo)} className="flex-shrink-0">
              <Download className="w-4 h-4 mr-1.5" />Baixar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tipo toggle */}
      <div className="flex gap-2">
        <Button
          variant={tipo === 'motos' ? 'default' : 'outline'}
          onClick={() => { setTipo('motos'); setExpandedCat(null); setImportedIds(new Set()); }}
          className={tipo === 'motos' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
        >
          <Bike className="w-4 h-4 mr-2" />Motos
        </Button>
        <Button
          variant={tipo === 'carros' ? 'default' : 'outline'}
          onClick={() => { setTipo('carros'); setExpandedCat(null); setImportedIds(new Set()); }}
          className={tipo === 'carros' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
        >
          <Car className="w-4 h-4 mr-2" />Carros
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => baixarCSVCatalogo(null)}>
          <Download className="w-4 h-4 mr-1.5" />CSV Completo
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder={`Buscar peça ou NCM em ${grupo.label}...`} value={search}
          onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      <p className="text-xs text-gray-500">{totalPecas} peças em {grupo.categorias.length} categorias</p>

      {/* Categorias */}
      <div className="space-y-2">
        {grupo.categorias.map(cat => {
          const pecasFiltradas = filtrarPecas(cat.pecas);
          if (search && pecasFiltradas.length === 0) return null;
          const isOpen = expandedCat === cat.nome || !!search;
          const qtdNaCategoria = cat.pecas
            .filter((_, idx) => parseFloat(quantidades[`${tipo}-${cat.nome}-${idx}`]) > 0).length;
          return (
            <Card key={cat.nome}>
              <CardContent className="p-0">
                <button
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedCat(isOpen && !search ? null : cat.nome)}
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <span className="font-medium text-gray-900">{cat.nome}</span>
                    <Badge variant="secondary" className="text-xs">{cat.pecas.length}</Badge>
                    {qtdNaCategoria > 0 && <Badge className="bg-green-100 text-green-700 text-xs">{qtdNaCategoria} prontas</Badge>}
                  </div>
                  {qtdNaCategoria > 0 && (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={importing}
                      onClick={(e) => { e.stopPropagation(); importarCategoria(cat); }}>
                      <Plus className="w-3.5 h-3.5 mr-1" />Importar {qtdNaCategoria}
                    </Button>
                  )}
                </button>
                {isOpen && (
                  <div className="border-t divide-y">
                    {pecasFiltradas.map((p, idx) => {
                      const key = `${tipo}-${cat.nome}-${idx}`;
                      const isImported = importedIds.has(key);
                      return (
                        <div key={key} className="p-3 flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{p.description}</p>
                            <div className="flex gap-3 mt-0.5">
                              <span className="text-xs text-gray-400">NCM: <span className="text-gray-600 font-medium">{p.ncm}</span></span>
                              <span className="text-xs text-gray-400">Un: {p.unit}</span>
                              <span className="text-xs text-gray-400">CFOP: {p.cfop}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Input type="number" min="0" placeholder="Qtd"
                              className="w-20 h-8 text-sm"
                              value={quantidades[key] || ''}
                              onChange={e => setQuantidades(prev => ({ ...prev, [key]: e.target.value }))}
                              disabled={isImported} />
                            <Input type="number" min="0" step="0.01" placeholder="Custo"
                              className="w-24 h-8 text-sm hidden sm:block"
                              value={custos[key] || ''}
                              onChange={e => setCustos(prev => ({ ...prev, [key]: e.target.value }))}
                              disabled={isImported} />
                            <Input type="number" min="0" step="0.01" placeholder="Venda"
                              className="w-24 h-8 text-sm hidden sm:block"
                              value={vendas[key] || ''}
                              onChange={e => setVendas(prev => ({ ...prev, [key]: e.target.value }))}
                              disabled={isImported} />
                            {isImported ? (
                              <Badge className="bg-green-100 text-green-700 h-8 px-3"><Check className="w-3.5 h-3.5 mr-1" />No estoque</Badge>
                            ) : (
                              <Button size="sm" variant="outline" disabled={importing} className="h-8"
                                onClick={() => importarPeca(p, cat.nome, idx)}>
                                <Plus className="w-3.5 h-3.5 mr-1" />Estoque
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}