import type { BankLine, Invoice } from "./load.ts";
import type { Pair, Reconciliation } from "./match.ts";
import { summarize } from "./match.ts";
import { formatAmount } from "./values.ts";

const lineJson = (line: BankLine) => ({ row: line.row, date: line.date, amount: formatAmount(line.amount), description: line.description });
const invoiceJson = (invoice: Invoice) => ({ row: invoice.row, number: invoice.number, amount: formatAmount(invoice.amount), party: invoice.party, due: invoice.due });
const pairJson = (pair: Pair) => ({ bank: lineJson(pair.line), invoices: pair.invoices.map((invoice) => invoice.number), reason: pair.reason });

export function toJson(result: Reconciliation, limit = Number.MAX_SAFE_INTEGER) {
  const cut = <T>(items: T[]) => items.slice(0, limit);
  const lists = [result.matched, result.likely, result.review, result.unmatchedLines, result.openInvoices];
  return {
    summary: summarize(result),
    warnings: result.warnings,
    truncated: lists.some((list) => list.length > limit),
    matched: cut(result.matched).map(pairJson),
    likely: cut(result.likely).map(pairJson),
    review: cut(result.review).map(pairJson),
    unmatched_bank_lines: cut(result.unmatchedLines).map(lineJson),
    open_invoices: cut(result.openInvoices).map(invoiceJson),
  };
}

export function toText(result: Reconciliation): string {
  const out: string[] = [];
  const pairs = (title: string, items: Pair[]) => {
    if (items.length === 0) return;
    out.push(`${title} (${items.length})`);
    for (const pair of items) {
      const names = pair.invoices.map((invoice) => invoice.number).join(", ");
      out.push(`  ${pair.line.date}  ${formatAmount(pair.line.amount)}  ${pair.line.description}${names ? `  -> ${names}` : ""}  [${pair.reason}]`);
    }
  };
  pairs("MATCHED", result.matched);
  pairs("LIKELY: check these", result.likely);
  pairs("REVIEW: a person should decide", result.review);
  if (result.unmatchedLines.length > 0) {
    out.push(`UNMATCHED BANK LINES (${result.unmatchedLines.length})`);
    for (const line of result.unmatchedLines) out.push(`  ${line.date}  ${formatAmount(line.amount)}  ${line.description}`);
  }
  if (result.openInvoices.length > 0) {
    out.push(`OPEN INVOICES (${result.openInvoices.length})`);
    for (const invoice of result.openInvoices) out.push(`  ${invoice.number}  ${formatAmount(invoice.amount)}  ${invoice.party}${invoice.due ? `  due ${invoice.due}` : ""}`);
  }
  for (const warning of result.warnings) out.push(`WARNING: ${warning}`);
  return out.join("\n");
}
