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

test("french bank headers: date, libelle and montant", () => {
  const bank = loadBank(file("fr.csv", "Date;Libellé;Montant\n25/02/2026;LOYER BUREAU;-850,00\n02/03/2026;SALAIRE;2.100,00\n"));
  assert.deepEqual(bank.items.map((line) => [line.date, line.amount]), [["2026-02-25", -85000], ["2026-03-02", 210000]]);
  assert.equal(bank.columns.description, "Libellé");
  assert.equal(bank.columns.amount, "Montant");
});

test("italian bank headers: data, descrizione and importo", () => {
  const bank = loadBank(file("it.csv", "Data;Descrizione;Importo\n25/02/2026;Stipendio;1.500,00\n02/03/2026;Affitto;-650,00\n"));
  assert.deepEqual(bank.items.map((line) => [line.date, line.amount]), [["2026-02-25", 150000], ["2026-03-02", -65000]]);
  assert.equal(bank.columns.description, "Descrizione");
});

test("italian dare and avere columns act as debit and credit", () => {
  const bank = loadBank(file("it2.csv", "Data,Descrizione,Dare,Avere\n2026-03-02,Stipendio,,1500.00\n2026-03-03,Affitto,650.00,\n"));
  assert.deepEqual(bank.items.map((line) => line.amount), [150000, -65000]);
});

test("polish bank headers: data transakcji, opis and kwota", () => {
  const bank = loadBank(file("pl.csv", "Data transakcji;Opis;Kwota\n25/02/2026;WYPLATA;3.500,00\n02/03/2026;CZYNSZ;-1.800,00\n"));
  assert.deepEqual(bank.items.map((line) => [line.date, line.amount]), [["2026-02-25", 350000], ["2026-03-02", -180000]]);
  assert.equal(bank.columns.description, "Opis");
});

test("german DATEV headers: buchungsdatum, buchungstext and betrag", () => {
  const bank = loadBank(file("de.csv", "Buchungsdatum;Buchungstext;Betrag\n25/02/2026;Gehalt;2.750,00\n02/03/2026;Miete;-950,00\n"));
  assert.deepEqual(bank.items.map((line) => [line.date, line.amount]), [["2026-02-25", 275000], ["2026-03-02", -95000]]);
  assert.equal(bank.columns.description, "Buchungstext");
});

test("dutch bank headers: datum, omschrijving and bedrag", () => {
  const bank = loadBank(file("nl.csv", "Datum;Omschrijving;Bedrag\n25/02/2026;Salaris;2.300,00\n02/03/2026;Huur;-1.050,00\n"));
  assert.deepEqual(bank.items.map((line) => [line.date, line.amount]), [["2026-02-25", 230000], ["2026-03-02", -105000]]);
  assert.equal(bank.columns.description, "Omschrijving");
});

test("quickbooks invoice headers: num and name", () => {
  const invoices = loadInvoices(file("qb.csv", "Num,Name,Date,Due Date,Total\n1001,Acme BV,2026-02-01,2026-03-01,250\n1002,Globex,2026-02-05,2026-03-05,99.5\n"));
  assert.equal(invoices.items.length, 2);
  assert.equal(invoices.items[0].number, "1001");
  assert.equal(invoices.items[0].party, "Acme BV");
  assert.equal(invoices.items[0].amount, 25000);
  assert.equal(invoices.items[0].due, "2026-03-01");
  assert.equal(invoices.columns.number, "Num");
});

test("xero invoice headers: contact name as the party", () => {
  const invoices = loadInvoices(file("xero.csv", "Invoice Number,Contact Name,Date,Due Date,Total\nINV-0092,Wayne Enterprises,2026-02-01,2026-03-01,480\n"));
  assert.equal(invoices.items.length, 1);
  assert.equal(invoices.items[0].number, "INV-0092");
  assert.equal(invoices.items[0].party, "Wayne Enterprises");
  assert.equal(invoices.columns.party, "Contact Name");
});

test("french invoice headers: numero de facture and echeance", () => {
  const invoices = loadInvoices(file("frinv.csv", "Numéro de facture,Client,Date,Échéance,Total\nF-2026-01,Atelier Bleu,2026-02-01,2026-03-01,120\n"));
  assert.equal(invoices.items.length, 1);
  assert.equal(invoices.items[0].number, "F-2026-01");
  assert.equal(invoices.items[0].party, "Atelier Bleu");
  assert.equal(invoices.items[0].due, "2026-03-01");
  assert.equal(invoices.columns.due, "Échéance");
});
