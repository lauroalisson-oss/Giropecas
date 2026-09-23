// Resolve, fora do Vite, os dois atalhos que o app usa nos imports.
//
// O aplicativo escreve "@/lib/crm" (atalho do Vite) e "./nfse-dados"
// (sem extensão). O Node não aceita nenhum dos dois. Sem isto só dá para
// testar módulo que evite os dois — e a regra acabaria sendo "escreva o
// código testável de um jeito diferente". Com isto, qualquer arquivo do
// app pode ser conferido direto.
//
// Uso: node --import ./supabase/tests/_alias.mjs supabase/tests/<teste>.mjs
// (o runner, rodar.mjs, já passa isso sozinho)

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const RAIZ = pathToFileURL('/home/user/Giropecas/src/').href;

// Escrito como string separada para o escape das expressões regulares
// não se perder dentro do template literal.
const HOOK = [
  'const RAIZ = ' + JSON.stringify(RAIZ) + ';',
  '',
  '// "Sem extensão" é o último segmento não terminar em .js/.jsx/.json.',
  '// Cuidado: "./nfse-dados" tem ponto no começo, e isso não é extensão.',
  'function semExtensao(caminho) {',
  '  const ultimo = caminho.split("/").pop() || "";',
  '  return !(/\\.[A-Za-z0-9]+$/.test(ultimo));',
  '}',
  '',
  'export async function resolve(especificador, contexto, proximo) {',
  '  const atalho = especificador.startsWith("@/");',
  '  const relativo = especificador.startsWith(".")',
  '    || especificador.startsWith("/")',
  '    || especificador.startsWith("file:");',
  '',
  '  const alvo = atalho ? RAIZ + especificador.slice(2) : especificador;',
  '',
  '  const tentativas = (atalho || relativo) && semExtensao(alvo)',
  '    ? [alvo + ".js", alvo + ".jsx", alvo]',
  '    : [alvo];',
  '',
  '  for (const t of tentativas) {',
  '    try { return await proximo(t, contexto); } catch { /* tenta a próxima */ }',
  '  }',
  '  return proximo(especificador, contexto);',
  '}',
].join('\n');

register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);
