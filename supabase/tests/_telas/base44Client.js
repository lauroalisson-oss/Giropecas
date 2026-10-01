// Simulado: nenhuma tela chama o banco durante o desenho inicial (as
// buscas ficam em useEffect, que não roda aqui). Se alguma chamar, recebe
// listas vazias em vez de quebrar por falta de rede.
const entidade = () => new Proxy({}, {
  get: (_, op) => async () => (op === 'get' ? null : []),
});
export const base44 = {
  entities: new Proxy({}, { get: () => entidade() }),
  auth: { me: async () => null, onAuthStateChange: () => () => {} },
  functions: { invoke: async () => ({ data: null }) },
  supabase: { rpc: async () => ({ data: null, error: null }), auth: { getSession: async () => ({ data: {} }) } },
};
export default base44;
