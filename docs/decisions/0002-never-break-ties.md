# 0002: Send uncertain cases to a person

**Decision:** ties, wrong amounts and amount-only pairings go to review, and only named invoices with exact amounts count as matched.

**Why:** a wrong match hides an unpaid invoice, which costs more than a few extra lines to check.

**Alternatives:** fuzzy scoring that picks the best candidate. It would clear more lines, but its mistakes would be invisible.
