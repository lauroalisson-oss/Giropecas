import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Lock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

const MINIMO = 8;

// Regras propositalmente simples: o lojista digita isso uma vez, no balcão.
// Exigir símbolo costuma gerar senha anotada em papel.
function avaliar(senha) {
  const problemas = [];
  if (senha.length < MINIMO) problemas.push(`ter pelo menos ${MINIMO} caracteres`);
  if (!/[a-zA-Z]/.test(senha)) problemas.push('conter ao menos uma letra');
  if (!/[0-9]/.test(senha)) problemas.push('conter ao menos um número');
  return problemas;
}

export default function TrocarSenha() {
  const { user, trocarSenha, logout } = useAuth();
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const problemas = avaliar(senha);
  const confere = senha.length > 0 && senha === confirma;
  const podeEnviar = problemas.length === 0 && confere && !enviando;

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    if (!confere) { setErro('As duas senhas não são iguais.'); return; }
    if (problemas.length) { setErro(`A senha precisa ${problemas.join(', ')}.`); return; }
    setEnviando(true);
    try {
      await trocarSenha(senha);
      // O PasswordGate solta o acesso assim que must_change_password virar false.
    } catch (err) {
      setErro(err.message || 'Não foi possível alterar a senha.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Crie sua senha</h1>
          <p className="text-gray-500 text-sm mt-1">
            Você entrou com uma senha temporária. Defina a sua senha definitiva para continuar.
          </p>
        </div>

        <form onSubmit={enviar} className="bg-white border rounded-xl p-6 space-y-4">
          {user?.email && (
            <p className="text-xs text-gray-500 pb-1 border-b">Acesso: <strong>{user.email}</strong></p>
          )}

          <div>
            <Label htmlFor="senha">Nova senha</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input id="senha" type="password" className="pl-9" value={senha} autoComplete="new-password"
                onChange={e => setSenha(e.target.value)} placeholder="••••••••" required />
            </div>
            {senha.length > 0 && problemas.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">Precisa {problemas.join(', ')}.</p>
            )}
          </div>

          <div>
            <Label htmlFor="confirma">Repita a nova senha</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input id="confirma" type="password" className="pl-9" value={confirma} autoComplete="new-password"
                onChange={e => setConfirma(e.target.value)} placeholder="••••••••" required />
            </div>
            {confirma.length > 0 && !confere && (
              <p className="text-xs text-red-600 mt-1">As senhas não conferem.</p>
            )}
            {confere && problemas.length === 0 && (
              <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />Senha pronta
              </p>
            )}
          </div>

          {erro && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{erro}</p>
            </div>
          )}

          <Button type="submit" disabled={!podeEnviar} className="w-full bg-red-600 hover:bg-red-700 text-white">
            {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {enviando ? 'Salvando...' : 'Salvar e continuar'}
          </Button>

          <button type="button" onClick={logout}
            className="w-full text-xs text-gray-400 hover:text-gray-600">
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
