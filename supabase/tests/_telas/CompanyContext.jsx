import { perfil } from './perfil.js';
export function CompanyProvider({ children }) { return children; }
export function useCompany() {
  const p = perfil();
  return {
    company: p.company, companies: p.companies || [], setCompany: () => {}, switchCompany: () => {},
    sairDaOficina: () => {}, loading: false, reload: async () => {},
    ehProvedor: !!p.user?.is_super_admin, podeAlternar: !!p.user?.is_super_admin,
  };
}
