import type { BankLine, Invoice } from "./load.ts";
import { daysBetween, formatAmount } from "./values.ts";

export type Mode = "receivable" | "payable";

export interface Pair {
  line: BankLine;
  invoices: Invoice[];
  reason: string;
}

export interface Reconciliation {
  matched: Pair[];
  likely: Pair[];
  review: Pair[];
  unmatchedLines: BankLine[];
  openInvoices: Invoice[];
  ignoredLines: number;
  warnings: string[];
}

export interface MatchOptions {
  mode?: Mode;
  windowDays?: number;
}

const MIN_NAME_TOKEN = 3;
const MAX_SUBSET_INVOICES = 14;
const STOP_WORDS = new Set(["LTD", "LLC", "INC", "LIMITED", "CORP", "THE", "AND", "COMPANY", "GMBH", "LTDA", "SA"]);

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Banks mangle references, so INV-1001 also matches "INV 1001" and "INV1001".
// A short bare number such as "12" matches too much text to count.
export function mentionsNumber(description: string, number: string): boolean {
  const parts = number.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const compact = parts.join("");
  if (!compact || (/^\d+$/.test(compact) && compact.length < 4)) return false;
  const pattern = parts.map(escape).join("[\\s\\-_/.#]*");
  return new RegExp(`(?<![A-Z0-9])${pattern}(?![A-Z0-9])`).test(description.toUpperCase());
}

function nameTokens(party: string): string[] {
  return party.toUpperCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= MIN_NAME_TOKEN && !STOP_WORDS.has(token));
}

export function mentionsParty(description: string, party: string): boolean {
  const tokens = nameTokens(party);
  if (tokens.length === 0) return false;
  const words = new Set(description.toUpperCase().split(/[^\p{L}\p{N}]+/u));
  return tokens.every((token) => words.has(token));
}

function sameCurrency(line: BankLine, invoice: Invoice): boolean {
  return !line.currency || !invoice.currency || line.currency === invoice.currency;
}

function inWindow(line: BankLine, invoice: Invoice, windowDays: number): boolean {
  if (!invoice.date) return true;
  const days = daysBetween(invoice.date, line.date);
  return days >= -7 && days <= windowDays;
}

// Returns the only subset that sums to the target, or undefined if there is
// none or more than one, because two possible answers need a person.
export function uniqueSubset(invoices: Invoice[], target: number): Invoice[] | undefined {
  if (invoices.length < 2 || invoices.length > MAX_SUBSET_INVOICES) return undefined;
  let found: Invoice[] | undefined;
  for (let mask = 1; mask < 1 << invoices.length; mask++) {
    if ((mask & (mask - 1)) === 0) continue;
    const subset = invoices.filter((_, index) => mask & (1 << index));
    if (subset.reduce((sum, invoice) => sum + invoice.amount, 0) === target) {
      if (found) return undefined;
      found = subset;
    }
  }
  return found;
}

