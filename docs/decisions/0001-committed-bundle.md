# 0001: Commit one bundled file

**Decision:** `plugin/dist/tiedout.js` is committed, with all dependencies bundled.

**Why:** a plugin installed from GitHub gets no build or install step, and should work right after install.

**Trade-off:** a large generated file in the repo. CI rebuilds it and fails on any difference, so it can't drift from the source.

**Alternatives:** an install step on first run, rejected as extra network access and a supply chain step at runtime.
