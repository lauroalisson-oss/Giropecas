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

// A fonte da verdade é a flag no banco (profiles.is_super_admin), que a RLS
// também usa. O e-mail fica só como reserva para o primeiro acesso, antes de
// o perfil existir — comparar e-mail é frágil: quem criar conta com esse
// endereço viraria super-admin.
export function isSuperAdmin(user) {
  if (user?.is_super_admin === true) return true;
  if (user?.is_super_admin === false) return false;
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

// A data de vencimento é embutida na chave (dias desde 01/01/2026, 3 chars
// base-32). Assim o prazo conta a partir da GERAÇÃO da chave e vale igualmente
// no sistema online e no aplicativo offline.
const EPOCH_UTC = Date.UTC(2026, 0, 1);

function encodeExpiry(date) {
  const days = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - EPOCH_UTC) / 86400000);
  if (days < 0 || days > 32767) throw new Error('Data de vencimento fora do intervalo suportado.');
  return ALPHABET[(days >> 10) & 31] + ALPHABET[(days >> 5) & 31] + ALPHABET[days & 31];
}

function decodeExpiry(chars) {
  const i0 = ALPHABET.indexOf(chars[0]);
  const i1 = ALPHABET.indexOf(chars[1]);
  const i2 = ALPHABET.indexOf(chars[2]);
  if (i0 < 0 || i1 < 0 || i2 < 0) return null;
  const days = (i0 << 10) | (i1 << 5) | i2;
  const utc = new Date(EPOCH_UTC + days * 86400000);
  // Vence no fim do dia, no fuso local
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 23, 59, 59, 999);
}

// Retorna { key, expiresAt } — vencimento = hoje + durationDays
export function generateKey(durationDays) {
  const opt = DURATION_OPTIONS.find(o => o.days === Number(durationDays));
  if (!opt) throw new Error(`Duração inválida: ${durationDays}`);
  const now = new Date();
  const expiresAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + opt.days, 23, 59, 59, 999);
  const body = `GIRO-${opt.code}${encodeExpiry(expiresAt)}-${randomChars(4)}`;
  return { key: `${body}-${checksum(body)}`, expiresAt };
}

// Retorna { valid, key, durationDays, expiresAt, reason }
export function validateKeyFormat(input) {
  const key = normalizeKey(input);
  const m = key.match(/^GIRO-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})$/);
  if (!m) return { valid: false, reason: 'Formato inválido. Use GIRO-XXXX-XXXX-XXXX.' };
  const body = `GIRO-${m[1]}-${m[2]}`;
  if (checksum(body) !== m[3]) return { valid: false, reason: 'Chave inválida.' };
  const opt = DURATION_OPTIONS.find(o => o.code === m[1][0]);
  if (!opt) return { valid: false, reason: 'Chave inválida.' };
  const expiresAt = decodeExpiry(m[1].slice(1));
  if (!expiresAt) return { valid: false, reason: 'Chave inválida.' };
  return { valid: true, key, durationDays: opt.days, expiresAt };
}

export function isExpired(expiresAt) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now();
}

// Diferença em dias de calendário (0 = vence hoje)
export function daysRemaining(expiresAt) {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}
