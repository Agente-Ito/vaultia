# Demo Script — Happy Path

Setup
- Set UP address and controller in .env
- Ensure policy caps and recipient in policies/policy.example.json

Flow
1) User: "Envía 0.005 LYX a <recipient> por <motivo>"
2) Agent: muestra plan y política aplicada (cap, expiry, allowlist)
3) Ejecuta vía UP -> KeyManager; muestra tx hash
4) Emite recibo JSON y lo guarda en receipts/out/<id>.json
5) Verifica con: node receipts/verifier.js receipts/out/<id>.json

Edge cases
- Destinatario no en allowlist → bloquea y explica
- Monto > maxAmountWei → escalado a humano o rechazo