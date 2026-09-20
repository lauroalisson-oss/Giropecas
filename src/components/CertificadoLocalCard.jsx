import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, Loader2, Monitor, FileKey, Trash2,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { ponteDesktop } from '@/lib/nfse';

// Certificado digital A1 da oficina.
//
// O certificado NÃO é enviado para o sistema. Ele é lido pelo aplicativo
// Giropeças instalado no computador da oficina, que guarda o arquivo no
// perfil daquela máquina e protege a senha com o cofre do Windows.
//
// Essa escolha não é só técnica: guardando o certificado só na oficina, o
// provedor não tem como assinar nada em nome dela — a responsabilidade
// pela nota fica com quem presta o serviço, que é como deve ser.
export default function CertificadoLocalCard() {
  const { toast } = useToast();
  const ponte = ponteDesktop();

  const [situacao, setSituacao] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [caminho, setCaminho] = useState(null);
  const [senha, setSenha] = useState('');
  const [salvando, setSalvando] = useState(false);

  const atualizar = useCallback(async () => {
    if (!ponte) { setCarregando(false); return; }
    try {
      const r = await ponte.situacaoCertificado();
      setSituacao(r?.ok ? r.dados : null);
    } catch {
      setSituacao(null);
    } finally {
      setCarregando(false);
    }
  }, [ponte]);

  useEffect(() => { atualizar(); }, [atualizar]);

  const escolher = async () => {
    const c = await ponte.escolherArquivo();
    if (c) setCaminho(c);
  };

  const salvar = async () => {
    if (!caminho) { toast({ title: 'Escolha o arquivo do certificado (.pfx)', variant: 'destructive' }); return; }
    if (!senha) { toast({ title: 'Informe a senha do certificado', variant: 'destructive' }); return; }
    setSalvando(true);
    try {
      // A senha é conferida agora, abrindo o certificado. Assim o erro
      // aparece aqui, e não no meio de uma emissão.
      const r = await ponte.salvarCertificado(caminho, senha);
      if (!r?.ok) throw new Error(r?.erro || 'Não foi possível ler o certificado.');
      setCaminho(null);
      setSenha('');
      await atualizar();
      toast({ title: 'Certificado configurado!', description: 'Este computador já pode emitir NFS-e.' });
    } catch (e) {
      toast({ title: 'Não foi possível configurar', description: e.message, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async () => {
    await ponte.removerCertificado();
    await atualizar();
    toast({ title: 'Certificado removido deste computador.' });
  };

  // --- Fora do aplicativo desktop ---------------------------------------
  if (!ponte) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />Certificado Digital A1
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Monitor className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900 space-y-1">
              <p className="font-medium">O certificado é configurado no computador da oficina.</p>
              <p>
                Abra o sistema pelo <strong>aplicativo Giropeças</strong> instalado naquela máquina
                e volte a esta tela para instalar o certificado A1.
              </p>
              <p className="text-blue-700">
                O arquivo e a senha ficam só lá — não são enviados ao sistema nem ao provedor.
                É por isso que a emissão da nota acontece por aquele computador.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Dentro do aplicativo desktop -------------------------------------
  const configurado = situacao?.configurado;
  const vencido = situacao?.expirado;
  const venceLogo = !vencido && Number(situacao?.diasParaVencer) <= 30;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />Certificado Digital A1
          <span className="text-xs font-normal text-gray-400">(neste computador)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />Verificando...
          </div>
        ) : configurado ? (
          <div className={`flex items-start gap-2 p-3 rounded-lg border ${
            vencido ? 'bg-red-50 border-red-200'
              : venceLogo ? 'bg-amber-50 border-amber-200'
                : 'bg-green-50 border-green-200'}`}
          >
            {vencido
              ? <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              : <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />}
            <div className="text-sm flex-1">
              <p className={`font-medium ${vencido ? 'text-red-800' : 'text-green-800'}`}>
                {vencido ? 'Certificado vencido' : 'Certificado instalado'}
              </p>
              {situacao.titular && (
                <p className="text-gray-600 mt-0.5 break-all">{situacao.titular}</p>
              )}
              {situacao.validoAte && (
                <p className={vencido ? 'text-red-700 mt-0.5' : venceLogo ? 'text-amber-700 mt-0.5' : 'text-green-700 mt-0.5'}>
                  Válido até {new Date(situacao.validoAte).toLocaleDateString('pt-BR')}
                  {!vencido && Number.isFinite(situacao.diasParaVencer)
                    && ` (${situacao.diasParaVencer} dia${situacao.diasParaVencer === 1 ? '' : 's'})`}
                  {venceLogo && ' — renove em breve'}
                </p>
              )}
              {!situacao.senhaGuardada && (
                <p className="text-amber-700 mt-1">
                  A senha não pôde ser guardada nesta máquina; ela será pedida a cada emissão.
                </p>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={remover}
              className="text-red-600 hover:bg-red-50 flex-shrink-0">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Instale o certificado <strong>A1 (.pfx)</strong> da oficina para poder emitir NFS-e.
              Ele fica guardado só neste computador.
            </p>
          </div>
        )}

        <div>
          <Label>Arquivo do certificado (.pfx)</Label>
          <button type="button" onClick={escolher}
            className="mt-1 w-full flex items-center gap-2 px-3 h-10 border rounded-md hover:bg-gray-50 text-sm text-gray-600 text-left">
            <FileKey className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{caminho || 'Escolher arquivo .pfx'}</span>
          </button>
        </div>
        <div>
          <Label>Senha do certificado</Label>
          <Input type="password" className="mt-1" value={senha} autoComplete="off"
            onChange={e => setSenha(e.target.value)} placeholder="••••••••"
            onKeyDown={e => { if (e.key === 'Enter') salvar(); }} />
        </div>

        <Button onClick={salvar} disabled={salvando}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
          {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
          {salvando ? 'Lendo o certificado...' : configurado ? 'Substituir certificado' : 'Instalar certificado'}
        </Button>

        <p className="text-xs text-gray-400">
          A senha é guardada protegida pelo Windows (DPAPI) e só pode ser lida
          por este usuário, nesta máquina. Nem o sistema nem o provedor têm acesso a ela.
        </p>
      </CardContent>
    </Card>
  );
}
