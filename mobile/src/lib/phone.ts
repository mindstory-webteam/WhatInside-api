/**
 * Indian mobile numbers (the app's default country). Users type the 10 digits; we show
 * "+91" as a fixed prefix and send E.164 ("+919876543210") to the API, which accepts
 * other formats too.
 */
export const COUNTRY_CODE = '+91';

/** Keep only the national digits: "+91 98765-43210" → "9876543210". */
export function nationalDigits(input: string): string {
  let d = (input || '').replace(/\D/g, '');
  if (d.startsWith('0091')) d = d.slice(4);
  else if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return d.slice(0, 10);
}

export const isValidMobile = (input: string) => /^[6-9]\d{9}$/.test(nationalDigits(input));

export function toE164(input: string): string {
  return `${COUNTRY_CODE}${nationalDigits(input)}`;
}

/** "9876543210" → "98765 43210" while typing. */
export function formatNational(input: string): string {
  const d = nationalDigits(input);
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}

/** "+919876543210" → "+91 98765 43210" for display. */
export function formatPhone(e164?: string | null): string {
  if (!e164) return '';
  if (e164.startsWith(COUNTRY_CODE) && e164.length === 13) return `${COUNTRY_CODE} ${formatNational(e164.slice(3))}`;
  return e164;
}
