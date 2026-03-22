#!/usr/bin/env node
/**
 * keeper.js — LUKSO TaskScheduler keeper process
 *
 * Continuously polls TaskScheduler.getEligibleTasks() every POLL_INTERVAL_MS
 * and calls executeTask() for each eligible task.
 *
 * Environment variables (loaded from project root .env):
 *   PRIVATE_KEY              — keeper's signing wallet (pays gas for executeTask calls)
 *   TASK_SCHEDULER_ADDRESS   — deployed TaskScheduler contract address
 *   RPC_URL                  — optional override (defaults to LUKSO testnet RPC)
 *   POLL_INTERVAL_MS         — optional polling interval in ms (default: 30000)
 *
 * Usage:
 *   cd /path/to/agent-vault-protocol
 *   node runner/keeper.js
 *
 * Or with env override:
 *   POLL_INTERVAL_MS=10000 node runner/keeper.js
 */

'use strict';

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ─── Configuration ────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.testnet.lukso.network';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCHEDULER_ADDR = process.env.TASK_SCHEDULER_ADDRESS;
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS || '30000', 10);
const LOG_FILE = path.join(__dirname, '..', 'logs', 'keeper_log.json');

// ─── Validation ───────────────────────────────────────────────────────────────

if (!PRIVATE_KEY) {
  console.error('[keeper] ❌ PRIVATE_KEY is required in .env');
  process.exit(1);
}
if (!SCHEDULER_ADDR || SCHEDULER_ADDR.length < 10) {
  console.error('[keeper] ❌ TASK_SCHEDULER_ADDRESS is required in .env');
  process.exit(1);
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const SCHEDULER_ABI = [
  'function getEligibleTasks() external view returns (bytes32[] memory)',
  'function executeTask(bytes32 taskId) external returns (bool success)',
  'function getTask(bytes32 taskId) external view returns (address vault, address keyManager, bytes executeCalldata, uint8 triggerType, uint256 nextExecution, uint256 interval, bool enabled, uint256 createdAt)',
  'function getTaskCount() external view returns (uint256)',
  'function keeperWhitelistEnabled() external view returns (bool)',
  'function isWhitelistedKeeper(address keeper) external view returns (bool)',
  'event TaskExecuted(bytes32 indexed taskId, uint256 newNextExecution, uint256 executedAt)',
];

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level, msg, extra) {
  const entry = {
    ts: new Date().toISOString(),
    process: 'keeper',
    level,
    msg,
    ...(extra || {}),
  };
  // Structured JSON line to stdout — same format as agent-runner.js
  process.stdout.write(JSON.stringify(entry) + '\n');

  // Persist to keeper log file (keep last 1000 entries)
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let entries = [];
    if (fs.existsSync(LOG_FILE)) {
      entries = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
    entries.unshift(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(entries.slice(0, 1000), null, 2));
  } catch { /* non-fatal — don't crash the keeper loop over logging */ }
}

// ─── Keeper loop ──────────────────────────────────────────────────────────────

async function runOnce(scheduler, wallet) {
  let eligible;
  try {
    eligible = await scheduler.getEligibleTasks();
  } catch (err) {
    log('warn', 'getEligibleTasks() failed — RPC issue?', { error: err.message });
    return;
  }

  if (eligible.length === 0) {
    log('info', 'No eligible tasks', { checked: (await scheduler.getTaskCount()).toString() });
    return;
  }

  log('info', `${eligible.length} task(s) eligible for execution`, {
    taskIds: eligible.map((id) => id.slice(0, 18) + '…'),
  });

  for (const taskId of eligible) {
    let task;
    try {
      task = await scheduler.getTask(taskId);
    } catch (err) {
      log('warn', 'Could not fetch task info', { taskId, error: err.message });
      continue;
    }

    log('info', 'Executing task', {
      taskId,
      vault: task.vault,
      nextExecution: new Date(Number(task.nextExecution) * 1000).toISOString(),
    });

    try {
      const tx = await scheduler.executeTask(taskId);
      log('info', 'Transaction sent', { taskId, txHash: tx.hash });

      const receipt = await tx.wait();
      if (receipt.status === 1) {
        log('info', '✅ Task executed successfully', {
          taskId,
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
        });
      } else {
        log('error', '❌ Transaction mined but reverted', {
          taskId,
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
        });
      }
    } catch (err) {
      // Log error but continue — never crash the loop over a single task failure
      const reason = err?.reason || err?.message || String(err);
      log('error', '❌ executeTask() failed', { taskId, error: reason });
    }
  }
}

async function main() {
  log('info', '🚀 Keeper starting', {
    rpc: RPC_URL,
    scheduler: SCHEDULER_ADDR,
    pollMs: POLL_MS,
  });

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const scheduler = new ethers.Contract(SCHEDULER_ADDR, SCHEDULER_ABI, wallet);

  const network = await provider.getNetwork();
  const balance = await provider.getBalance(wallet.address);

  log('info', 'Connected', {
    network: network.name,
    chainId: network.chainId.toString(),
    keeper: wallet.address,
    balance: ethers.formatEther(balance) + ' LYX',
  });

  if (balance < ethers.parseEther('0.01')) {
    log('warn', '⚠️  Keeper balance is very low — may not have enough gas to execute tasks', {
      balance: ethers.formatEther(balance) + ' LYX',
    });
  }

  const taskCount = await scheduler.getTaskCount();
  const whitelistEnabled = await scheduler.keeperWhitelistEnabled();
  const keeperAllowed = whitelistEnabled
    ? await scheduler.isWhitelistedKeeper(wallet.address)
    : true;

  if (whitelistEnabled && !keeperAllowed) {
    log('error', 'Keeper is not whitelisted on TaskScheduler', {
      address: wallet.address,
      scheduler: SCHEDULER_ADDR,
      action: 'Add this keeper on-chain with addKeeper(address) or disable whitelist intentionally via setKeeperWhitelistEnabled(false).',
    });
    process.exit(1);
  }

  log('info', 'TaskScheduler ready', {
    address: SCHEDULER_ADDR,
    registeredTasks: taskCount.toString(),
    keeperWhitelistEnabled: whitelistEnabled,
    keeperAllowed,
  });

  // ── Initial run ──────────────────────────────────────────────────────────────
  await runOnce(scheduler, wallet);

  // ── Polling loop ─────────────────────────────────────────────────────────────
  log('info', `Polling every ${POLL_MS / 1000}s — press Ctrl+C to stop`);

  let pollInFlight = false;

  setInterval(async () => {
    if (pollInFlight) {
      log('debug', 'Skipping overlapping poll tick');
      return;
    }

    pollInFlight = true;
    try {
      await runOnce(scheduler, wallet);
    } catch (err) {
      // Top-level catch: log and keep the interval alive
      log('error', 'Unhandled error in runOnce', { error: err.message });
    } finally {
      pollInFlight = false;
    }
  }, POLL_MS);
}

main().catch((err) => {
  console.error('[keeper] Fatal error:', err.message || err);
  process.exit(1);
});
