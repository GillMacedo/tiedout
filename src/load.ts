import { detectDelimiter, parseCsv, readText } from "./csv.ts";
import { detectDateFormat, parseAmount, parseDate } from "./values.ts";
import type { DateFormat } from "./values.ts";

export type Field = "date" | "amount" | "credit" | "debit" | "description" | "currency" | "number" | "party" | "due";
export type ColumnMap = Partial<Record<Field, string>>;

export interface BankLine {
  row: number;
  date: string;
  amount: number;
  description: string;
  currency?: string;
}

export interface Invoice {
  row: number;
  number: string;
  amount: number;
  party: string;
  date?: string;
  due?: string;
  currency?: string;
}

export interface Loaded<T> {
  items: T[];
  skipped: { row: number; reason: string }[];
  columns: ColumnMap;
  dateFormat?: DateFormat;
}

const NAMES: Record<Field, string[]> = {
  date: ["date", "transaction date", "posted", "posted date", "posting date", "booking date", "value date", "invoice date", "issue date", "issued", "data", "fecha", "datum", "data lancamento", "data emissao"],
  amount: ["amount", "transaction amount", "value", "total", "invoice total", "amount due", "balance due", "open amount", "valor", "valor total", "importe", "betrag"],
  credit: ["credit", "credits", "paid in", "money in", "deposit", "deposits", "credito", "entrada"],
  debit: ["debit", "debits", "paid out", "money out", "withdrawal", "withdrawals", "debito", "saida"],
  description: ["description", "details", "memo", "narrative", "payee", "transaction", "reference", "descricao", "historico", "concepto", "verwendungszweck"],
  currency: ["currency", "ccy", "moeda", "moneda", "wahrung"],
  number: ["invoice", "invoice number", "invoice no", "invoice id", "invoice #", "number", "inv", "bill", "bill number", "doc number", "fatura", "nota", "numero", "factura", "rechnung"],
  party: ["customer", "customer name", "client", "client name", "vendor", "vendor name", "supplier", "supplier name", "name", "bill to", "cliente", "fornecedor", "kunde"],
  due: ["due", "due date", "vencimento", "data vencimento", "vencimiento", "fallig"],
};

const normalize = (header: string) =>
  header.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_.:]/g, " ").replace(/\s+/g, " ").trim();

export function detectColumns(header: string[], fields: Field[], overrides: ColumnMap = {}): ColumnMap {
  const columns: ColumnMap = {};
  const lower = header.map(normalize);
  for (const field of fields) {
    const override = overrides[field];
    if (override) {
      const found = lower.indexOf(normalize(override));
      if (found < 0) throw new Error(`No column named "${override}". Columns found: ${header.join(", ")}`);
      columns[field] = header[found];
      continue;
    }
    const found = NAMES[field].map((name) => lower.indexOf(name)).find((index) => index >= 0);
    if (found !== undefined) columns[field] = header[found];
  }
  return columns;
}

const BANK_FIELDS: Field[] = ["date", "amount", "credit", "debit", "description", "currency"];
const INVOICE_FIELDS: Field[] = ["number", "amount", "party", "date", "due", "currency"];

// Bank exports often have title lines above the header, so the header is the
// first row in the first 20 that names the required columns.
function findHeader(rows: string[][], fields: Field[], required: (c: ColumnMap) => boolean, overrides: ColumnMap): { index: number; columns: ColumnMap } | undefined {
  for (let index = 0; index < Math.min(rows.length, 20); index++) {
    try {
      const columns = detectColumns(rows[index], fields, overrides);
      if (required(columns)) return { index, columns };
    } catch {
      continue;
    }
  }
  return undefined;
}

export function readRows(path: string): string[][] {
  const text = readText(path);
  return parseCsv(text, detectDelimiter(text)).filter((row) => row.some((cell) => cell.trim()));
}

function columnError(path: string, rows: string[][], need: string): Error {
  const first = rows[0]?.join(", ") ?? "(empty file)";
  return new Error(`Can't find ${need} columns in ${path}. First row: ${first}. Pass a column map to name them.`);
}

function pickFormat(path: string, label: string, values: string[], given?: DateFormat): DateFormat {
  const format = given ?? detectDateFormat(values);
  if (!format) {
    throw new Error(`The ${label} dates in ${path} could be day-first or month-first. Pass a date format of dmy or mdy.`);
  }
  return format;
}

export function loadBank(path: string, options: { map?: ColumnMap; dateFormat?: DateFormat } = {}): Loaded<BankLine> {
  const rows = readRows(path);
  const required = (c: ColumnMap) => Boolean(c.date && (c.amount || c.credit || c.debit));
  const header = findHeader(rows, BANK_FIELDS, required, options.map ?? {});
  if (!header) throw columnError(path, rows, "date and amount");

  const names = rows[header.index];
  const at = (row: string[], field: Field) => {
    const column = header.columns[field];
    return column === undefined ? "" : (row[names.indexOf(column)] ?? "").trim();
  };
  const body = rows.slice(header.index + 1);
  const format = pickFormat(path, "bank", body.map((row) => at(row, "date")), options.dateFormat);

  const result: Loaded<BankLine> = { items: [], skipped: [], columns: header.columns, dateFormat: format };
  body.forEach((row, offset) => {
    const number = header.index + offset + 2;
    const date = parseDate(at(row, "date"), format);
    if (!date) return result.skipped.push({ row: number, reason: "no valid date" });
    let amount = header.columns.amount ? parseAmount(at(row, "amount")) : undefined;
    if (amount === undefined && (header.columns.credit || header.columns.debit)) {
      const credit = parseAmount(at(row, "credit"));
      const debit = parseAmount(at(row, "debit"));
      if (credit !== undefined || debit !== undefined) amount = (credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (amount === undefined) return result.skipped.push({ row: number, reason: "no valid amount" });
    result.items.push({ row: number, date, amount, description: at(row, "description") || row.join(" "), currency: at(row, "currency").toUpperCase() || undefined });
  });
  return result;
}

export function loadInvoices(path: string, options: { map?: ColumnMap; dateFormat?: DateFormat } = {}): Loaded<Invoice> {
  const rows = readRows(path);
  const required = (c: ColumnMap) => Boolean(c.number && c.amount);
  const header = findHeader(rows, INVOICE_FIELDS, required, options.map ?? {});
  if (!header) throw columnError(path, rows, "invoice number and amount");

  const names = rows[header.index];
  const at = (row: string[], field: Field) => {
    const column = header.columns[field];
    return column === undefined ? "" : (row[names.indexOf(column)] ?? "").trim();
  };
  const body = rows.slice(header.index + 1);
  const dates = body.flatMap((row) => [at(row, "date"), at(row, "due")]).filter(Boolean);
  const format = dates.length > 0 ? pickFormat(path, "invoice", dates, options.dateFormat) : undefined;

  const result: Loaded<Invoice> = { items: [], skipped: [], columns: header.columns, dateFormat: format };
  body.forEach((row, offset) => {
    const rowNumber = header.index + offset + 2;
    const number = at(row, "number");
    const amount = parseAmount(at(row, "amount"));
    if (!number) return result.skipped.push({ row: rowNumber, reason: "no invoice number" });
    if (amount === undefined) return result.skipped.push({ row: rowNumber, reason: "no valid amount" });
    result.items.push({
      row: rowNumber,
      number,
      amount: Math.abs(amount),
      party: at(row, "party"),
      date: parseDate(at(row, "date"), format),
      due: parseDate(at(row, "due"), format),
      currency: at(row, "currency").toUpperCase() || undefined,
    });
  });
  return result;
}
