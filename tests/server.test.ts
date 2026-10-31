import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Talks to the built bundle over stdio, as an MCP client would.
async function exchange(messages: object[]): Promise<any[]> {
  const child = spawn("node", ["plugin/dist/tiedout.js", "serve"], { stdio: ["pipe", "pipe", "ignore"] });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  const expected = messages.filter((m: any) => m.id !== undefined).length;
  for (const message of messages) child.stdin.write(JSON.stringify(message) + "\n");
  for (let i = 0; i < 100 && output.split("\n").filter(Boolean).length < expected; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill();
  return output.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

const init = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
];
const tool = (name: string, args: object) => ({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } });
const paths = { bank_path: "examples/bank.csv", invoices_path: "examples/invoices.csv" };

test("lists read-only tools", async () => {
  const [, list] = await exchange([...init, { jsonrpc: "2.0", id: 2, method: "tools/list" }]);
  assert.deepEqual(list.result.tools.map((t: any) => t.name).sort(), ["reconcile_inspect_csv", "reconcile_match"]);
  assert.ok(list.result.tools.every((t: any) => t.annotations.readOnlyHint === true));
});

test("matches the example files", async () => {
  const [, call] = await exchange([...init, tool("reconcile_match", paths)]);
  const body = JSON.parse(call.result.content[0].text);
  assert.equal(body.summary.matched.count, 2);
  assert.deepEqual(body.skipped_bank_rows, [{ row: 12, reason: "no valid date" }]);
});

test("limit 0 returns only the summary", async () => {
  const [, call] = await exchange([...init, tool("reconcile_match", { ...paths, limit: 0 })]);
  const body = JSON.parse(call.result.content[0].text);
  assert.equal(body.matched.length, 0);
  assert.equal(body.truncated, true);
  assert.ok(body.summary.matched.count > 0);
});

test("inspect returns no row contents", async () => {
  const [, call] = await exchange([...init, tool("reconcile_inspect_csv", { path: "examples/bank.csv", kind: "bank" })]);
  const text = call.result.content[0].text;
  assert.equal(JSON.parse(text).rows, 9);
  assert.ok(!text.includes("EXAMPLE SUPPLIES"));
});

test("a bad path gives a tool error", async () => {
  const [, call] = await exchange([...init, tool("reconcile_match", { ...paths, bank_path: "/no/such/file.csv" })]);
  assert.equal(call.result.isError, true);
});

test("the code never touches the network", () => {
  for (const file of ["csv", "load", "match", "report", "server", "main", "values"]) {
    const source = readFileSync(`src/${file}.ts`, "utf8");
    assert.ok(!/\bfetch\(|node:https?|node:net|node:dns/.test(source), file);
  }
});
