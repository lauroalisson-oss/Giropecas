// Resolve o atalho "@/" fora do Vite.
//
// O aplicativo importa como "@/lib/crm" — atalho que o Vite entende e o
// Node não. Sem isto, só dá para testar módulos que não usam o atalho, e
// a regra acaba sendo "escreva o código testável de um jeito diferente".
// Com isto, qualquer arquivo do app pode ser conferido direto.
//
// Uso: node --import ./supabase/tests/_alias.mjs supabase/tests/<teste>.mjs

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const RAIZ = pathToFileURL('/home/user/Giropecas/src/').href;

register('data:text/javascript,' + encodeURIComponent(`
  const RAIZ = ${JSON.stringify(RAIZ)};
  export async function resolve(especificador, contexto, proximo) {
    if (especificador.startsWith('@/')) {
      const alvo = RAIZ + especificador.slice(2);
      // O código do app omite a extensão; tenta as duas.
      for (const tentativa of [alvo, alvo + '.js', alvo + '.jsx']) {
        try { return await proximo(tentativa, contexto); } catch { /* tenta a próxima */ }
      }
    }
    return proximo(especificador, contexto);
  }
`), import.meta.url);
