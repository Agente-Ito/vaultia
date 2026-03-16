'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { ethers, Interface } from 'ethers';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/common/Alert';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { SkeletonCard } from '@/components/common/Skeleton';
import { getSchedulerContract } from '@/lib/web3/contracts';
import { getProvider } from '@/lib/web3/provider';

const SCHEDULER_ADDRESS = process.env.NEXT_PUBLIC_SCHEDULER_ADDRESS ?? '';

const TRIGGER_LABELS: Record<number, string> = { 0: 'Timestamp', 1: 'Block Number' };

const INTERVAL_PRESETS = [
  { label: 'Daily', seconds: 86400 },
  { label: 'Weekly', seconds: 604800 },
  { label: 'Monthly', seconds: 2592000 },
];

interface TaskRecord {
  id: string;
  vault: string;
  keyManager: string;
  triggerType: number;
  nextExecution: bigint;
  interval: bigint;
  enabled: boolean;
  createdAt: bigint;
  executable?: boolean;
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as { reason?: unknown; message?: unknown };

    if (typeof maybeError.reason === 'string' && maybeError.reason) {
      return maybeError.reason;
    }

    if (typeof maybeError.message === 'string' && maybeError.message) {
      return maybeError.message;
    }
  }

  return String(error);
}

// Build calldata for a simple LYX payment through the KeyManager
function buildPaymentCalldata(recipient: string, amountLyx: string): string {
  const safeIface = new Interface([
    'function execute(uint256 operationType, address target, uint256 value, bytes data) external payable returns (bytes)',
  ]);
  const kmIface = new Interface(['function execute(bytes _data) external returns (bytes)']);
  const innerCall = safeIface.encodeFunctionData('execute', [
    0,
    recipient,
    ethers.parseEther(amountLyx),
    '0x',
  ]);
  return kmIface.encodeFunctionData('execute', [innerCall]);
}

function formatExecution(task: TaskRecord): string {
  if (task.triggerType === 0) {
    return new Date(Number(task.nextExecution) * 1000).toLocaleString();
  }
  return `Block ${task.nextExecution.toString()}`;
}

function formatInterval(task: TaskRecord): string {
  if (task.triggerType === 0) {
    const s = Number(task.interval);
    if (s === 86400) return 'Daily';
    if (s === 604800) return 'Weekly';
    if (s === 2592000) return 'Monthly';
    return `${s}s`;
  }
  return `${task.interval} blocks`;
}

