import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { loadBank, loadInvoices, readRows } from "./load.ts";
import type { ColumnMap } from "./load.ts";
import { reconcile } from "./match.ts";
import { toJson } from "./report.ts";
import { VERSION } from "./version.ts";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const columnMap = z.record(z.string(), z.string()).optional();

function text(body: object) {
  return { content: [{ type: "text" as const, text: JSON.stringify(body) }] };
}

function failure(error: unknown) {
  return { content: [{ type: "text" as const, text: (error as Error).message }], isError: true };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "tiedout", version: VERSION }, { capabilities: { tools: {} } });

  server.registerTool(
    "reconcile_match",
    {
      title: "Match bank lines to invoices",
      description:
        "Matches a bank statement CSV to an invoice CSV using exact arithmetic, and sorts every line into matched, likely, review or unmatched. Use for bank reconciliation, finding who has paid, or finding payments with no invoice. Read-only, and never uses the network. Results include names and amounts from the files, so they reach the model. Report review items to the user instead of deciding them.",
      inputSchema: z.object({
        bank_path: z.string().min(1).describe("Path to the bank statement CSV"),
        invoices_path: z.string().min(1).describe("Path to the invoice or bill CSV"),
        mode: z.enum(["receivable", "payable"]).default("receivable").describe("receivable matches money in to customer invoices; payable matches money out to bills"),
        window_days: z.number().int().min(1).max(3650).default(120).describe("How long after the invoice date a payment can count, for matches without an invoice number"),
        date_format: z.enum(["dmy", "mdy"]).optional().describe("Needed only if the tool reports that dates are ambiguous"),
        bank_columns: columnMap.describe('Column names, when detection fails, such as {"date":"Posted","amount":"Value"}'),
        invoice_columns: columnMap.describe('Column names, when detection fails, such as {"number":"Doc","amount":"Gross"}'),
        limit: z.number().int().min(0).max(500).default(100).describe("Most items per group. 0 returns only the summary"),
      }),
      annotations: READ_ONLY,
    },
    async (input) => {
      try {
        const bank = loadBank(input.bank_path, { map: input.bank_columns as ColumnMap, dateFormat: input.date_format });
        const invoices = loadInvoices(input.invoices_path, { map: input.invoice_columns as ColumnMap, dateFormat: input.date_format });
        const result = reconcile(bank.items, invoices.items, { mode: input.mode, windowDays: input.window_days });
        return text({ ...toJson(result, input.limit), skipped_bank_rows: bank.skipped, skipped_invoice_rows: invoices.skipped });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "reconcile_inspect_csv",
    {
      title: "Inspect a CSV's columns",
      description:
        "Shows which columns tiedout detects in a bank or invoice CSV, and how many rows it can read, without returning row contents. Use before reconcile_match if the files are unfamiliar or a match failed.",
      inputSchema: z.object({
        path: z.string().min(1),
        kind: z.enum(["bank", "invoices"]),
        date_format: z.enum(["dmy", "mdy"]).optional(),
      }),
      annotations: READ_ONLY,
    },
    async ({ path, kind, date_format }) => {
      try {
        const loaded = kind === "bank" ? loadBank(path, { dateFormat: date_format }) : loadInvoices(path, { dateFormat: date_format });
        return text({ columns: loaded.columns, date_format: loaded.dateFormat, rows: loaded.items.length, skipped: loaded.skipped.length, first_row_cells: readRows(path)[0]?.length ?? 0 });
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}

export function serve(): void {
  serveStdio(() => createServer());
}