export function reconcile(lines: BankLine[], invoices: Invoice[], options: MatchOptions = {}): Reconciliation {
  const mode = options.mode ?? "receivable";
  const windowDays = options.windowDays ?? 120;
  const result: Reconciliation = { matched: [], likely: [], review: [], unmatchedLines: [], openInvoices: [], ignoredLines: 0, warnings: [] };

  const sign = mode === "receivable" ? 1 : -1;
  const relevant = lines.filter((line) => line.amount * sign > 0);
  result.ignoredLines = lines.length - relevant.length;
  const amountOf = (line: BankLine) => Math.abs(line.amount);

  const counts = new Map<string, number>();
  for (const invoice of invoices) counts.set(invoice.number, (counts.get(invoice.number) ?? 0) + 1);
  for (const [number, count] of counts) {
    if (count > 1) result.warnings.push(`Invoice ${number} appears ${count} times in the invoice file.`);
  }
  const seenLines = new Map<string, number>();
  for (const line of relevant) {
    const key = `${line.date}|${line.amount}|${line.description}`;
    seenLines.set(key, (seenLines.get(key) ?? 0) + 1);
    if (seenLines.get(key) === 2) result.warnings.push(`Bank rows look duplicated: ${line.date} ${formatAmount(line.amount)} (row ${line.row}).`);
  }

  const openLines = new Set(relevant);
  const open = new Set(invoices);
  const paid = new Map<string, BankLine>();
  const take = (group: Pair[], line: BankLine, taken: Invoice[], reason: string) => {
    group.push({ line, invoices: taken, reason });
    openLines.delete(line);
    for (const invoice of taken) {
      open.delete(invoice);
      paid.set(invoice.number, line);
    }
  };
  const openList = () => [...open];

  // Pass 1: the bank line names the invoices.
  for (const line of [...openLines]) {
    const named = openList().filter((invoice) => sameCurrency(line, invoice) && mentionsNumber(line.description, invoice.number));
    if (named.length === 0) continue;
    const total = named.reduce((sum, invoice) => sum + invoice.amount, 0);
    const label = named.map((invoice) => invoice.number).join(", ");
    if (total === amountOf(line)) {
      take(result.matched, line, named, named.length === 1 ? "invoice number and amount" : "invoice numbers and total");
    } else {
      const difference = amountOf(line) - total;
      const word = difference < 0 ? "short" : "over";
      take(result.review, line, named, `names ${label}, but ${word} by ${formatAmount(Math.abs(difference))}`);
    }
  }

  // A second payment naming an invoice that's already settled may be a duplicate.
  for (const line of [...openLines]) {
    const earlier = [...paid.keys()].find((number) => mentionsNumber(line.description, number));
    if (earlier) take(result.review, line, [], `names ${earlier}, which is already settled: possible duplicate payment`);
  }

  // Pass 2: exact amount and party name, when only one pairing fits.
  const candidates = (line: BankLine, byName: boolean) =>
    openList().filter((invoice) =>
      invoice.amount === amountOf(line) && sameCurrency(line, invoice) && inWindow(line, invoice, windowDays) &&
      (!byName || mentionsParty(line.description, invoice.party)));

  // Decided from one snapshot, so a tie stays a tie however the lines are ordered.
  const assignUnique = (byName: boolean, group: Pair[], reason: string, tieReason: (fits: Invoice[]) => string) => {
    const options = new Map([...openLines].map((line) => [line, candidates(line, byName)]));
    const claims = new Map<Invoice, number>();
    for (const fits of options.values()) for (const invoice of fits) claims.set(invoice, (claims.get(invoice) ?? 0) + 1);
    for (const [line, fits] of options) {
      if (fits.length === 0) continue;
      if (fits.length === 1 && claims.get(fits[0]) === 1) {
        take(group, line, fits, reason);
      } else {
        take(result.review, line, [], tieReason(fits));
      }
    }
  };
  assignUnique(true, result.likely, "amount and party name", (fits) => `could be any of ${fits.map((invoice) => invoice.number).join(", ")}`);

  // Pass 3: one payment covering several invoices from the same party.
  for (const line of [...openLines]) {
    const party = openList().filter((invoice) => sameCurrency(line, invoice) && inWindow(line, invoice, windowDays) && mentionsParty(line.description, invoice.party));
    const subset = uniqueSubset(party, amountOf(line));
    if (subset) take(result.likely, line, subset, "party name, and the amounts add up");
  }

  // Pass 4: amount alone is weak, so it only ever goes to review.
  assignUnique(false, result.review, "amount only", (fits) => `amount fits ${fits.map((invoice) => invoice.number).join(", ")}`);

  result.unmatchedLines = [...openLines];
  result.openInvoices = openList();
  return result;
}

export function summarize(result: Reconciliation) {
  const sum = (lines: BankLine[]) => formatAmount(lines.reduce((total, line) => total + Math.abs(line.amount), 0));
  return {
    matched: { count: result.matched.length, total: sum(result.matched.map((pair) => pair.line)) },
    likely: { count: result.likely.length, total: sum(result.likely.map((pair) => pair.line)) },
    review: { count: result.review.length, total: sum(result.review.map((pair) => pair.line)) },
    unmatched_bank_lines: { count: result.unmatchedLines.length, total: sum(result.unmatchedLines) },
    open_invoices: { count: result.openInvoices.length, total: formatAmount(result.openInvoices.reduce((total, invoice) => total + invoice.amount, 0)) },
    other_direction_lines: result.ignoredLines,
  };
}
