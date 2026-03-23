# Agents with Receipt — Vaultia

Receipt format (off-chain signed attestation)
- Conforms to receipts/schema.json
- Includes: receiptId, actorUP, action, target, amountWei, txHash, timestamp,
  policy { maxAmountWei, expirySec, allowedTargets }, actionHash, signature
- Signature: EIP-191 (personal_sign) by the agent/controller address

Verification
- CLI: node receipts/verifier.js ./receipts/out/<id>.json
- Web: in-app verify route (reads JSON, recomputes hash, verifies signature)

Optional on-chain signal
- Emit lightweight event with receiptId + txHash for discoverability.

Demo
- Generate receipt after payment; verify live; show tamper-detection works.

References
- STRESS_TEST_REPORT.md (live testnet evidence)