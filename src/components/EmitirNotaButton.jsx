import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileText, Loader2, ChevronDown } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useCompany } from '@/lib/CompanyContext';
import { emitirNota, NFE_STATUS_LABEL } from '@/lib/fiscal';

// Botão de emissão fiscal reutilizável.
// Props: saleId | workOrderId, e onEmitted(callback opcional).
export default function EmitirNotaButton({ saleId, workOrderId, size = 'sm', onEmitted }) {
  const { company } = useCompany();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!company?.nfe_enabled) return null;

  const handleEmit = async (tipo) => {
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant="outline" disabled={loading} className="border-blue-200 text-blue-700 hover:bg-blue-50">
          {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
          Emitir Nota <ChevronDown className="w-3 h-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleEmit('nfce')}>
          NFC-e (consumidor / balcão)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleEmit('nfe')}>
          NF-e (empresa / com CNPJ)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
