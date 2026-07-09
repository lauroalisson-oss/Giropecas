// Lógica central do sistema de chaves de acesso (licenças) do Giropeças.
// O mesmo algoritmo de geração/validação é usado pelo aplicativo offline
// (offline-app/license.js) — mantenha os dois arquivos em sincronia.

export const SUPER_ADMIN_EMAIL = 'lauro.alisson@gmail.com';

// Alfabeto de 32 caracteres sem os ambíguos (0/O, 1/I)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SECRET = 'GIROPECAS-LICENSE-2026-v1';

export const DURATION_OPTIONS = [
  { days: 3, code: 'A', label: '3 dias' },
  { days: 5, code: 'B', label: '5 dias' },
  { days: 15, code: 'C', label: '15 dias' },
  { days: 30, code: 'D', label: '30 dias' },
  { days: 90, code: 'E', label: '90 dias' },
  { days: 180, code: 'F', label: '6 meses' },
  { days: 365, code: 'G', label: '1 ano' },
];

export function isSuperAdmin(user) {
  return (user?.email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function durationLabel(days) {
  const opt = DURATION_OPTIONS.find(o => o.days === Number(days));
  return opt ? opt.label : `${days} dias`;
}

// FNV-1a 32 bits
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

function randomChars(n) {
  let out = '';
  const arr = new Uint32Array(n);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 0xffffffff);
  }
  for (let i = 0; i < n; i++) out += ALPHABET[arr[i] % ALPHABET.length];
  return out;
}

export function normalizeKey(input) {
  const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length === 16 && raw.startsWith('GIRO')) {
    return `GIRO-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
  }
  return raw;
}

export function generateKey(durationDays) {
  const opt = DURATION_OPTIONS.find(o => o.days === Number(durationDays));
  if (!opt) throw new Error(`Duração inválida: ${durationDays}`);
  const body = `GIRO-${opt.code}${randomChars(3)}-${randomChars(4)}`;
  return `${body}-${checksum(body)}`;
}

// Retorna { valid, durationDays, reason }
export function validateKeyFormat(input) {
  const key = normalizeKey(input);
  const m = key.match(/^GIRO-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})$/);
  if (!m) return { valid: false, reason: 'Formato inválido. Use GIRO-XXXX-XXXX-XXXX.' };
  const body = `GIRO-${m[1]}-${m[2]}`;
  if (checksum(body) !== m[3]) return { valid: false, reason: 'Chave inválida.' };
  const opt = DURATION_OPTIONS.find(o => o.code === m[1][0]);
  if (!opt) return { valid: false, reason: 'Chave inválida.' };
  return { valid: true, key, durationDays: opt.days };
}

export function computeExpiry(activatedAt, durationDays) {
  const d = new Date(activatedAt);
  d.setDate(d.getDate() + Number(durationDays));
  return d;
}

export function isExpired(expiresAt) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now();
}

export function daysRemaining(expiresAt) {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
