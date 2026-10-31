import assert from "node:assert/strict";
import { test } from "node:test";
import { detectDateFormat, formatAmount, parseAmount, parseDate } from "../src/values.ts";

test("amounts in common formats", () => {
  const cases: [string, number | undefined][] = [
    ["1,234.56", 123456], ["1.234,56", 123456], ["1234.5", 123450], ["1234", 123400], ["1,234", 123400],
    ["(50.00)", -5000], ["-50.00", -5000], ["50.00-", -5000], ["$1,000.00", 100000], ["R$ 1.000,00", 100000], ["€ 12,50", 1250],
    ["1 234,56", 123456], ["0.10", 10], ["0.1", 10], ["", undefined], ["abc", undefined], ["Closing", undefined],
  ];
  for (const [raw, expected] of cases) assert.equal(parseAmount(raw), expected, raw);
});

test("no float errors in sums", () => {
  assert.equal(parseAmount("0.10")! + parseAmount("0.20")!, parseAmount("0.30"));
  assert.equal(formatAmount(30), "0.30");
  assert.equal(formatAmount(-123456), "-1234.56");
});

test("date format comes from the whole column", () => {
  assert.equal(detectDateFormat(["2026-03-02"]), "ymd");
  assert.equal(detectDateFormat(["03/02/2026", "25/02/2026"]), "dmy");
  assert.equal(detectDateFormat(["03/02/2026", "02/25/2026"]), "mdy");
  assert.equal(detectDateFormat(["03/02/2026", "04/02/2026"]), undefined);
  assert.equal(detectDateFormat(["25/02/2026", "02/25/2026"]), undefined);
});

test("dates parse, and impossible ones are rejected", () => {
  assert.equal(parseDate("2026-03-02", "ymd"), "2026-03-02");
  assert.equal(parseDate("2026-03-02T10:00:00Z", "ymd"), "2026-03-02");
  assert.equal(parseDate("03/02/2026", "dmy"), "2026-02-03");
  assert.equal(parseDate("03/02/2026", "mdy"), "2026-03-02");
  assert.equal(parseDate("03.02.26", "dmy"), "2026-02-03");
  assert.equal(parseDate("31/02/2026", "dmy"), undefined);
  assert.equal(parseDate("03/02/2026", undefined), undefined);
  assert.equal(parseDate("Closing balance", "ymd"), undefined);
});
