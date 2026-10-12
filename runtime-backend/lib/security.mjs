import crypto from 'node:crypto';

export function safeId(value, label = 'identifier') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(value)) {
    throw Object.assign(new Error(`Invalid ${label}. Use 1–80 letters, digits, dot, underscore, colon or hyphen; start with a letter/digit.`), { statusCode: 400 });
  }
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'item';
}

export function safeDomainName(value) {
  return typeof value === 'string' && /^nl-[a-z0-9][a-z0-9-]{0,59}$/.test(value);
}

export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  if (aa.length !== bb.length || aa.length === 0) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function xmlEscape(value) {
  return String(value).replace(/[<>&"']/g, (c) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' })[c]);
}

export function validMac(value) {
  return typeof value === 'string' && /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(value) && (parseInt(value.slice(0, 2), 16) & 1) === 0;
}

export function generatedMac() {
  return `52:54:00:${crypto.randomBytes(3).toString('hex').match(/../g).join(':')}`;
}