import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Receipt, Loader2, AlertTriangle, Monitor, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useLicense } from '@/lib/LicenseContext';
import { emitirNfse, temPonteDesktop, situacaoCertificado, AVISO_SEM_PONTE } from '@/lib/nfse';

// Emissão da NFS-e (nota de serviço) de uma OS.
//
// O botão só aparece no plano Fiscal. Fora do aplicativo desktop ele
// aparece desabilitado e explica o porquê, em vez de sumir: o lojista
// precisa saber que a emissão existe e onde fazê-la.
export default function EmitirNfseButton({ workOrderId, temServicos = true, size = 'sm', onEmitted }) {
  const { isFiscal } = useLicense();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [etapa, setEtapa] = useState('');
  const [aviso, setAviso] = useState(null);      // texto do diálogo explicativo
  const [certificado, setCertificado] = useState(null);

  const noDesktop = temPonteDesktop();

  useEffect(() => {
    if (!noDesktop || !isFiscal) return;
    situacaoCertificado().then(setCertificado).catch(() => setCertificado(null));
  }, [noDesktop, isFiscal]);

  if (!isFiscal) return null;

  const emitir = async () => {
    setLoading(true);
    try {
      const r = await emitirNfse(workOrderId, setEtapa);
      toast({
        title: 'NFS-e autorizada!',
        description: `Nota ${r.numero} — chave ${r.chaveAcesso}`
          + (r.ambiente === 'homologacao' ? ' (ambiente de teste)' : ''),
      });
      onEmitted?.(r);
    } catch (e) {
      toast({ title: 'Não foi possível emitir', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      setEtapa('');
    }
  };

  // Fora do desktop, ou sem certificado, o clique explica em vez de falhar.
  const aoClicar = () => {
    if (!noDesktop) return setAviso('ponte');
    if (certificado && !certificado.configurado) return setAviso('certificado');
    if (certificado?.expirado) return setAviso('vencido');
    if (!temServicos) return setAviso('sem-servicos');
    emitir();
  };

  const TEXTOS = {
    'ponte': {
      titulo: 'Emita pelo computador da oficina',
      icone: <Monitor className="w-5 h-5" />,
      corpo: AVISO_SEM_PONTE,
      extra: 'O certificado digital fica guardado só naquela máquina — nem o sistema '
        + 'nem o provedor têm acesso a ele. É isso que mantém a responsabilidade da '
        + 'nota com a oficina.',
    },
    'certificado': {
      titulo: 'Certificado digital não configurado',
      icone: <AlertTriangle className="w-5 h-5" />,
      corpo: 'Este computador ainda não tem o certificado A1 da oficina instalado no sistema.',
      extra: 'Vá em Configurações → Certificado digital, escolha o arquivo .pfx e informe a senha.',
    },
    'vencido': {
      titulo: 'Certificado digital vencido',
      icone: <AlertTriangle className="w-5 h-5" />,
      corpo: 'O certificado instalado neste computador está fora da validade, então o '
        + 'Sefin recusaria a conexão.',
      extra: 'Renove o certificado A1 com a sua certificadora e instale o arquivo novo '
        + 'em Configurações → Certificado digital.',
    },
    'sem-servicos': {
      titulo: 'Esta OS não tem serviços',
      icone: <AlertTriangle className="w-5 h-5" />,
      corpo: 'A NFS-e é a nota da mão de obra. Esta ordem só tem peças.',
      extra: 'Peças são vendidas com NF-e/NFC-e, que é outro documento.',
    },
  };
  const texto = aviso ? TEXTOS[aviso] : null;

  const certOk = noDesktop && certificado?.configurado && !certificado?.expirado;

  return (
    <>
      <Button
        size={size}
        variant="outline"
        onClick={aoClicar}
        disabled={loading}
        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
        title={noDesktop ? 'Emitir NFS-e desta OS' : AVISO_SEM_PONTE}
      >
        {loading
          ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          : <Receipt className="w-4 h-4 mr-1" />}
        {loading ? (etapa || 'Emitindo...') : 'Emitir NFS-e'}
        {certOk && !loading && <CheckCircle2 className="w-3 h-3 ml-1 text-emerald-500" />}
      </Button>

      <Dialog open={!!aviso} onOpenChange={() => setAviso(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              {texto?.icone}{texto?.titulo}
            </DialogTitle>
            <DialogDescription className="pt-2 text-gray-600">{texto?.corpo}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-gray-500">{texto?.extra}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAviso(null)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
