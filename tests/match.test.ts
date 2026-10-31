import assert from "node:assert/strict";
import { test } from "node:test";
import type { BankLine, Invoice } from "../src/load.ts";
import { mentionsNumber, mentionsParty, reconcile, uniqueSubset } from "../src/match.ts";

let row = 1;
const line = (amount: number, description: string, date = "2026-03-10", currency?: string): BankLine => ({ row: row++, date, amount, description, currency });
const invoice = (number: string, amount: number, party = "", date: string | undefined = "2026-03-01", currency?: string): Invoice => ({ row: row++, number, amount, party, date, currency });
const numbers = (group: { invoices: Invoice[] }[]) => group.map((pair) => pair.invoices.map((i) => i.number).join("+"));

test("invoice numbers survive bank formatting", () => {
  for (const text of ["REF INV-1001", "INV 1001 PAID", "inv1001", "INV/1001", "#INV-1001."]) assert.ok(mentionsNumber(text, "INV-1001"), text);
  for (const text of ["INV-10011", "XINV-1001", "INV-100"]) assert.ok(!mentionsNumber(text, "INV-1001"), text);
});

test("short bare numbers don't count as a reference", () => {
  assert.ok(!mentionsNumber("PAYMENT 12 MARCH", "12"));
  assert.ok(mentionsNumber("PAYMENT 1234", "1234"));
});

test("party names ignore legal suffixes and need every word", () => {
  assert.ok(mentionsParty("TRANSFER FROM ACME TRADING", "Acme Trading Ltd"));
  assert.ok(!mentionsParty("TRANSFER FROM ACME", "Acme Trading Ltd"));
  assert.ok(!mentionsParty("ANYTHING", "Ltd"));
  assert.ok(!mentionsParty("ANYTHING", ""));
});

test("number and amount is a match", () => {
  const result = reconcile([line(10000, "INV-1 2001 X"), line(5000, "PAY INV-2002")], [invoice("INV-2002", 5000)]);
  assert.deepEqual(numbers(result.matched), ["INV-2002"]);
  assert.equal(result.unmatchedLines.length, 1);
});

test("one payment naming two invoices that add up is a match", () => {
  const result = reconcile([line(300, "INV-2001 INV-2002")], [invoice("INV-2001", 100), invoice("INV-2002", 200)]);
  assert.deepEqual(numbers(result.matched), ["INV-2001+INV-2002"]);
});

test("a named invoice with the wrong amount goes to review, with the difference", () => {
  const result = reconcile([line(590, "INV-2005")], [invoice("INV-2005", 600)]);
  assert.equal(result.matched.length, 0);
  assert.match(result.review[0].reason, /short by 0\.10/);
  assert.equal(result.openInvoices.length, 0);
});

test("a second payment naming a settled invoice is flagged as a duplicate", () => {
  const result = reconcile([line(100, "INV-2001", "2026-03-01"), line(100, "INV-2001", "2026-03-20")], [invoice("INV-2001", 100)]);
  assert.equal(result.matched.length, 1);
  assert.match(result.review[0].reason, /possible duplicate/);
});

test("amount and name is likely, not matched", () => {
  const result = reconcile([line(100, "ACME TRADING")], [invoice("X-9001", 100, "Acme Trading Ltd")]);
  assert.equal(result.matched.length, 0);
  assert.deepEqual(numbers(result.likely), ["X-9001"]);
});

test("amount alone only ever reaches review", () => {
  const result = reconcile([line(100, "UNKNOWN")], [invoice("X-9001", 100, "Acme")]);
  assert.equal(result.likely.length, 0);
  assert.equal(result.review[0].reason, "amount only");
});

test("ties aren't decided, whichever order the lines come in", () => {
  const result = reconcile([line(100, "ONE"), line(100, "TWO")], [invoice("X-9001", 100)]);
  assert.equal(result.review.length, 2);
  assert.ok(result.review.every((pair) => pair.invoices.length === 0));
  assert.equal(result.openInvoices.length, 1);

  const two = reconcile([line(100, "ONE")], [invoice("X-9001", 100), invoice("X-9002", 100)]);
  assert.match(two.review[0].reason, /amount fits X-9001, X-9002/);
  assert.equal(two.openInvoices.length, 2);
});

