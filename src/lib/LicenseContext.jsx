import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import {
  isSuperAdmin, validateKeyFormat, isExpired,
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
    // O vencimento é fixado na geração da chave (embutido no código)
    const expiresAt = record.expires_at || (check.expiresAt && check.expiresAt.toISOString());
    if (record.status === 'expired' || isExpired(expiresAt)) throw new Error('Esta chave já venceu. Solicite uma nova chave.');
    if (record.status === 'active') {
      if (record.activated_by === user.email) {
        setLicense(record);
        setStatus('licensed');
        return record;
      }
      throw new Error('Esta chave já foi utilizada.');
    }
    if (record.status !== 'available') throw new Error('Esta chave não está disponível.');

    const activatedAt = new Date();
    await base44.entities.AccessKey.update(record.id, {
      status: 'active',
      activated_by: user.email,
      activated_at: activatedAt.toISOString(),
      expires_at: expiresAt,
    });
    const updated = { ...record, status: 'active', activated_by: user.email, activated_at: activatedAt.toISOString(), expires_at: expiresAt };
    setLicense(updated);
    setStatus('licensed');
    return updated;
  }, [user]);

  // Plano e limite vêm da LICENÇA ativa (fonte da verdade do período).
  // Super-admin (provedor) tem acesso total.
  const planType = superAdmin ? 'fiscal' : (license?.plan_type || 'non_fiscal');
  const noteLimit = superAdmin ? Infinity : (license?.fiscal_note_limit || 100);
  const isFiscal = planType === 'fiscal';

  return (
    <LicenseContext.Provider value={{ status, license, superAdmin, planType, noteLimit, isFiscal, activateKey, refresh }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error('useLicense deve ser usado dentro de LicenseProvider');
  return ctx;
}
