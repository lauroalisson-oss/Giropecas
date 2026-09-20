import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { FileText, Loader2, ChevronDown, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useCompany } from '@/lib/CompanyContext';
import { useLicense } from '@/lib/LicenseContext';
import { emitirNota, fiscalIssues, NFE_STATUS_LABEL } from '@/lib/fiscal';

// Botão de emissão fiscal reutilizável, com verificação prévia de cadastro.
// Props:
//   saleId | workOrderId  — origem da nota
//   items                 — itens da venda/OS (para pré-checagem de NCM)
//   partsById             — mapa id -> Part (com ncm) para a pré-checagem
//   size, onEmitted
// Vira `true` quando a emissão de nota de peça for religada no servidor
// (rota própria em /api, no lugar da backend function do Base44).
const EMISSAO_PECA_ATIVA = false;

export default function EmitirNotaButton({ saleId, workOrderId, items, partsById, size = 'sm', onEmitted }) {
  const { company } = useCompany();
  const { isFiscal } = useLicense();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null); // { tipo, issues }
  const [indisponivel, setIndisponivel] = useState(null); // 'nfe' | 'nfce'

  // Só aparece quando a licença ativa é do plano Fiscal
  if (!isFiscal) return null;

  const startEmit = (tipo) => {
    const issues = fiscalIssues({ items, partsById, company });
    if (issues.length) {
      setPending({ tipo, issues });
      return;
    }
    doEmit(tipo);
  };

  const doEmit = async (tipo) => {
    setPending(null);
    // NF-e/NFC-e de PEÇA ainda não foi religada depois da migração: a
    // emissão dependia de backend functions do Base44, que não existem
    // mais. Avisar é melhor do que deixar estourar um "HTTP 404" na cara
    // do lojista no meio do atendimento.
    if (!EMISSAO_PECA_ATIVA) {
      setPending(null);
      setIndisponivel(tipo);
      return;
    }
    setLoading(true);
    try {
      const result = await emitirNota({ tipo, saleId, workOrderId });
      const label = NFE_STATUS_LABEL[result.status] || result.status;
      if (result.status === 'autorizada') {
        toast({ title: 'Nota autorizada!', description: `${tipo.toUpperCase()} emitida com sucesso.` });
      } else if (result.status === 'rejeitada') {
        toast({ title: 'Nota rejeitada', description: result.record?.rejection_reason || 'Verifique os dados fiscais.', variant: 'destructive' });
      } else {
        toast({ title: `Nota ${label}`, description: 'Acompanhe o status na página NF-e.' });
      }
      onEmitted?.(result);
    } catch (e) {
      toast({ title: 'Erro ao emitir nota', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={size} variant="outline" disabled={loading} className="border-blue-200 text-blue-700 hover:bg-blue-50">
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
            Emitir Nota <ChevronDown className="w-3 h-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => startEmit('nfce')}>
            NFC-e (consumidor / balcão)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => startEmit('nfe')}>
            NF-e (empresa / com CNPJ)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!pending} onOpenChange={() => setPending(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />Cadastro fiscal incompleto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">
              Encontramos pendências que podem fazer a SEFAZ <strong>rejeitar</strong> a nota:
            </p>
            <ul className="space-y-1.5">
              {pending?.issues.map((iss, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-amber-500">•</span>{iss}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400">
              Recomendamos corrigir antes de emitir. Você pode tentar mesmo assim (a nota usará valores padrão),
              mas ela pode ser rejeitada ou sair com dados incorretos.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>Corrigir depois</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => doEmit(pending.tipo)}>
              Emitir mesmo assim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!indisponivel} onOpenChange={() => setIndisponivel(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-700">
              <AlertTriangle className="w-5 h-5" />
              {indisponivel === 'nfce' ? 'NFC-e' : 'NF-e'} ainda não disponível
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-gray-600">
            <p>
              A emissão de nota de <strong>peça</strong> ({indisponivel === 'nfce' ? 'NFC-e' : 'NF-e'})
              ainda não foi religada nesta versão do sistema.
            </p>
            <p>
              A nota de <strong>serviço (NFS-e)</strong> já funciona: use o botão
              <strong> Emitir NFS-e</strong> na ordem de serviço, pelo aplicativo instalado
              no computador da oficina.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIndisponivel(null)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