test("one payment for several invoices from a party", () => {
  const result = reconcile([line(700, "GARDENS CO")], [invoice("X-9001", 300, "Gardens"), invoice("X-9002", 400, "Gardens"), invoice("X-9003", 999, "Gardens")]);
  assert.deepEqual(numbers(result.likely), ["X-9001+X-9002"]);
});

test("two subsets that add up aren't decided", () => {
  const list = [invoice("A-0001", 100), invoice("A-0002", 200), invoice("A-0003", 300), invoice("A-0004", 400)];
  assert.equal(uniqueSubset(list, 500), undefined);
  assert.deepEqual(uniqueSubset(list, 1000)?.length, 4);
});

test("direction: receivable ignores money out, payable ignores money in", () => {
  const lines = [line(100, "IN X-9001"), line(-100, "OUT X-9002")];
  const invoices = [invoice("X-9001", 100), invoice("X-9002", 100)];
  assert.deepEqual(numbers(reconcile(lines, invoices).matched), ["X-9001"]);
  assert.deepEqual(numbers(reconcile(lines, invoices, { mode: "payable" }).matched), ["X-9002"]);
  assert.equal(reconcile(lines, invoices).ignoredLines, 1);
});

test("different currencies never match", () => {
  const result = reconcile([line(100, "X-9001", "2026-03-10", "EUR")], [invoice("X-9001", 100, "", "2026-03-01", "USD")]);
  assert.equal(result.matched.length + result.likely.length + result.review.length, 0);
});

test("the date window limits weak matches, not named ones", () => {
  const old = invoice("X-9001", 100, "Acme", "2024-01-01");
  assert.equal(reconcile([line(100, "ACME")], [old]).likely.length, 0);
  assert.equal(reconcile([line(100, "ACME X-9001")], [old]).matched.length, 1);
});

test("duplicate invoice numbers and bank rows produce warnings", () => {
  const result = reconcile([line(1, "A"), line(1, "A")], [invoice("X-9001", 5), invoice("X-9001", 6)]);
  assert.ok(result.warnings.some((w) => w.includes("X-9001")));
  assert.ok(result.warnings.some((w) => w.includes("duplicated")));
});

test("every line and invoice lands in exactly one place, on random data", () => {
  let seed = 42;
  const random = (n: number) => (seed = (seed * 1664525 + 1013904223) % 4294967296) % n;
  for (let round = 0; round < 300; round++) {
    const invoices = Array.from({ length: random(12) }, (_, i) => invoice(`INV-${1000 + i}`, (random(5) + 1) * 100, ["Acme", "Gardens", ""][random(3)]));
    const lines = Array.from({ length: random(12) }, () => line(((random(6) + 1) * 100) * (random(4) === 0 ? -1 : 1), `${["ACME", "GARDENS", "X"][random(3)]} INV-${1000 + random(14)}`));
    const r = reconcile(lines, invoices);
    const pairs = [...r.matched, ...r.likely, ...r.review];
    const lineCount = pairs.length + r.unmatchedLines.length + r.ignoredLines;
    assert.equal(lineCount, lines.length);
    assert.equal(new Set(pairs.map((p) => p.line)).size, pairs.length);
    const taken = pairs.flatMap((p) => p.invoices);
    assert.equal(new Set(taken).size, taken.length);
    assert.equal(taken.length + r.openInvoices.length, invoices.length);
    for (const pair of r.matched) {
      assert.equal(pair.invoices.reduce((sum, i) => sum + i.amount, 0), Math.abs(pair.line.amount));
    }
    for (const pair of r.likely) {
      assert.equal(pair.invoices.reduce((sum, i) => sum + i.amount, 0), Math.abs(pair.line.amount));
    }
  }
});
