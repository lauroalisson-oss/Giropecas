import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useLicense } from '@/lib/LicenseContext';
import { isSuperAdmin } from '@/lib/license';

const CompanyContext = createContext(null);

export function CompanyProvider({ children }) {
  const { license } = useLicense();
  const [company, setCompany] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadCompany = useCallback(async () => {
    try {
      const user = await base44.auth.me();
      if (!user) { setLoading(false); return; }

      const all = await base44.entities.Company.list();
      const superAdmin = isSuperAdmin(user);

      // Isolamento multi-empresa: usuário comum só enxerga a própria empresa
      // (a que ele criou ou a vinculada à sua chave de acesso).
      // O super-admin enxerga e pode alternar entre todas.
      let scoped;
      if (superAdmin) {
        scoped = all;
      } else {
        scoped = all.filter(c =>
          c.created_by === user.email || (license?.company_id && c.id === license.company_id)
        );
      }
      setCompanies(scoped);

      if (scoped.length > 0) {
        const storedId = localStorage.getItem('motogestao_company_id');
        const found = storedId ? scoped.find(c => c.id === storedId) : null;
        const selected = found || scoped[0];
        setCompany(selected);

        // Vincula a empresa à chave de acesso (para o painel do super-admin)
        if (!superAdmin && license?.id && !license.company_id) {
          try { await base44.entities.AccessKey.update(license.id, { company_id: selected.id }); } catch { /* ignore */ }
        }

        // Sincroniza o plano e o grau de permissão da empresa com a licença ativa.
        // Fonte da verdade é a chave gerada pelo super-admin.
        if (!superAdmin && license?.plan_type) {
          const patch = {};
          if (selected.plan_type !== license.plan_type) patch.plan_type = license.plan_type;
          if (license.plan_type === 'fiscal') {
            const limiteLicenca = license.fiscal_note_limit || 100;
            if (selected.fiscal_note_limit !== limiteLicenca) patch.fiscal_note_limit = limiteLicenca;
            // Módulo fiscal habilitado por concessão do super-admin
            if (selected.nfe_enabled !== true) patch.nfe_enabled = true;
          } else if (selected.nfe_enabled) {
            // Downgrade para Não-Fiscal: desliga o módulo
            patch.nfe_enabled = false;
          }
          if (Object.keys(patch).length) {
            try {
              await base44.entities.Company.update(selected.id, patch);
              Object.assign(selected, patch);
              setCompany({ ...selected });
            } catch { /* ignore */ }
          }
        }
      } else {
        setCompany(null);
      }
    } catch (e) {
      console.error('Error loading company:', e);
    } finally {
      setLoading(false);
    }
  }, [license]);

  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

  const switchCompany = (comp) => {
    setCompany(comp);
    localStorage.setItem('motogestao_company_id', comp.id);
  };

  return (
    <CompanyContext.Provider value={{ company, companies, setCompany, switchCompany, loading, reload: loadCompany }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
