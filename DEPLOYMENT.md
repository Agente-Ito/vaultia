# Deployment Guide – LUKSO Testnet

## Overview

This guide walks through deploying the Agent Vault Protocol to LUKSO testnet (chainId 4201).

For a live testnet infrastructure refresh, use the operational checklist in [TESTNET_REDEPLOY_CHECKLIST.md](/Users/antonio/agent-vault-protocol/TESTNET_REDEPLOY_CHECKLIST.md) before changing the canonical registry address.

## Prerequisites

### 1. Get PRIVATE_KEY

You need a testnet account with some LYX for gas:

```bash
# Generate a new account (or use an existing one)
node -e "const ethers = require('ethers'); const wallet = ethers.Wallet.createRandom(); console.log('Address:', wallet.address); console.log('Private Key:', wallet.privateKey);"
```

### 2. Get Testnet LYX

Visit the LUKSO faucet: [https://faucet.testnet.lukso.network](https://faucet.testnet.lukso.network)

Paste your address and claim testnet LYX. You'll need at least **5 LYX** for deployment + 50 LYX for vault funding.

### 3. Configure Environment

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
PRIVATE_KEY=0x... # Your 64-char hex private key (without 0x prefix, it will be handled)
```

Optional:

```dotenv
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
2. ✅ Deploy `MerchantRegistry` (optional directory)
3. ✅ Deploy `AgentVaultDeployerCore`, `AgentVaultDeployer`, and `AgentKMDeployer`
4. ✅ Deploy `TaskScheduler` with keeper whitelist enabled by default and the deployer as the initial keeper
5. ✅ Deploy `AgentCoordinator` and `SharedBudgetPool`
6. ✅ Deploy `AgentVaultRegistry` and wire protocol authorizations into `AgentCoordinator` and `SharedBudgetPool`
7. ✅ Deploy a starter test vault with:
   - **AgentSafe** (LSP9Vault)
   - **PolicyEngine** (policy orchestrator)
   - **BudgetPolicy** (100 LYX/week limit)
   - **LSP6KeyManager** (permission controller)
8. ✅ Accept LSP14 two-step ownership transfers
9. ✅ Fund the vault with 50 LYX
10. ✅ Update `.env` with all contract addresses
11. ✅ Display Block Explorer links

### Example Output

```text
🔗 Network: luksoTestnet (chainId: 4201)
📍 Deployer: 0x1234...
💰 Balance: 100.5 LYX

📦 Deploying MerchantRegistry...
✅ MerchantRegistry: 0xabcd...

📦 Deploying AgentVaultRegistry...
✅ AgentVaultRegistry: 0xdef0...

📦 Deploying starter test vault...
🤖 Sample agent address: 0x5678...
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
- **Emergency stop**: `setPaused(true)` freezes all safe-routed execution for that vault

### LSP6KeyManager

- **Type**: Permission controller (native LUKSO standard)
- **Role**: Acts as intermediary for all agent transactions
- **Permissions**: Grants agents SUPER_CALL | SUPER_TRANSFERVALUE (actual restrictions in PolicyEngine)

### TaskScheduler

- **Type**: Recurring execution scheduler
- **Role**: Lets off-chain keepers trigger eligible tasks on-chain
- **Security default**: keeper whitelist is enabled at deploy time
- **Initial keeper**: the deployer is whitelisted automatically in the constructor
- **Operations**: add backup keepers with `addKeeper(address)` or disable whitelist explicitly only if you intend to run an open executor model

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

## Emergency Operations

### Pause a vault immediately

If you need to freeze all agent-routed execution for a deployed vault, pause its `PolicyEngine`:

```bash
const pe = await ethers.getContractAt("PolicyEngine", process.env.POLICY_ENGINE_ADDRESS);
await pe.setPaused(true);
```

Effect:

- `PolicyEngine.validate()` reverts with `PE: paused`
- all `AgentSafe` payments that depend on policy validation are blocked
- `simulateExecution()` returns a paused result instead of a pass/fail policy scan

Resume by calling:

```bash
await pe.setPaused(false);
```

### Add a backup keeper

The scheduler is no longer open by default. To allow a second keeper process:

```bash
const scheduler = await ethers.getContractAt("TaskScheduler", process.env.TASK_SCHEDULER_ADDRESS);
await scheduler.addKeeper("0xBackupKeeper...");
```

If your operational model intentionally wants any address to execute eligible tasks,
the owner can opt out of whitelist enforcement:

```bash
await scheduler.setKeeperWhitelistEnabled(false);
```

## Troubleshooting

### "Deployer balance is 0"

→ Fund your testnet account: [https://faucet.testnet.lukso.network](https://faucet.testnet.lukso.network)

### "PRIVATE_KEY invalid or not set"

→ Check `.env` file has `PRIVATE_KEY=0x...` (with proper 64-char hex format)

### "Transaction reverted: insufficient balance"

→ You need more than 5 LYX for deployment + transfer fees

### "acceptOwnership failed"

→ Contracts may already have different owners. Check block explorer.

### "TS: keeper not whitelisted"

→ `TaskScheduler` now starts with whitelist enforcement enabled. Add the keeper
address with `addKeeper()` or use the deployer account as the initial keeper.

### "PE: paused"

→ The vault's `PolicyEngine` is currently frozen. Call `setPaused(false)` from
the owner account after the incident or maintenance window is resolved.

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

## Frontend Preview/Staging Deploys (Vercel)

For a beta preview, staging environment, or internal testnet review, the frontend can be deployed safely to
Vercel as long as the required public environment variables are configured.

The old interactive frontend demo mode has been removed. This section is only about deploying the real testnet UI with the features you want exposed.

Current scope:

- LUKSO Testnet only for the LUKSO side
- Base Sepolia only for the Base side
- No mainnet contracts are documented or supported in this deployment path yet

### 1. Prepare the frontend environment variables

Use [frontend-next/.env.local.example](frontend-next/.env.local.example) as the
source of truth for frontend configuration.

Required in Vercel:

```bash
NEXT_PUBLIC_RPC_URL=https://rpc.testnet.lukso.network
NEXT_PUBLIC_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_BASE_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_BASE_CHAIN_ID=84532
NEXT_PUBLIC_BASE_VAULT_FACTORY_ADDRESS=0x...
```

Optional in Vercel:

```bash
NEXT_PUBLIC_COORDINATOR_ADDRESS=0x...
NEXT_PUBLIC_TASK_SCHEDULER_ADDRESS=0x...
NEXT_PUBLIC_INDEXER_URL=https://your-indexer.example/v1/graphql
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

Notes:

- `NEXT_PUBLIC_COORDINATOR_ADDRESS` is only needed if the Agents page should be enabled.
- `NEXT_PUBLIC_TASK_SCHEDULER_ADDRESS` is only needed if automation features should be visible in that preview.
- `NEXT_PUBLIC_INDEXER_URL` is optional; when omitted, profile data falls back to direct ERC725.js reads.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is optional; when omitted, the frontend hides WalletConnect and Rainbow wallet options instead of showing broken mobile/QR flows.

### 2. Add the variables in Vercel

In the Vercel project:

1. Open `Settings`.
2. Open `Environment Variables`.
3. Add every required `NEXT_PUBLIC_*` variable.
4. Add optional values only for the features you want visible in that preview environment.
5. Apply them to `Preview` and `Production` environments as needed.

Important:

- The frontend build now fails in production when required variables are missing.
- This is intentional so misconfigured previews or production deploys do not ship a partially broken UI.

### 3. Configure WalletConnect Cloud (free plan)

If QR code and mobile wallet support are needed, create a free WalletConnect Cloud project:

1. Go to [WalletConnect Cloud](https://cloud.walletconnect.com).
2. Create a project on the free plan.
3. Copy the generated `Project ID`.
4. Add it to Vercel as `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
5. Register your allowed domains in WalletConnect Cloud.

Recommended domains to register:

- your production domain
- your Vercel preview domain pattern if you plan to test previews
- any custom staging domain used during internal review or preview testing

If you skip this step:

- MetaMask, Coinbase Wallet, and Universal Profiles remain available.
- Rainbow and WalletConnect are hidden automatically.

### 4. Deploy the frontend

From the `frontend-next/` app:

```bash
npm install
npm run build
```

If the local production build succeeds, connect the repository to Vercel and deploy the `frontend-next` app directory.

### 5. Validate the hosted frontend preview

After deployment, verify:

1. The app loads and the wallet modal opens.
2. Vault creation works on LUKSO Testnet.
3. Base flows only appear if `NEXT_PUBLIC_BASE_VAULT_FACTORY_ADDRESS` is configured.
4. Agents and automation pages only appear when their optional contract addresses are set.
5. WalletConnect/Rainbow only appear when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is configured with an allowed domain.

## Next Steps

1. **Test agent payments** through the KeyManager
2. **Add merchants** to the MerchantPolicy whitelist
3. **Monitor spending** against BudgetPolicy limits
4. **Move to mainnet** when ready (same steps, different network)

## Useful Links

- **LUKSO Testnet Faucet**: [https://faucet.testnet.lukso.network](https://faucet.testnet.lukso.network)
- **Block Explorer**: [https://explorer.testnet.lukso.network](https://explorer.testnet.lukso.network)
- **Documentation**: [https://docs.lukso.tech](https://docs.lukso.tech)

## Support

For issues or questions:

- Check Hardhat logs: `HARDHAT_LOGGING=true npm run deploy:testnet`
- Verify on block explorer: [https://explorer.testnet.lukso.network](https://explorer.testnet.lukso.network)
- Review contract source in `/contracts`
