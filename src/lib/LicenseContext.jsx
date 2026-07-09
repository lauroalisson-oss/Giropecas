import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import {
  isSuperAdmin, validateKeyFormat, computeExpiry, isExpired,
} from '@/lib/license';

const LicenseContext = createContext(null);

// status: 'loading' | 'licensed' | 'unlicensed' | 'expired'
export function LicenseProvider({ children }) {
  const { user } = useAuth();
  const [status, setStatus] = useState('loading');
  const [license, setLicense] = useState(null);
  const superAdmin = isSuperAdmin(user);

  const refresh = useCallback(async () => {
    if (!user) return;
    if (isSuperAdmin(user)) {
      setStatus('licensed');
      setLicense(null);
      return;
    }
    setStatus('loading');
    try {
      const keys = await base44.entities.AccessKey.filter({ activated_by: user.email });
      const active = keys
        .filter(k => k.status === 'active')
        .sort((a, b) => new Date(b.expires_at) - new Date(a.expires_at));
      const current = active[0] || null;
      if (current && !isExpired(current.expires_at)) {
        setLicense(current);
        setStatus('licensed');
      } else if (current) {
        // Marca como expirada (melhor esforço, apenas para o painel do admin)
        try { await base44.entities.AccessKey.update(current.id, { status: 'expired' }); } catch { /* ignore */ }
        setLicense(current);
        setStatus('expired');
      } else {
        setLicense(null);
        setStatus('unlicensed');
      }
    } catch (e) {
      console.error('Erro ao verificar licença:', e);
      setLicense(null);
      setStatus('unlicensed');
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const activateKey = useCallback(async (input) => {
    if (!user) throw new Error('Usuário não autenticado.');
    const check = validateKeyFormat(input);
    if (!check.valid) throw new Error(check.reason);

    const rows = await base44.entities.AccessKey.filter({ key: check.key });
    if (!rows.length) throw new Error('Chave não encontrada. Solicite uma chave ao administrador.');
    const record = rows[0];

    if (record.status === 'revoked') throw new Error('Esta chave foi revogada.');
    if (record.status === 'expired') throw new Error('Esta chave já expirou.');
    if (record.status === 'active') {
      if (record.activated_by === user.email && !isExpired(record.expires_at)) {
        setLicense(record);
        setStatus('licensed');
        return record;
      }
      throw new Error('Esta chave já foi utilizada.');
    }
    if (record.status !== 'available') throw new Error('Esta chave não está disponível.');

    const activatedAt = new Date();
    const expiresAt = computeExpiry(activatedAt, record.duration_days);
    await base44.entities.AccessKey.update(record.id, {
      status: 'active',
      activated_by: user.email,
      activated_at: activatedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
    const updated = { ...record, status: 'active', activated_by: user.email, activated_at: activatedAt.toISOString(), expires_at: expiresAt.toISOString() };
    setLicense(updated);
    setStatus('licensed');
    return updated;
  }, [user]);

  return (
    <LicenseContext.Provider value={{ status, license, superAdmin, activateKey, refresh }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error('useLicense deve ser usado dentro de LicenseProvider');
  return ctx;
}
