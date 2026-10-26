import { CURRENCY } from "./wants";

const formatter = new Intl.NumberFormat("en-CA", { style: "currency", currency: CURRENCY });

/** Display integer cents as CAD, e.g. 14384 → "$143.84". */
export function formatPrice(cents: number): string {
  return formatter.format(cents / 100);
}

/**
 * Parse user-typed price text into integer cents. Accepts "143.84", "$143.84",
 * "1,299.00", "143,84" (comma decimal). Returns null when invalid.
 */
export function parsePriceToCents(raw: string): number | null {
  let text = raw.trim().replace(/[\s$]/g, "").replace(/^CAD/i, "").replace(/CAD$/i, "");
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
