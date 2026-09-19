import React from 'react';
import { pendenciasCrediario } from '@/lib/crm';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

// Mostra se o cliente pode usar crediário e, quando não pode, o que falta.
//
// Dizer só "bloqueado" faria o balconista adivinhar o motivo. Listar a
// pendência resolve o atendimento na hora.
export default function StatusCrediario({ cliente, compacto = false }) {
  const faltas = pendenciasCrediario(cliente);
  const liberado = faltas.length === 0;

  if (compacto) {
    return liberado ? (
      <span className="inline-flex items-center gap-1 text-xs text-green-700">
        <ShieldCheck className="w-3 h-3" />Crediário liberado
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700" title={faltas.join(' • ')}>
        <AlertTriangle className="w-3 h-3" />Crediário bloqueado
      </span>
    );
  }

  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg border ${liberado
      ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
      {liberado
        ? <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
        : <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />}
      <div className="text-sm">
        {liberado ? (
          <p className="text-green-800">
            <strong>Crediário liberado.</strong> CPF e data de nascimento conferidos.
          </p>
        ) : (
          <>
            <p className="text-amber-900 font-medium">Crediário bloqueado</p>
            <ul className="text-amber-800 mt-1 space-y-0.5">
              {faltas.map(f => <li key={f}>• {f}</li>)}
            </ul>
            <p className="text-amber-700 text-xs mt-1.5">
              Os dois dados são opcionais no cadastro, mas obrigatórios para vender a prazo.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
