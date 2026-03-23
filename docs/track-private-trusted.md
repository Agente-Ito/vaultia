# Private Agents / Trusted Actions — Vaultia

Approach
- Use LSP6 KeyManager permissions with least privilege to scope actions.
- Sensitive operations require explicit policy approval and short-lived permissions.
- Private logs: minimal metadata captured; public verification via receipt only.

What is private vs public
- Private: internal deliberation, vault credentials, granular policy evaluation.
- Public/verifiable: action result (tx/event), receipt signature, policy snapshot hash.

Demo
- Attempt a disallowed recipient → agent blocks with rationale.
- Allowed, within limits → execute; emit receipt with policy snapshot hash.

Artifacts
- policies/policy.example.json
- receipts/schema.json + receipts/verifier.js
- docs/privacy.md (explain boundaries)