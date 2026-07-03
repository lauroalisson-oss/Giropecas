import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const CompanyContext = createContext(null);

export function CompanyProvider({ children }) {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCompany();
  }, []);

  const loadCompany = async () => {
    try {
      const user = await base44.auth.me();
      if (!user) { setLoading(false); return; }
      
      // Try to find the user's company
      const companies = await base44.entities.Company.list();
      if (companies.length > 0) {
        // For admin/super-admin, use stored company or first one
        const storedId = localStorage.getItem('motogestao_company_id');
        const found = storedId ? companies.find(c => c.id === storedId) : null;
        setCompany(found || companies[0]);
      }
    } catch (e) {
      console.error('Error loading company:', e);
    } finally {
      setLoading(false);
    }
  };

  const switchCompany = (comp) => {
    setCompany(comp);
    localStorage.setItem('motogestao_company_id', comp.id);
  };

  return (
    <CompanyContext.Provider value={{ company, setCompany, switchCompany, loading, reload: loadCompany }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}