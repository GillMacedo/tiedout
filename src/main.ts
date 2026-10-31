import { parseArgs } from "node:util";
import { loadBank, loadInvoices } from "./load.ts";
import type { ColumnMap } from "./load.ts";
import { reconcile, summarize } from "./match.ts";
import type { Mode } from "./match.ts";
import { toJson, toText } from "./report.ts";
import { serve } from "./server.ts";
import type { DateFormat } from "./values.ts";

const USAGE = `Usage:
  tiedout match <bank.csv> <invoices.csv>   Match bank lines to invoices
  tiedout serve                             Run as an MCP server over stdio

Options:
  --payable                Match money out to bills, not money in to invoices
  --window <days>          Days after the invoice date a payment can count (default 120)
  --date-format dmy|mdy    Needed only when dates are ambiguous
  --bank-map date=Posted,amount=Value      Name the bank columns
  --invoice-map number=Doc,amount=Gross    Name the invoice columns
  --json                   Print JSON

Reads files only, and never uses the network.`;

function parseMap(text: string | undefined): ColumnMap | undefined {
  if (!text) return undefined;
  return Object.fromEntries(text.split(",").map((pair) => pair.split("=").map((part) => part.trim())));
}

function main(): number {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      payable: { type: "boolean", default: false },
      window: { type: "string" },
      "date-format": { type: "string" },
      "bank-map": { type: "string" },
      "invoice-map": { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, bankPath, invoicesPath] = positionals;

  if (command === "serve") {
    serve();
    return -1;
  }
  if (values.help || command !== "match" || !bankPath || !invoicesPath) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }

  const dateFormat = values["date-format"] as DateFormat | undefined;
  const mode: Mode = values.payable ? "payable" : "receivable";
  const bank = loadBank(bankPath, { map: parseMap(values["bank-map"]), dateFormat });
  const invoices = loadInvoices(invoicesPath, { map: parseMap(values["invoice-map"]), dateFormat });
  const result = reconcile(bank.items, invoices.items, { mode, windowDays: values.window ? Number(values.window) : undefined });

  if (values.json) {
    console.log(JSON.stringify({ ...toJson(result), skipped_bank_rows: bank.skipped, skipped_invoice_rows: invoices.skipped }, null, 2));
    return 0;
  }
  console.log(toText(result));
  for (const skip of bank.skipped) console.log(`SKIPPED bank row ${skip.row}: ${skip.reason}`);
  for (const skip of invoices.skipped) console.log(`SKIPPED invoice row ${skip.row}: ${skip.reason}`);
  const summary = summarize(result);
  console.log(`${summary.matched.count} matched, ${summary.likely.count} likely, ${summary.review.count} to review, ${summary.unmatched_bank_lines.count} unmatched, ${summary.open_invoices.count} open invoices`);
  return 0;
}

try {
  const code = main();
  if (code >= 0) process.exitCode = code;
} catch (error) {
  console.error(`tiedout: ${(error as Error).message}`);
  process.exitCode = 2;
}
