# tiedout: bank reconciliation for CSV files

[![npm](https://img.shields.io/npm/v/tiedout)](https://www.npmjs.com/package/tiedout) [![CI](https://github.com/GillMacedo/tiedout/actions/workflows/ci.yml/badge.svg)](https://github.com/GillMacedo/tiedout/actions/workflows/ci.yml) [![MIT license](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-green)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.GillMacedo/tiedout)

**Match your bank statement to your invoices or bills, with exact math and without uploading your books anywhere. For small businesses, freelancers and bookkeepers.**

Reconciling payments by hand is slow, and asking an AI model to compare long CSV files invites arithmetic mistakes. `tiedout` does the matching in code and sorts every line into matched, likely, review or unmatched, with the reason. A person or an agent only has to look at the exceptions. It's an MCP server and a CLI with no account, no API key and no network access.

It works with any bank or invoicing tool that exports CSV. It reads title lines, footers, separate credit and debit columns, semicolons, decimal commas, day-first dates and several languages' column names.

## What you can ask your agent

- "Here's my bank export and my invoices. Who has paid?"
- "Which customers still owe me money?"
- "Match these supplier bills to my bank statement."
- "Are there any duplicate payments, or payments with no invoice?"

## Install

As a Claude Code plugin, which adds the MCP server and a skill that tells Claude when to use it:

    claude plugin marketplace add GillMacedo/tiedout
    claude plugin install tiedout@tiedout-marketplace

For other MCP clients, run it from GitHub. You need Node 22.19 or newer:

```json
{
  "mcpServers": {
    "tiedout": {
      "command": "npx",
      "args": ["-y", "github:GillMacedo/tiedout", "serve"]
    }
  }
}
```

## Usage

Try it on the sample files in `examples/`. All the names in them are made up.

    $ node plugin/dist/tiedout.js match examples/bank.csv examples/invoices.csv
    MATCHED (2)
      2026-03-02  1200.00  TRANSFER FROM EXAMPLE SUPPLIES REF INV-1001  -> INV-1001  [invoice number and amount]
      2026-03-04  450.50  PAYMENT FICTIONAL CAFE INV 1002 INV1003  -> INV-1002, INV-1003  [invoice numbers and total]
    LIKELY: check these (2)
      2026-03-09  975.00  SAMPLE WIDGETS ONLINE TRANSFER  -> INV-1004  [amount and party name]
      2026-03-16  700.00  PLACEHOLDER GARDENS  -> INV-1007, INV-1008  [party name, and the amounts add up]
    REVIEW: a person should decide (3)
      2026-03-11  590.00  ACME TEST CO INV-1005  -> INV-1005  [names INV-1005, but short by 10.00]
      2026-03-18  1200.00  TRANSFER FROM EXAMPLE SUPPLIES REF INV-1001  [names INV-1001, which is already settled: possible duplicate payment]
      2026-03-12  310.00  DEPOSIT 3301  -> INV-1006  [amount only]
    UNMATCHED BANK LINES (1)
      2026-03-20  42.00  UNKNOWN SENDER
    OPEN INVOICES (1)
      INV-1009  125.00  Mock Logistics  due 2026-03-28
    SKIPPED bank row 12: no valid date
    2 matched, 2 likely, 3 to review, 1 unmatched, 1 open invoices

Use `--payable` to match money out to bills. Run `tiedout` with no arguments to see all options, including `--json` and naming columns by hand.

## How it decides

| Group | Rule |
|---|---|
| **Matched** | The bank line names the invoices, and the amounts agree exactly |
| **Likely** | The party name appears and the amount fits only one option, or a set of that party's invoices adds up in only one way |
| **Review** | A named invoice with the wrong amount, a possible duplicate, a tie, or an amount with nothing else to support it |

It never breaks a tie, and it never reports a row as gone without saying why.

## MCP tools

| Tool | What it does |
|---|---|
| `reconcile_match` | Matches two CSV files and returns the groups, with a limit for large results |
| `reconcile_inspect_csv` | Shows detected columns and row counts, without row contents |

Both are read-only. `reconcile_match` returns names and amounts from your files to the MCP client, so they reach whichever AI model you use. The `tiedout` CLI keeps everything on your machine.

## Limits

- This helps with bookkeeping and isn't accounting advice. Check results before relying on them.
- It reads CSV only, so PDF statements need converting first.
- It assumes two decimal places and doesn't convert currencies. Lines in different currencies never match.
- It treats each file as the full list of open items. It doesn't track partial payments across runs.
- So far it has been tested on made-up data in common export formats, not on every bank's real exports. If yours fails, please open an issue with the column headers, not your data.

## FAQ

**How do I reconcile a bank statement with invoices automatically?** Export both as CSV and run `npx tiedout match bank.csv invoices.csv`. Matches come out with the reason, and anything uncertain goes to review.

**Is my financial data uploaded?** The tool has no network code. The CLI keeps everything on your machine. Through MCP, results go to whichever AI model your client uses.

**Does it work with QuickBooks, Xero or my bank?** It reads CSV exports rather than connecting to them. Most accounting tools and banks can export CSV. It hasn't been tested on each one's real exports yet.

**Can it match accounts payable?** Yes. Use `--payable` to match money out to bills.

## Contributing

Contributions are welcome, from people and from people working with AI agents. See [CONTRIBUTING.md](CONTRIBUTING.md). Good first issues:

- Add column names for more languages and accounting tools
- Add `--out` to write results to a CSV for a spreadsheet
- Support OFX and QIF bank files
- Track partial payments across several bank lines
- Add a plugin icon

## AI disclosure

This project was largely generated with Claude Code and reviewed by its maintainer.

## About me

I'm Giulliano Macedo, and I build developer tools at GoTech Solutions. Follow along or get in touch:

- GitHub: [GillMacedo](https://github.com/GillMacedo)
- LinkedIn: [giulliano](https://www.linkedin.com/in/giulliano/)
- X: [@giumacedo](https://x.com/giumacedo)

If `tiedout` saved you an afternoon, a star helps others find it.

---

MIT licensed.

Built by [Giulliano Macedo](https://github.com/GillMacedo), GoTech Solutions · [LinkedIn](https://www.linkedin.com/in/giulliano/) · [X](https://x.com/giumacedo)
