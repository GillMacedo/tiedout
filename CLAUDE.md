# tiedout

Matches bank statement CSVs to invoice CSVs. It's an MCP server, a CLI and a Claude Code plugin.

## Architecture
- `src/values.ts`: amounts as integer cents, dates.
- `src/csv.ts`, `src/load.ts`: reading files and finding columns.
- `src/match.ts`: the matching passes. `src/report.ts`: output.
- `src/server.ts`: MCP tools. `src/main.ts`: CLI.
- `plugin/`: plugin wrapper. `plugin/dist/tiedout.js` is the committed bundle, with no runtime dependencies.

## Commands

    make test    # typecheck and tests
    make build   # rebuild the bundle; commit the result
    make lint    # plugin validation and MCP Inspector
    make demo    # the README example

## Rules
- Money is integer cents. Never use floats for amounts.
- Never break a tie. Two possible answers go to review.
- Never drop a row silently. Skipped rows are reported with a reason.
- Never guess day-first or month-first when a column could be either.
- Never add network access or writes to input files.
- Sample data stays obviously made up, and nothing real goes in issues, tests or examples.
- Never write to stdout in server code, because it corrupts JSON-RPC.

## Definition of done
Tests pass, the bundle is rebuilt, the README example matches, and `ROADMAP.md` is updated if relevant. Only the maintainer merges to `main`.
