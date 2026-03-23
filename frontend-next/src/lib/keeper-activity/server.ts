import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import { Interface, ethers } from 'ethers';

const TASK_SCHEDULER_ADDRESS = process.env.TASK_SCHEDULER_ADDRESS ?? process.env.NEXT_PUBLIC_TASK_SCHEDULER_ADDRESS ?? '';
const RPC_URL = process.env.RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? 'https://rpc.testnet.lukso.network';
const SCHEDULER_ABI = [
  'function getTask(bytes32 taskId) external view returns (address vault, address keyManager, bytes executeCalldata, uint8 triggerType, uint256 nextExecution, uint256 interval, bool enabled, uint256 createdAt)',
];

const keyManagerInterface = new Interface(['function execute(bytes _data)']);
const safeInterface = new Interface(['function execute(uint256 operation, address to, uint256 value, bytes data)']);
const lsp7Interface = new Interface(['function transfer(address from, address to, uint256 amount, bool allowNonLSP1Recipient, bytes data)']);

type KeeperLogEntry = {
  ts?: string;
  process?: string;
  level?: string;
  msg?: string;
  taskId?: string;
  txHash?: string;
  blockNumber?: number;
  error?: string;
  vault?: string;
};

export interface KeeperActivityEntry {
  id: string;
  status: 'approved' | 'blocked';
  type: 'LYX' | 'TOKEN';
  vaultSafe: string;
  to: string;
  amount: string;
  token?: string;
  txHash?: string;
  blockNumber?: number;
  reason: string;
  createdAt: number;
}

function getRepoRoot() {
  return path.resolve(process.cwd(), '..');
}

function getKeeperLogPath() {
  return path.join(getRepoRoot(), 'logs', 'keeper_log.json');
}

function readKeeperLogEntries(): KeeperLogEntry[] {
  const logPath = getKeeperLogPath();
  if (!fs.existsSync(logPath)) {
    return [];
  }

  try {
    const payload = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    return Array.isArray(payload) ? payload as KeeperLogEntry[] : [];
  } catch {
    return [];
  }
}

function shouldIncludeEntry(entry: KeeperLogEntry) {
  const msg = entry.msg ?? '';
  return msg.includes('executeTask() failed')
    || msg.includes('Transaction mined but reverted')
    || msg.includes('Task executed successfully');
}

function deriveStatus(entry: KeeperLogEntry): KeeperActivityEntry['status'] {
  const msg = entry.msg ?? '';
  return msg.includes('Task executed successfully') ? 'approved' : 'blocked';
}

function toMillis(value?: string) {
  if (!value) return Date.now();
  const millis = Date.parse(value);
  return Number.isNaN(millis) ? Date.now() : millis;
}

function deriveReason(entry: KeeperLogEntry) {
  if (entry.error && entry.error.trim().length > 0) {
    return entry.error;
  }

  if ((entry.msg ?? '').includes('Transaction mined but reverted')) {
    return 'Automated execution reverted on-chain';
  }

  return entry.msg ?? 'Automated execution failed';
}

async function loadTaskMap(taskIds: string[]) {
  if (!TASK_SCHEDULER_ADDRESS || taskIds.length === 0) {
    return new Map<string, [string, string, string, number, bigint, bigint, boolean, bigint]>();
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const scheduler = new ethers.Contract(TASK_SCHEDULER_ADDRESS, SCHEDULER_ABI, provider);
  const uniqueTaskIds = [...new Set(taskIds)];

  const tasks = await Promise.all(uniqueTaskIds.map(async (taskId) => {
    try {
      const task = await scheduler.getTask(taskId);
      return [taskId, task] as const;
    } catch {
      return null;
    }
  }));

  return new Map(tasks.filter((item): item is readonly [string, [string, string, string, number, bigint, bigint, boolean, bigint]] => item !== null));
}

function decodeTask(task: [string, string, string, number, bigint, bigint, boolean, bigint]) {
  const [vault, , executeCalldata] = task;

  try {
    const decodedKeyManager = keyManagerInterface.decodeFunctionData('execute', executeCalldata);
    const vaultExecutePayload = decodedKeyManager[0] as string;
    const decodedSafe = safeInterface.decodeFunctionData('execute', vaultExecutePayload);
    const target = decodedSafe[1] as string;
    const value = decodedSafe[2] as bigint;
    const data = decodedSafe[3] as string;

    if (value > BigInt(0)) {
      return {
        vault,
        type: 'LYX' as const,
        to: target,
        amount: ethers.formatEther(value),
      };
    }

    try {
      const decodedTokenTransfer = lsp7Interface.decodeFunctionData('transfer', data);
      const to = decodedTokenTransfer[1] as string;
      const amount = decodedTokenTransfer[2] as bigint;
      return {
        vault,
        type: 'TOKEN' as const,
        to,
        amount: ethers.formatEther(amount),
        token: target,
      };
    } catch {
      return {
        vault,
        type: 'TOKEN' as const,
        to: target,
        amount: '0',
        token: target,
      };
    }
  } catch {
    return {
      vault,
      type: 'LYX' as const,
      to: vault,
      amount: '0',
    };
  }
}

export async function getKeeperActivity(vaultSafes?: string[]): Promise<KeeperActivityEntry[]> {
  const entries = readKeeperLogEntries().filter(shouldIncludeEntry);
  if (entries.length === 0) {
    return [];
  }

  const tasks = await loadTaskMap(entries.map((entry) => entry.taskId).filter((taskId): taskId is string => typeof taskId === 'string' && taskId.length > 0));
  const allowedVaults = vaultSafes?.length ? new Set(vaultSafes.map((vaultSafe) => vaultSafe.toLowerCase())) : null;

  return entries.flatMap((entry, index) => {
    const task = entry.taskId ? tasks.get(entry.taskId) : undefined;
    const decoded = task ? decodeTask(task) : null;
    const vaultSafe = (decoded?.vault ?? entry.vault ?? '').toLowerCase();

    if (!vaultSafe) {
      return [];
    }

    if (allowedVaults && !allowedVaults.has(vaultSafe)) {
      return [];
    }

    return [{
      id: `${entry.taskId ?? 'keeper'}-${entry.txHash ?? 'no-tx'}-${index}`,
      status: deriveStatus(entry),
      type: decoded?.type ?? 'LYX',
      vaultSafe,
      to: decoded?.to ?? vaultSafe,
      amount: decoded?.amount ?? '0',
      token: decoded?.token,
      txHash: entry.txHash,
      blockNumber: entry.blockNumber,
      reason: deriveReason(entry),
      createdAt: toMillis(entry.ts),
    }];
  }).sort((left, right) => right.createdAt - left.createdAt);
}