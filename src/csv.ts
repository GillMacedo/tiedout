import { readFileSync, statSync } from "node:fs";

const MAX_BYTES = 50_000_000;

export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 30);
  let best = ",";
  let bestScore = -1;
  for (const delimiter of [",", ";", "\t", "|"]) {
    const counts = lines.map((line) => line.split(delimiter).length - 1);
    const typical = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)] ?? 0;
    if (typical > bestScore) {
      best = delimiter;
      bestScore = typical;
    }
  }
  return best;
}

export function readText(path: string): string {
  if (statSync(path).size > MAX_BYTES) throw new Error(`${path} is larger than 50 MB`);
  const bytes = readFileSync(path);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Bank exports are often Latin-1.
    text = new TextDecoder("latin1").decode(bytes);
  }
  return text.replace(/^﻿/, "");
}
