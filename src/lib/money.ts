export const DEFAULT_CURRENCY = "CAD";

// Two-decimal currencies only: prices are stored in hundredths.
export const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "AUD", "CHF", "MXN"] as const;

/** Display a price stored in minor units, e.g. 14384 CAD → "$143.84". */
export function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * Parse user-typed price text into cents. Accepts "143.84", "$143.84",
 * "1,299.00", "143,84" (comma decimal). Returns null when invalid.
 */
export function parsePriceToCents(raw: string): number | null {
  let text = raw.trim().replace(/[\s$€£¥]/g, "");
  if (text === "") return null;
  // A lone comma followed by 1–2 digits at the end is a decimal separator.
  if (!text.includes(".") && /,\d{1,2}$/.test(text)) {
    text = text.replace(/,(\d{1,2})$/, ".$1");
  }
  text = text.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Inverse of parsePriceToCents for prefilling an edit form. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
