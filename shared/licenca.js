// Regras da licença que valem nos DOIS lados: no navegador (src/lib/license.js
// re-exporta daqui) e no servidor (api/_lib/nfse-regras.js).
//
// Estavam duplicadas, e a duplicata divergia: a tela e a rota podiam
// responder coisas diferentes sobre a mesma licença.

export const LIMITE_PADRAO_NOTAS = 100;

// Limite mensal de notas da licença.
//
// `Number(x) || 100` estava em quatro lugares — contexto da licença, tela
// da NFS-e, painel do provedor e a regra do servidor — e transformava 0 em
// 100: um plano com limite zero liberava cem notas. Zero é um limite
// legítimo (quem contratou sem emissão). Sem número nenhum, aí sim vale o
// padrão de 100.
// Atenção ao vazio: Number(null) e Number('') são 0, não NaN. Sem a
// primeira linha, "limite não definido" — que é o estado de toda licença
// não-fiscal do banco — viraria "zero notas" e bloquearia a emissão.
export function limiteDeNotas(valor) {
  if (valor === null || valor === undefined || valor === '') return LIMITE_PADRAO_NOTAS;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : LIMITE_PADRAO_NOTAS;
}
