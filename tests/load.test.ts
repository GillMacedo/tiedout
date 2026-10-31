import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseCsv, detectDelimiter } from "../src/csv.ts";
import { loadBank, loadInvoices } from "../src/load.ts";

const dir = mkdtempSync(join(tmpdir(), "tiedout-"));
const file = (name: string, text: string | Buffer) => {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
};

test("CSV handles quotes, commas, newlines and CRLF", () => {
  assert.deepEqual(parseCsv('a,"b,c","d""e"\r\n"f\ng",h\n', ","), [["a", "b,c", 'd"e'], ["f\ng", "h"]]);
  assert.equal(detectDelimiter("a;b;c\n1;2,5;3\n"), ";");
  assert.equal(detectDelimiter("a\tb\n1\t2\n"), "\t");
});

test("bank file with title lines, debit and credit columns, and a footer", () => {
  const path = file("a.csv", 'Statement for March,,,\nDate,Description,Credit,Debit\n2026-03-02,IN,"1,200.00",\n2026-03-03,OUT,,50.00\nClosing balance,,,\n');
  const bank = loadBank(path);
  assert.deepEqual(bank.items.map((line) => line.amount), [120000, -5000]);
  assert.deepEqual(bank.skipped, [{ row: 5, reason: "no valid date" }]);
});

test("semicolons, decimal commas and day-first dates", () => {
  const bank = loadBank(file("b.csv", "Data;Histórico;Valor\n25/02/2026;PIX RECEBIDO;1.234,56\n01/03/2026;TARIFA;-10,00\n"));
  assert.deepEqual(bank.items.map((line) => [line.date, line.amount]), [["2026-02-25", 123456], ["2026-03-01", -1000]]);
  assert.equal(bank.columns.description, "Histórico");
});

test("ambiguous dates stop with an actionable error, and a format fixes them", () => {
  const path = file("c.csv", "Date,Amount\n03/02/2026,10\n04/02/2026,20\n");
  assert.throws(() => loadBank(path), /day-first or month-first.*dmy or mdy/);
  assert.equal(loadBank(path, { dateFormat: "dmy" }).items[0].date, "2026-02-03");
  assert.equal(loadBank(path, { dateFormat: "mdy" }).items[0].date, "2026-03-02");
});

test("Latin-1 files and BOMs are read", () => {
  const latin = Buffer.from("Date,Descri\xe7\xe3o,Amount\n2026-03-02,Caf\xe9,10\n", "latin1");
  assert.equal(loadBank(file("d.csv", latin)).items[0].description, "Café");
  assert.equal(loadBank(file("e.csv", "﻿Date,Amount\n2026-03-02,10\n")).items.length, 1);
});

test("column maps override detection, and bad names say what exists", () => {
  const path = file("f.csv", "Posted,Value,Text\n2026-03-02,10,hello\n");
  assert.equal(loadBank(path).items.length, 1);
  const unusual = file("g.csv", "When,HowMuch,Text\n2026-03-02,10,hello\n");
  assert.throws(() => loadBank(unusual), /Can't find date and amount.*First row: When, HowMuch, Text/);
  assert.equal(loadBank(unusual, { map: { date: "When", amount: "HowMuch" } }).items[0].amount, 1000);
});

test("invoices load, and bad rows are reported rather than dropped silently", () => {
  const path = file("h.csv", "Invoice,Customer,Date,Due Date,Total\nA-1,Acme,2026-02-01,2026-03-01,100\n,Acme,2026-02-01,,100\nA-3,Acme,2026-02-01,,oops\n");
  const invoices = loadInvoices(path);
  assert.equal(invoices.items.length, 1);
  assert.equal(invoices.items[0].due, "2026-03-01");
  assert.deepEqual(invoices.skipped.map((s) => s.row), [3, 4]);
});