function short(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export default function AutomationPage() {
  const { registry, signer, account, isConnected } = useWeb3();
  const { vaults } = useVaults(registry, account);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [selectedVault, setSelectedVault] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('0.1');
  const [firstRun, setFirstRun] = useState('');
  const [intervalPreset, setIntervalPreset] = useState('604800');
  const [creating, setCreating] = useState(false);
  const [createStatus, setCreateStatus] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const isConfigured = !!SCHEDULER_ADDRESS;

  const load = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const provider = getProvider();
      const scheduler = getSchedulerContract(SCHEDULER_ADDRESS, provider);
      const count: bigint = await scheduler.getTaskCount();
      if (count === BigInt(0)) { setTasks([]); return; }

      const ids: string[] = await scheduler.getTaskIds(0, Number(count));
      const records: TaskRecord[] = await Promise.all(
        ids.map(async (id) => {
          const [vault, keyManager, , triggerType, nextExecution, interval, enabled, createdAt] =
            await scheduler.getTask(id);
          let executable = false;
          try { executable = await scheduler.isExecutable(id); } catch {}
          return { id, vault, keyManager, triggerType: Number(triggerType), nextExecution, interval, enabled, createdAt, executable };
        })
      );
      setTasks(records);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (task: TaskRecord) => {
    if (!signer) return;
    setTogglingId(task.id);
    const scheduler = getSchedulerContract(SCHEDULER_ADDRESS, signer);
    try {
      const tx = task.enabled
        ? await scheduler.disableTask(task.id)
        : await scheduler.enableTask(task.id);
      await tx.wait();
      await load();
    } catch (err: unknown) {
      alert('Error: ' + getErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signer || !selectedVault) return;
    setCreating(true);
    setCreateStatus('');
    try {
      const vault = vaults.find((v) => v.safe === selectedVault);
      if (!vault) throw new Error('Vault not found');

      const calldata = buildPaymentCalldata(recipient, amount);
      const taskId = ethers.id(`${selectedVault}-${recipient}-${Date.now()}`);
      const firstRunUnix = firstRun
        ? Math.floor(new Date(firstRun).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + Number(intervalPreset);

      const scheduler = getSchedulerContract(SCHEDULER_ADDRESS, signer);
      setCreateStatus('Sending transaction…');
      const tx = await scheduler.createTask(
        taskId,
        vault.safe,
        vault.keyManager,
        calldata,
        0,
        firstRunUnix,
        Number(intervalPreset)
      );
      setCreateStatus('Waiting for confirmation…');
      await tx.wait();
      setCreateStatus('Task created!');
      setRecipient('');
      await load();
    } catch (err: unknown) {
      setCreateStatus('Error: ' + getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className="space-y-lg">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">Automation</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-xs">Schedule recurring payments</p>
        </div>
        <Alert variant="warning">
          <AlertTitle>TaskScheduler not configured</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-xs bg-neutral-100 dark:bg-neutral-700 px-1 rounded">NEXT_PUBLIC_SCHEDULER_ADDRESS</code> in your <code className="font-mono text-xs bg-neutral-100 dark:bg-neutral-700 px-1 rounded">.env.local</code> to enable this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-lg">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">Automation</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-xs">
          Recurring payments and scheduled tasks
        </p>
      </div>

      {!isConnected && (
        <Alert variant="info">
          <AlertDescription>Connect your wallet to schedule recurring payments.</AlertDescription>
        </Alert>
      )}

      {/* Create task form */}
      {isConnected && vaults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Schedule Recurring Payment</CardTitle>
            <CardDescription>Automate a LYX payment from one of your vaults</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-md">
              <div>
                <label className="label">Vault</label>
                <select className="input" value={selectedVault} onChange={(e) => setSelectedVault(e.target.value)} required>
                  <option value="">— select vault —</option>
                  {vaults.map((v) => (
                    <option key={v.safe} value={v.safe}>
                      {v.label || 'Unnamed'} ({short(v.safe)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-md">
                <div>
                  <label className="label">Recipient</label>
                  <input className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x…" required />
                </div>
                <div>
                  <label className="label">Amount (LYX)</label>
                  <input className="input" type="number" step="0.0001" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-md">
                <div>
                  <label className="label">Interval</label>
                  <select className="input" value={intervalPreset} onChange={(e) => setIntervalPreset(e.target.value)}>
                    {INTERVAL_PRESETS.map((p) => (
                      <option key={p.seconds} value={p.seconds}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">First Run (optional)</label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={firstRun}
                    onChange={(e) => setFirstRun(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-md">
                <Button type="submit" variant="primary" disabled={creating || !selectedVault}>
                  {creating ? 'Creating…' : 'Create Task'}
                </Button>
                {createStatus && (
                  <p className={`text-sm ${createStatus.startsWith('Error') ? 'text-danger' : 'text-success'}`}>
                    {createStatus}
                  </p>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Task list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Scheduled Tasks</CardTitle>
              <CardDescription>{tasks.length} task(s)</CardDescription>
            </div>
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
              {loading ? '…' : 'Refresh'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="space-y-sm">
              <SkeletonCard /><SkeletonCard />
            </div>
          )}
          {error && <p className="text-danger text-sm">Error: {error}</p>}
          {!loading && !error && tasks.length === 0 && (
            <p className="text-neutral-600 dark:text-neutral-400">No tasks scheduled yet.</p>
          )}
          {tasks.length > 0 && (
            <div className="space-y-sm">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="p-md rounded-md border border-neutral-200 dark:border-neutral-700"
                >
                  <div className="flex items-start justify-between gap-md mb-sm">
                    <div className="flex gap-xs flex-wrap">
                      <Badge variant={task.enabled ? 'success' : 'neutral'}>
                        {task.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      {task.executable && <Badge variant="warning">Ready</Badge>}
                      <Badge variant="neutral">{TRIGGER_LABELS[task.triggerType]}</Badge>
                    </div>
                    {isConnected && (
                      <Button
                        size="sm"
                        variant={task.enabled ? 'danger' : 'success'}
                        onClick={() => handleToggle(task)}
                        disabled={togglingId === task.id}
                      >
                        {togglingId === task.id ? '…' : task.enabled ? 'Disable' : 'Enable'}
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-xs text-sm">
                    <div>
                      <p className="text-xs text-neutral-500 uppercase tracking-wide">Vault</p>
                      <p className="font-mono text-neutral-900 dark:text-neutral-100">{short(task.vault)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500 uppercase tracking-wide">Interval</p>
                      <p className="text-neutral-900 dark:text-neutral-100">{formatInterval(task)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500 uppercase tracking-wide">Next Run</p>
                      <p className="text-neutral-900 dark:text-neutral-100">{formatExecution(task)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500 uppercase tracking-wide">Created</p>
                      <p className="text-neutral-900 dark:text-neutral-100">
                        {new Date(Number(task.createdAt) * 1000).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
