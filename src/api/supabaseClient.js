import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Configuração do Supabase ausente. Defina VITE_SUPABASE_URL e ' +
    'VITE_SUPABASE_ANON_KEY (veja .env.example).',
  );
}

// Chave pública: o que protege os dados é a RLS no banco, não o segredo daqui.
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
