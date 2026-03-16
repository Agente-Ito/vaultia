# Deployment Guide – LUKSO Testnet

## Overview

This guide walks through deploying the Agent Vault Protocol to LUKSO testnet (chainId 4201).

## Prerequisites

### 1. Get PRIVATE_KEY

You need a testnet account with some LYX for gas:

```bash
# Generate a new account (or use an existing one)
node -e "const ethers = require('ethers'); const wallet = ethers.Wallet.createRandom(); console.log('Address:', wallet.address); console.log('Private Key:', wallet.privateKey);"
```

### 2. Get Testnet LYX

Visit the LUKSO faucet: https://faucet.testnet.lukso.network

Paste your address and claim testnet LYX. You'll need at least **5 LYX** for deployment + 50 LYX for vault funding.

### 3. Configure Environment

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Edit `.env`:
```
PRIVATE_KEY=0x... # Your 64-char hex private key (without 0x prefix, it will be handled)
```

Optional:
```
ETHERSCAN_API_KEY=ABC... # For contract verification
LUKSO_TESTNET_RPC=...    # Override RPC endpoint
```

## Deployment

### Compile Contracts

```bash
npm run compile
```

### Run Tests (Optional but Recommended)

```bash
npm test
```

### Deploy to LUKSO Testnet

```bash
npm run deploy:testnet
```

The script will:
1. ✅ Validate your account balance
2. ✅ Deploy `AgentVaultRegistry` (factory)
3. ✅ Deploy `MerchantRegistry` (optional directory)
4. ✅ Deploy a demo vault with:
   - **AgentSafe** (LSP9Vault)
   - **PolicyEngine** (policy orchestrator)
   - **BudgetPolicy** (100 LYX/week limit)
   - **LSP6KeyManager** (permission controller)
5. ✅ Accept LSP14 two-step ownership transfers
6. ✅ Fund the vault with 50 LYX
7. ✅ Update `.env` with all contract addresses
8. ✅ Display Block Explorer links

### Example Output

```
🔗 Network: luksoTestnet (chainId: 4201)
📍 Deployer: 0x1234...
💰 Balance: 100.5 LYX

📦 Deploying MerchantRegistry...
✅ MerchantRegistry: 0xabcd...

📦 Deploying AgentVaultRegistry...
✅ AgentVaultRegistry: 0xdef0...

📦 Deploying demo vault...
🤖 Demo agent address: 0x5678...
⚡ Estimated gas: 8500000

✅ Vault deployed in block: 9845213

🏛️  Vault Stack:
  AgentSafe:       0x1111...
  LSP6KeyManager:  0x2222...
  PolicyEngine:    0x3333...

🔐 Accepting ownership...
✅ Ownership accepted on AgentSafe
✅ Ownership accepted on PolicyEngine
✅ Ownership accepted on BudgetPolicy

💸 Funding vault with 50 LYX...
✅ Safe balance: 50.0 LYX

💾 Updating .env file...
✅ Variables saved to .env

🔍 Block Explorer Links (LUKSO Testnet):
  Registry:       https://explorer.testnet.lukso.network/address/0xabcd...
  Safe:           https://explorer.testnet.lukso.network/address/0x1111...
  KeyManager:     https://explorer.testnet.lukso.network/address/0x2222...
  PolicyEngine:   https://explorer.testnet.lukso.network/address/0x3333...

========================================
✅ Deployment Successful!
========================================

⚠️  IMPORTANT:
   • Agent wallet private key is printed above. Store it securely!
   • The vault is funded with 50 LYX for testing
   • Budget: 100 LYX per week (BudgetPolicy)
   • Merchant whitelist: deployer only
   • Expiration: 7 days from now
```

## Understanding the Vault Stack

### AgentSafe
- **Type**: LSP9Vault
- **Role**: Execution container for agent payments
- **Controls**: Validates all payments via PolicyEngine before execution
- **Access**: Only the linked LSP6KeyManager can call payment functions

### PolicyEngine
- **Type**: Policy orchestrator
- **Role**: Runs validation chain for each payment
- **Policies**: BudgetPolicy (mandatory) + optional MerchantPolicy + ExpirationPolicy

### LSP6KeyManager
- **Type**: Permission controller (native LUKSO standard)
- **Role**: Acts as intermediary for all agent transactions
- **Permissions**: Grants agents SUPER_CALL | SUPER_TRANSFERVALUE (actual restrictions in PolicyEngine)

### BudgetPolicy
- **Budget**: 100 LYX (configurable)
- **Period**: Weekly (0=daily, 1=weekly, 2=monthly, 3=yearly)
- **Behavior**: Resets spend counter at period boundaries

## Making Test Payments

After deployment, the script saves addresses to `.env`. To make test payments:

```bash
# You can use the agent wallet to call through the KeyManager
# Example: send 10 LYX to a merchant

# 1. Import agent wallet
const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
const agentWallet = new ethers.Wallet(agentPrivateKey, ethers.provider);

// 2. Get contracts
const km = await ethers.getContractAt('LSP6KeyManager', process.env.KEY_MANAGER_ADDRESS);
const safe = await ethers.getContractAt('AgentSafe', process.env.AGENT_SAFE_ADDRESS);

// 3. Execute payment
const merchant = "0x..."; // recipient address
const amount = ethers.parseEther("10");
const callData = safe.interface.encodeFunctionData('agentExecute', [merchant, amount, "0x"]);
const tx = await km.connect(agentWallet).execute(OPERATION_CALL, safe.address, 0, callData);

// 4. Wait for confirmation
await tx.wait();
```

## Troubleshooting

### "Deployer balance is 0"
→ Fund your testnet account: https://faucet.testnet.lukso.network

### "PRIVATE_KEY invalid or not set"
→ Check `.env` file has `PRIVATE_KEY=0x...` (with proper 64-char hex format)

### "Transaction reverted: insufficient balance"
→ You need more than 5 LYX for deployment + transfer fees

### "acceptOwnership failed"
→ Contracts may already have different owners. Check block explorer.

### "VaultDeployed event not found"
→ Transaction succeeded but event wasn't emitted. Check block explorer for transaction details.

## Verification (Optional)

To verify contracts on LUKSO block explorer:

```bash
# Set ETHERSCAN_API_KEY in .env first, then:
npx hardhat verify --network luksoTestnet <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

Example:
```bash
npx hardhat verify --network luksoTestnet 0x1234... 0x5678 # AgentVaultRegistry
```

## Next Steps

1. **Test agent payments** through the KeyManager
2. **Add merchants** to the MerchantPolicy whitelist
3. **Monitor spending** against BudgetPolicy limits
4. **Move to mainnet** when ready (same steps, different network)

## Useful Links

- **LUKSO Testnet Faucet**: https://faucet.testnet.lukso.network
- **Block Explorer**: https://explorer.testnet.lukso.network
- **Documentation**: https://docs.lukso.tech

## Support

For issues or questions:
- Check Hardhat logs: `HARDHAT_LOGGING=true npm run deploy:testnet`
- Verify on block explorer: https://explorer.testnet.lukso.network
- Review contract source in `/contracts`
