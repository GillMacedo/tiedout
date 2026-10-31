# Architecture

    bank.csv ─────> load ─┐
                          ├─> match ─> report ─> CLI and MCP tools
    invoices.csv ─> load ─┘

**Loading:** finds the header in the first 20 rows, since bank exports often start with title lines. Rows it can't read are listed with a reason. Amounts become integer cents. The date format comes from the whole column, and a column that could be either format stops with an error.

**Matching runs in passes,** and each line and invoice is used once:
1. The line names invoices. If amounts agree it's matched, otherwise review with the difference.
2. The line names an invoice already settled: review as a possible duplicate.
3. Exact amount and party name, if only one pairing fits: likely. Ties go to review.
4. One payment for several invoices of a party, if only one subset adds up: likely.
5. Exact amount alone, if only one pairing fits: review. Ties go to review.

Tie checks use a snapshot, so the result doesn't depend on line order. Named matches ignore the date window, and weaker ones must fall within it.

**Privacy:** no network code. The test suite checks the source for it, and verification runs with the network off.

**Packaging:** esbuild bundles everything into one committed file, so the plugin works with no install step. CI checks that the bundle matches the source.

See `docs/decisions/`.
