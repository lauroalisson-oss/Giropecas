// Oficina do usuário logado.
//
// O isolamento NÃO é mais feito aqui. Antes, este contexto trazia TODAS as
// empresas com Company.list() e filtrava no JavaScript — o que, com a chave
// pública do Supabase, permitiria a qualquer lojista ler os dados dos
// outros direto na API. Agora a RLS já devolve apenas o que o usuário pode
// ver: a própria oficina, ou todas no caso do super-admin.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isSuperAdmin } from '@/lib/license';

const CompanyContext = createContext(null);
const CHAVE_SELECAO = 'giropecas_company_id';

export function CompanyProvider({ children }) {
  const { user, isLoadingAuth } = useAuth();
  const [company, setCompany] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadCompany = useCallback(async () => {
    if (isLoadingAuth) return;
    if (!user) { setCompany(null); setCompanies([]); setLoading(false); return; }

    setLoading(true);
    try {
      // A RLS decide o escopo. Para o lojista vem só a oficina dele;
      // para o super-admin, todas.
      const visiveis = await base44.entities.Company.list('name');
      setCompanies(visiveis);

      if (visiveis.length === 0) { setCompany(null); return; }

      // O super-admin alterna entre oficinas; a escolha fica no navegador.
      const salvo = localStorage.getItem(CHAVE_SELECAO);
      const encontrado = salvo ? visiveis.find(c => c.id === salvo) : null;
      setCompany(encontrado || visiveis[0]);
    } catch (e) {
      console.error('Erro ao carregar a oficina:', e);
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, [user, isLoadingAuth]);

  useEffect(() => { loadCompany(); }, [loadCompany]);

  const switchCompany = useCallback((comp) => {
    if (!comp?.id) return;
    setCompany(comp);
    localStorage.setItem(CHAVE_SELECAO, comp.id);
  }, []);

  const value = {
    company,
    companies,
    setCompany,
    switchCompany,
    loading,
    reload: loadCompany,
    // Só o provedor alterna entre oficinas.
    podeAlternar: isSuperAdmin(user) && companies.length > 1,
  };

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany deve ser usado dentro de CompanyProvider');
  return ctx;
}
