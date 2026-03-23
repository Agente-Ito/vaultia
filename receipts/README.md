# Receipts

- Schema: receipts/schema.json
- Generate: app writes receipts/out/<uuid>.json after each on-chain payment
- Verify: node receipts/verifier.js receipts/out/<uuid>.json

Action hash
- keccak256 of `${actorUP}|${action}|${target}|${amountWei}|${txHash}|${timestamp}`
- Signature: EIP-191 over the same preimage by the controller key
