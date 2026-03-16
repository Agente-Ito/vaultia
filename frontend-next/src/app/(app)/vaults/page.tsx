'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { useVault } from '@/hooks/useVault';
import { Skeleton, SkeletonCard } from '@/components/common/Skeleton';
import { Alert, AlertDescription } from '@/components/common/Alert';

function VaultCard({ vault }: { vault: { safe: string; keyManager: string; policyEngine: string; label: string } }) {
  const [expanded, setExpanded] = useState(false);
  const { detail, loading } = useVault(expanded ? vault.safe : null);

  const short = (addr: string) => `${addr.slice(0, 8)}…${addr.slice(-6)}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{vault.label || 'Unnamed Vault'}</CardTitle>
            <CardDescription className="font-mono text-xs mt-xs">{short(vault.safe)}</CardDescription>
          </div>
          <Badge variant="success">Active</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-sm mb-md">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-32" />
          </div>
        )}

        {detail && (
          <div className="grid grid-cols-2 gap-sm text-sm mb-md">
            <div>
              <p className="text-neutral-500 dark:text-neutral-400 text-xs uppercase tracking-wide">Balance</p>
              <p className="font-semibold text-neutral-900 dark:text-neutral-50">{detail.balance} LYX</p>
            </div>
            {detail.policySummary.budget && (
              <div>
                <p className="text-neutral-500 dark:text-neutral-400 text-xs uppercase tracking-wide">Spent / Budget</p>
                <p className="font-semibold text-neutral-900 dark:text-neutral-50">
                  {detail.policySummary.spent ?? '0'} / {detail.policySummary.budget} LYX
                </p>
              </div>
            )}
            {detail.policySummary.expiration && detail.policySummary.expiration !== '0' && (
              <div className="col-span-2">
                <p className="text-neutral-500 dark:text-neutral-400 text-xs uppercase tracking-wide">Expires</p>
                <p className="font-semibold text-neutral-900 dark:text-neutral-50">
                  {new Date(Number(detail.policySummary.expiration) * 1000).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`vault-details-${vault.safe}`}
          className="text-xs text-primary hover:underline"
        >
          {expanded ? 'Hide details ↑' : 'Show details ↓'}
        </button>

        {expanded && detail && (
          <div id={`vault-details-${vault.safe}`} className="mt-md space-y-xs text-xs font-mono text-neutral-600 dark:text-neutral-400 border-t border-neutral-100 dark:border-neutral-700 pt-md">
            <p><span className="font-sans font-medium text-neutral-500">KeyManager:</span> {short(detail.keyManager)}</p>
            <p><span className="font-sans font-medium text-neutral-500">PolicyEngine:</span> {short(detail.policyEngine)}</p>
            {detail.policySummary.merchants?.length ? (
              <p><span className="font-sans font-medium text-neutral-500">Merchants:</span> {detail.policySummary.merchants.length} whitelisted</p>
            ) : (
              <p><span className="font-sans font-medium text-neutral-500">Merchants:</span> no restriction</p>
            )}
            {!!detail.policySummary.warnings?.length && (
              <Alert variant="warning" className="mt-sm font-sans">
                <AlertDescription>
                  {detail.policySummary.warnings.join(' ')}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VaultsPage() {
  const { registry, account, isConnected } = useWeb3();
  const { vaults, loading, error, refresh: refreshVaults } = useVaults(registry, account);

  return (
    <div className="space-y-lg">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">Vaults</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-xs">
            Your financial vaults on LUKSO
          </p>
        </div>
        <div className="flex gap-sm">
          <Button variant="secondary" size="sm" onClick={refreshVaults} disabled={loading}>
            {loading ? '…' : 'Refresh'}
          </Button>
          <Link href="/vaults/create">
            <Button>Create Vault</Button>
          </Link>
        </div>
      </div>

      {!isConnected && (
        <Alert variant="info">
          <AlertDescription>Connect your wallet to see your vaults.</AlertDescription>
        </Alert>
      )}

      {isConnected && loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <SkeletonCard /><SkeletonCard />
        </div>
      )}

      {isConnected && error && (
        <Card><CardContent><p className="text-danger text-sm">Error: {error}</p></CardContent></Card>
      )}

      {isConnected && !loading && !error && vaults.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No vaults yet</CardTitle>
            <CardDescription>Create your first vault to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-neutral-600 dark:text-neutral-400 mb-md">
              Vaults are financial containers where agents execute payments within pre-defined rules.
            </p>
            <Link href="/vaults/create">
              <Button variant="primary">Create your first vault</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {vaults.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          {vaults.map((vault) => (
            <VaultCard key={vault.safe} vault={vault} />
          ))}
        </div>
      )}
    </div>
  );
}
