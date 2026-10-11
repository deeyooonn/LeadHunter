export function normalizePhone(value: string): string | null {
  const trimmed = value.trim().replace(/(?:ext\.?|extension|x)\s*\d{1,6}$/i, '');
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('0063')) digits = digits.slice(2);
  if (/^63[2-9]\d{8,9}$/.test(digits)) return `+${digits}`;
  if (/^0[2-9]\d{8,9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  if (trimmed.startsWith('+') && /^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`;
  return null;
}
