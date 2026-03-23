# Best Use of Delegations — Vaultia

Design
- Least-privilege LSP6 permissions; avoid SUPER_* in public demo.
- Scope by target contract, function selectors, and amount caps.
- Add expirations and session IDs to permission grants.
- Optional: LSP25 for relayed meta-transactions (if used).

Evidence in repo
- policies/policy.example.json documents the permission set.
- Code shows UP.execute calls restricted to specific selectors.
- Receipts include policy snapshot and expiry.

Demo assertions
- Permission refusal for disallowed target/selector.
- Success when within policy; failure when exceeding caps.
