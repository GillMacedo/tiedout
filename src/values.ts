// Amounts are integer minor units (cents), so sums never pick up float errors.
export function parseAmount(raw: string): number | undefined {
  let text = raw.trim();
  if (!text) return undefined;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[A-Za-z$€£¥R\s ']/g, "");
  if (/^[-−]/.test(text)) {
    negative = !negative;
    text = text.slice(1);
  } else if (/[-−]$/.test(text)) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  if (!/^[\d.,]*\d[\d.,]*$/.test(text)) return undefined;

  // The last separator is the decimal mark only if 1 or 2 digits follow it.
  const decimal = text.match(/[.,](\d{1,2})$/);
  const whole = (decimal ? text.slice(0, -decimal[0].length) : text).replace(/[.,]/g, "");
  const fraction = (decimal?.[1] ?? "").padEnd(2, "0");
  const cents = Number(whole || "0") * 100 + Number(fraction);
  if (!Number.isSafeInteger(cents)) return undefined;
  return negative && cents !== 0 ? -cents : cents;
}

export function formatAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export type DateFormat = "ymd" | "dmy" | "mdy";

const SLASHED = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/;
const ISO = /^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?:[T ].*)?$/;

// Picks day-first or month-first from the whole column. A column where every
// date could be either returns undefined: guessing would shift dates silently.
export function detectDateFormat(values: string[]): DateFormat | undefined {
  let dayFirst = false;
  let monthFirst = false;
  let slashed = false;
  for (const value of values) {
    const match = value.trim().match(SLASHED);
    if (!match) continue;
    slashed = true;
    if (Number(match[1]) > 12) dayFirst = true;
    if (Number(match[2]) > 12) monthFirst = true;
  }
  if (!slashed) return "ymd";
  if (dayFirst === monthFirst) return undefined;
  return dayFirst ? "dmy" : "mdy";
}

export function parseDate(raw: string, format: DateFormat | undefined): string | undefined {
  const text = raw.trim();
  let year: number, month: number, day: number;
  const iso = text.match(ISO);
  const slashed = text.match(SLASHED);
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (slashed && format && format !== "ymd") {
    const [first, second] = [Number(slashed[1]), Number(slashed[2])];
    [day, month] = format === "dmy" ? [first, second] : [second, first];
    year = Number(slashed[3]);
    if (year < 100) year += 2000;
  } else {
    return undefined;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
