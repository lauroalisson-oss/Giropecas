import { perfil } from './perfil.js';
export function LicenseProvider({ children }) { return children; }
export function useLicense() { return { refresh: async () => {}, ...perfil().licenca }; }
