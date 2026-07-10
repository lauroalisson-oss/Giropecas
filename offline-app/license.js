// Lógica de licença do Giropeças Offline.
// MESMO algoritmo de src/lib/license.js do sistema online — as chaves geradas
// pelo super-admin no painel online funcionam também neste aplicativo offline.
(function (global) {
  'use strict';

  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const SECRET = 'GIROPECAS-LICENSE-2026-v1';

  const DURATION_OPTIONS = [
    { days: 3, code: 'A', label: '3 dias' },
    { days: 5, code: 'B', label: '5 dias' },
    { days: 15, code: 'C', label: '15 dias' },
    { days: 30, code: 'D', label: '30 dias' },
    { days: 90, code: 'E', label: '90 dias' },
    { days: 180, code: 'F', label: '6 meses' },
    { days: 365, code: 'G', label: '1 ano' },
  ];

  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function checksum(body) {
    const h1 = fnv1a(body + SECRET);
    const h2 = fnv1a(SECRET + body + h1.toString(16));
    let out = '';
    for (let i = 0; i < 4; i++) {
      const v = ((h1 >>> (i * 7)) ^ (h2 >>> (i * 5))) & 31;
      out += ALPHABET[v];
    }
    return out;
  }

  function normalizeKey(input) {
    const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (raw.length === 16 && raw.startsWith('GIRO')) {
      return 'GIRO-' + raw.slice(4, 8) + '-' + raw.slice(8, 12) + '-' + raw.slice(12, 16);
    }
    return raw;
  }

  // A data de vencimento vem embutida na chave (dias desde 01/01/2026,
  // 3 caracteres base-32) — o prazo conta a partir da geração da chave.
  var EPOCH_UTC = Date.UTC(2026, 0, 1);

  function decodeExpiry(chars) {
    var i0 = ALPHABET.indexOf(chars[0]);
    var i1 = ALPHABET.indexOf(chars[1]);
    var i2 = ALPHABET.indexOf(chars[2]);
    if (i0 < 0 || i1 < 0 || i2 < 0) return null;
    var days = (i0 << 10) | (i1 << 5) | i2;
    var utc = new Date(EPOCH_UTC + days * 86400000);
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 23, 59, 59, 999);
  }

  function validateKeyFormat(input) {
    const key = normalizeKey(input);
    const m = key.match(/^GIRO-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})$/);
    if (!m) return { valid: false, reason: 'Formato inválido. Use GIRO-XXXX-XXXX-XXXX.' };
    const body = 'GIRO-' + m[1] + '-' + m[2];
    if (checksum(body) !== m[3]) return { valid: false, reason: 'Chave inválida.' };
    const opt = DURATION_OPTIONS.find(o => o.code === m[1][0]);
    if (!opt) return { valid: false, reason: 'Chave inválida.' };
    const expiresAt = decodeExpiry(m[1].slice(1));
    if (!expiresAt) return { valid: false, reason: 'Chave inválida.' };
    return { valid: true, key: key, durationDays: opt.days, expiresAt: expiresAt };
  }

  function durationLabel(days) {
    const opt = DURATION_OPTIONS.find(o => o.days === Number(days));
    return opt ? opt.label : days + ' dias';
  }

  // Diferença em dias de calendário (0 = vence hoje)
  function daysRemaining(expiresAt) {
    if (!expiresAt) return 0;
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(ms / 86400000));
  }

  // --- Estado da licença neste dispositivo ---
  const LS_LICENSE = 'giropecas_offline_license';
  const LS_USED = 'giropecas_offline_used_keys';

  function getLicense() {
    try { return JSON.parse(localStorage.getItem(LS_LICENSE)); } catch (e) { return null; }
  }

  function isLicensed() {
    const lic = getLicense();
    return !!(lic && lic.expiresAt && new Date(lic.expiresAt).getTime() > Date.now());
  }

  function isExpired() {
    const lic = getLicense();
    return !!(lic && lic.expiresAt && new Date(lic.expiresAt).getTime() <= Date.now());
  }

  function usedKeys() {
    try { return JSON.parse(localStorage.getItem(LS_USED)) || []; } catch (e) { return []; }
  }

  // Ativa uma chave neste dispositivo. O vencimento vem embutido na chave
  // (conta a partir da geração), portanto chave vencida não ativa.
  function activate(input) {
    const check = validateKeyFormat(input);
    if (!check.valid) return { ok: false, reason: check.reason };

    if (check.expiresAt.getTime() <= Date.now()) {
      return {
        ok: false,
        reason: 'Esta chave venceu em ' + check.expiresAt.toLocaleDateString('pt-BR') + '. Solicite uma nova chave.',
      };
    }

    const current = getLicense();
    if (current && current.key === check.key && new Date(current.expiresAt).getTime() > Date.now()) {
      return { ok: true, license: current };
    }
    if (usedKeys().indexOf(check.key) !== -1) {
      return { ok: false, reason: 'Esta chave já foi utilizada neste dispositivo. Solicite uma nova chave.' };
    }

    const activatedAt = new Date();
    const expiresAt = check.expiresAt;

    const license = {
      key: check.key,
      durationDays: check.durationDays,
      activatedAt: activatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    localStorage.setItem(LS_LICENSE, JSON.stringify(license));
    const used = usedKeys();
    used.push(check.key);
    localStorage.setItem(LS_USED, JSON.stringify(used));
    return { ok: true, license: license };
  }

  global.GiroLicense = {
    DURATION_OPTIONS: DURATION_OPTIONS,
    normalizeKey: normalizeKey,
    validateKeyFormat: validateKeyFormat,
    durationLabel: durationLabel,
    daysRemaining: daysRemaining,
    getLicense: getLicense,
    isLicensed: isLicensed,
    isExpired: isExpired,
    activate: activate,
  };
})(window);
