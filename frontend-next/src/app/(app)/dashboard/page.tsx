'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ethers } from 'ethers';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Skeleton, SkeletonRow } from '@/components/common/Skeleton';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { getProvider } from '@/lib/web3/provider';

const COORDINATOR_ADDRESS = process.env.NEXT_PUBLIC_COORDINATOR_ADDRESS ?? '';
const SCHEDULER_ADDRESS = process.env.NEXT_PUBLIC_SCHEDULER_ADDRESS ?? '';

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-sm text-sm">
      <span className={done ? 'text-success font-bold' : 'text-neutral-400'}>
        {done ? '✓' : '○'}
      </span>
      <span className={done ? 'text-neutral-900 dark:text-neutral-100 line-through opacity-60' : 'text-neutral-600 dark:text-neutral-400'}>
        {label}
      </span>
    </li>
  );
}

export default function DashboardPage() {
  const { registry, account, isConnected, connect } = useWeb3();
  const { vaults, loading: vaultsLoading, refresh: refreshVaults } = useVaults(registry, account);
  const [totalBalance, setTotalBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    if (!vaults.length) {
      setTotalBalance('0.0000');
      return;
    }
    setBalanceLoading(true);
    const provider = getProvider();
    Promise.all(vaults.map((v) => provider.getBalance(v.safe).catch(() => BigInt(0))))
      .then((balances) => {
        const total = balances.reduce((sum, b) => sum + BigInt(b), BigInt(0));
        setTotalBalance(parseFloat(ethers.formatEther(total)).toFixed(4));
      })
      .catch(() => setTotalBalance('—'))
      .finally(() => setBalanceLoading(false));
  }, [vaults]);

  const loading = vaultsLoading || balanceLoading;

  // Setup progress (real state detection)
  const steps = [
    { done: isConnected, label: 'Connect your wallet' },
    { done: vaults.length > 0, label: 'Create your first vault' },
    { done: !!COORDINATOR_ADDRESS, label: 'Configure AgentCoordinator' },
    { done: !!SCHEDULER_ADDRESS, label: 'Configure TaskScheduler' },
  ];
  const allDone = steps.every((s) => s.done);

  return (
    <div className="space-y-lg">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">Dashboard</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-xs">
          {isConnected ? 'Your Financial Operating System overview' : 'Connect your wallet to get started'}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
        <Card>
          <CardHeader><CardTitle className="text-lg">Total Assets</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-28 mt-xs" />
            ) : (
              <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
                {totalBalance ?? '0.0000'} LYX
              </p>
            )}
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-xs">Across all vaults</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Active Vaults</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-10 mt-xs" />
            ) : (
              <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">{vaults.length}</p>
            )}
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-xs">On LUKSO</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Agents</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">—</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-xs">
              {COORDINATOR_ADDRESS ? 'See Agents page' : 'Not configured'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Tasks</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">—</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-xs">
              {SCHEDULER_ADDRESS ? 'See Automation page' : 'Not configured'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Setup progress — always visible until all done */}
      {!allDone && (
        <Card>
          <CardHeader><CardTitle>Setup Progress</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-sm mb-md">
              {steps.map((s) => <Step key={s.label} done={s.done} label={s.label} />)}
            </ul>
            {!isConnected && (
              <Button variant="primary" onClick={connect}>Connect Wallet</Button>
            )}
            {isConnected && vaults.length === 0 && (
              <Link href="/vaults/create">
                <Button variant="primary">Create your first vault</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* Vault list */}
      {isConnected && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>My Vaults</CardTitle>
              <Button variant="secondary" size="sm" onClick={refreshVaults} disabled={loading}>
                {loading ? '…' : 'Refresh'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="space-y-sm">
                <SkeletonRow />
                <SkeletonRow />
              </div>
            )}
            {!loading && vaults.length === 0 && (
              <p className="text-neutral-600 dark:text-neutral-400">No vaults yet.</p>
            )}
            {!loading && vaults.length > 0 && (
              <div className="space-y-xs">
                {vaults.map((v) => (
                  <div
                    key={v.safe}
                    className="flex items-center justify-between py-xs border-b border-neutral-100 dark:border-neutral-700 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{v.label || 'Unnamed Vault'}</p>
                      <p className="text-xs font-mono text-neutral-500">{v.safe.slice(0, 10)}…{v.safe.slice(-8)}</p>
                    </div>
                    <Link href="/vaults">
                      <span className="text-xs text-primary hover:underline cursor-pointer">View →</span>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
