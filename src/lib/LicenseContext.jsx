// Licença da oficina.
//
// Sistema FECHADO: o lojista não digita chave nenhuma. O provedor cria a
// licença já ativa ao provisionar a empresa, com plano, limite de notas e
// validade. Quando vence, o acesso é bloqueado e a renovação é solicitada
// ao provedor — não há renovação self-service.
//
// A leitura é filtrada por RLS: a política de access_keys só devolve a
// licença do próprio usuário (ou todas, para o super-admin).

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isSuperAdmin, isExpired } from '@/lib/license';

const LicenseContext = createContext(null);

// status: 'loading' | 'licensed' | 'unlicensed' | 'expired'
export function LicenseProvider({ children }) {
  const { user, isLoadingAuth } = useAuth();
  const [status, setStatus] = useState('loading');
  const [license, setLicense] = useState(null);
  const superAdmin = isSuperAdmin(user);

  const refresh = useCallback(async () => {
    if (isLoadingAuth) return;
    if (!user) { setStatus('unlicensed'); setLicense(null); return; }

    // O provedor não é um inquilino: tem acesso total e não possui licença.
    if (isSuperAdmin(user)) {
      setStatus('licensed');
      setLicense(null);
      return;
    }

    setStatus('loading');
    try {
      // A RLS já limita ao que é do usuário; a ordenação pega a mais recente.
      const chaves = await base44.entities.AccessKey.filter(
        { activated_by: user.email }, '-expires_at',
      );
      const ativa = chaves.find(k => k.status === 'active') || chaves[0] || null;

      if (!ativa) {
        setLicense(null);
        setStatus('unlicensed');
        return;
      }

      setLicense(ativa);

      if (ativa.status === 'revoked') { setStatus('expired'); return; }

      if (isExpired(ativa.expires_at)) {
        // Marca como vencida (melhor esforço — a política permite ao dono
        // atualizar a própria chave). Se falhar, o bloqueio vale do mesmo jeito.
        if (ativa.status !== 'expired') {
          try { await base44.entities.AccessKey.update(ativa.id, { status: 'expired' }); } catch { /* ignore */ }
        }
        setStatus('expired');
        return;
      }

      setStatus(ativa.status === 'active' ? 'licensed' : 'unlicensed');
    } catch (e) {
      console.error('Erro ao verificar a licença:', e);
      setLicense(null);
      setStatus('unlicensed');
    }
  }, [user, isLoadingAuth]);

  useEffect(() => { refresh(); }, [refresh]);

  // Plano e limite vêm da LICENÇA ativa (fonte da verdade do período).
  const planType = superAdmin ? 'fiscal' : (license?.plan_type || 'non_fiscal');
  const noteLimit = superAdmin ? Infinity : (license?.fiscal_note_limit || 100);
  const isFiscal = planType === 'fiscal';

  const value = {
    status, license, superAdmin, planType, noteLimit, isFiscal, refresh,
    // Dias restantes, para o aviso de vencimento próximo.
    diasRestantes: license?.expires_at
      ? Math.ceil((new Date(license.expires_at) - Date.now()) / 86400000)
      : null,
  };

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense() {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error('useLicense deve ser usado dentro de LicenseProvider');
  return ctx;
}
