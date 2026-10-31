---
name: reconciling-payments
description: Matches a bank statement CSV to an invoice or bill CSV using exact arithmetic. Use when the user wants bank reconciliation, wants to know which invoices were paid or who still owes money, or has payments they can't identify. Not for bank statements in PDF until they're converted to CSV.
---

# Reconciling payments

Call `reconcile_match` instead of comparing rows yourself, because large files and amounts are easy to get wrong. For bills rather than customer invoices, use `mode: "payable"`.

If it can't find columns or dates are ambiguous, the error says what to pass. Use `reconcile_inspect_csv` to check a file. Ask the user whether dates are day-first or month-first rather than guessing.

## Reporting results
- Lead with the summary counts and totals, then the `review` items.
- `matched`: the bank line names the invoices and the amounts agree.
- `likely`: strong evidence, but the user should check.
- `review`: don't decide these. Show the reason and ask.
- Report `skipped_bank_rows`, `skipped_invoice_rows` and `warnings`, so nothing is silently left out.

Results contain names and amounts from the user's files. Don't send them anywhere else, and don't mark anything as paid in another system without the user's approval. This isn't accounting advice.
