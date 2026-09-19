// Ponto único de troca da migração Base44 -> Supabase.
//
// Todas as telas importam `base44` daqui. Mantendo o mesmo formato
// (`base44.entities.X.filter(...)`, `base44.auth.me()`), as ~180 chamadas
// espalhadas pelo app continuam funcionando sem alteração.
//
// O nome do módulo e da variável ficaram por compatibilidade; por baixo
// não há mais nada do Base44.

import { entities } from './entities';
import { auth } from './auth';
import { supabase } from './supabaseClient';

// Funções de servidor agora são endpoints no Vercel (/api/...), e não
// mais backend functions do Base44. Repassa o JWT para o servidor poder
// validar quem está chamando.
const functions = {
  async invoke(nome, payload = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(`/api/${nome}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    let corpo = null;
    try { corpo = await resp.json(); } catch { /* resposta sem JSON */ }

    if (!resp.ok) {
      const err = new Error(corpo?.error || `Falha ao chamar ${nome} (HTTP ${resp.status})`);
      err.status = resp.status;
      err.code = corpo?.code;
      err.data = corpo;
      throw err;
    }
    // O código chama como `const { data } = await invoke(...)`.
    return { data: corpo };
  },
};

export const base44 = { entities, auth, functions, supabase };
export { supabase };
