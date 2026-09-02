/** Sri Lanka country code, fixed across every phone input in the app. */
export const PHONE_COUNTRY_CODE = "+94";

/** Strips a leading "+94"/"94"/"0" so an existing stored number (e.g.
 *  "+94771234567") can populate a "local digits only" input that already
 *  shows the +94 prefix as a fixed badge. */
export function stripCountryCode(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("94")) return digits.slice(2);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** Combines the fixed +94 prefix with whatever local digits the user typed.
 *  Tolerant of a stray leading "0"/"94" so a pasted or reviewer-typed number
 *  in local dialing form (e.g. "0764829645") still resolves to the correct
 *  E.164 value instead of silently producing a mismatched phone number. */
export function toE164(localDigits: string): string {
  return `${PHONE_COUNTRY_CODE}${stripCountryCode(localDigits)}`;
}

/** Formats a stored phone number for display, grouped for readability
 *  ("+94 76 467 8229") — Supabase stores it as E.164 digits only (no "+" or
 *  spacing), so a raw display would silently drop the country-code prefix
 *  and read as one long digit string. Falls back to a plain "+"-prefixed
 *  string for numbers that aren't a standard 9-digit Sri Lankan local number
 *  (e.g. malformed data) so nothing is ever hidden. */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("94") ? digits.slice(2) : digits;
  if (local.length === 9) {
    return `+94 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 9)}`;
  }
  return phone.startsWith("+") ? phone : `+${phone}`;
}
