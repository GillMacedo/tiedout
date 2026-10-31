.PHONY: test build lint demo

INSPECTOR = npx -y @modelcontextprotocol/inspector@2.13.0 --cli node plugin/dist/tiedout.js serve

test:
	npm run -s typecheck
	npm test

build:
	npm run -s build

lint:
	claude plugin validate ./plugin --strict
	claude plugin validate . --strict
	$(INSPECTOR) --protocol-era modern --method tools/list --strict
	$(INSPECTOR) --protocol-era legacy --method tools/list --strict

demo:
	node plugin/dist/tiedout.js match examples/bank.csv examples/invoices.csv
