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
import { useBaseVaults, BaseVaultSummary } from '@/hooks/useBaseVaults';
import { isBaseFactoryConfigured } from '@/lib/web3/baseContracts';
import { Skeleton, SkeletonCard } from '@/components/common/Skeleton';
import { Alert, AlertDescription } from '@/components/common/Alert';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils/cn';

// ─── Spend bar (same colour logic as BudgetTreeView) ─────────────────────────

function SpendBar({ spent, total }: { spent: number; total: number }) {
  const pct = total > 0 ? Math.min((spent / total) * 100, 100) : 0;
  const ratio = total > 0 ? spent / total : 0;
  const barColor =
    ratio >= 1 ? 'bg-red-500' : ratio >= 0.85 ? 'bg-yellow-400' : 'bg-green-500';
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-neutral-400 mt-0.5">
        <span className={cn(ratio >= 1 && 'text-red-500 font-medium')}>
          {spent} LYX spent
        </span>
        <span>{total} LYX</span>
      </div>
    </div>
  );
}

// ─── Vault card ───────────────────────────────────────────────────────────────

function VaultCard({ vault }: { vault: { safe: string; keyManager: string; policyEngine: string; label: string } }) {
  const [expanded, setExpanded] = useState(false);
  const { detail, loading } = useVault(expanded ? vault.safe : null);
  const { t } = useI18n();

  const short = (addr: string) => `${addr.slice(0, 8)}…${addr.slice(-6)}`;

  const spent = detail ? parseFloat(detail.policySummary.spent ?? '0') : 0;
  const budget = detail?.policySummary.budget ? parseFloat(detail.policySummary.budget) : 0;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{vault.label || 'Unnamed Vault'}</CardTitle>
            <CardDescription className="font-mono text-xs mt-xs">{short(vault.safe)}</CardDescription>
          </div>
          <Badge variant="success">{t('common.active')}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-md">
        {loading && (
          <div className="space-y-sm">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}

        {detail && (
          <>
            {/* Balance + expiry row */}
            <div className="flex items-end justify-between gap-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {t('vaults.card.balance')}
                </p>
                <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 leading-tight">
                  {detail.balance}
                  <span className="text-sm font-medium text-neutral-400 ml-1">LYX</span>
                </p>
              </div>
              {detail.policySummary.expiration && detail.policySummary.expiration !== '0' && (
                <div className="text-right">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('vaults.card.expires')}</p>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {new Date(Number(detail.policySummary.expiration) * 1000).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>

            {/* Spend bar */}
            {detail.policySummary.budget && (
              <SpendBar spent={spent} total={budget} />
            )}
          </>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`vault-details-${vault.safe}`}
          className="text-xs text-primary hover:underline text-left"
        >
          {expanded ? t('vaults.card.hide_details') : t('vaults.card.show_details')}
        </button>

        {expanded && detail && (
          <div
            id={`vault-details-${vault.safe}`}
            className="space-y-xs text-xs font-mono text-neutral-600 dark:text-neutral-400 border-t border-neutral-100 dark:border-neutral-700 pt-md"
          >
            <p><span className="font-sans font-medium text-neutral-500">{t('vaults.card.key_manager')}:</span> {short(detail.keyManager)}</p>
            <p><span className="font-sans font-medium text-neutral-500">{t('vaults.card.policy_engine')}:</span> {short(detail.policyEngine)}</p>
            {detail.policySummary.merchants?.length ? (
              <p><span className="font-sans font-medium text-neutral-500">{t('vaults.card.merchants')}:</span> {detail.policySummary.merchants.length} {t('vaults.card.whitelisted')}</p>
            ) : (
              <p><span className="font-sans font-medium text-neutral-500">{t('vaults.card.merchants')}:</span> {t('vaults.card.no_restriction')}</p>
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

// ─── Base vault card ──────────────────────────────────────────────────────────

function BaseVaultCard({ vault }: { vault: BaseVaultSummary }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();
  const short = (addr: string) => `${addr.slice(0, 8)}…${addr.slice(-6)}`;

  return (
    <Card className="flex flex-col border-blue-200 dark:border-blue-800">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{vault.label || 'Unnamed Vault'}</CardTitle>
            <CardDescription className="font-mono text-xs mt-xs">{short(vault.vault)}</CardDescription>
          </div>
          <div className="flex gap-xs">
            <Badge variant="primary">{t('vaults.base.chain_badge')}</Badge>
            <Badge variant="success">{t('common.active')}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-md">
        <div className="flex items-center gap-sm">
          <span className="text-xl">{vault.tokenEmoji}</span>
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{vault.tokenSymbol}</span>
          <span className="text-xs text-neutral-400 font-mono">{short(vault.token)}</span>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="text-xs text-primary hover:underline text-left"
        >
          {expanded ? t('vaults.card.hide_details') : t('vaults.card.show_details')}
        </button>

        {expanded && (
          <div className="space-y-xs text-xs font-mono text-neutral-600 dark:text-neutral-400 border-t border-neutral-100 dark:border-neutral-700 pt-md">
            <p><span className="font-sans font-medium text-neutral-500">{t('vaults.card.policy_engine')}:</span> {short(vault.policyEngine)}</p>
            <p><span className="font-sans font-medium text-neutral-500">Vault:</span> {vault.vault}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VaultsPage() {
  const { registry, account, isConnected } = useWeb3();
  const { vaults, loading, error, refresh: refreshVaults } = useVaults(registry, account);
  const { vaults: baseVaults, loading: baseLoading, error: baseError, refresh: refreshBase } = useBaseVaults(account);
  const { t } = useI18n();

  const handleRefreshAll = () => { refreshVaults(); refreshBase(); };

  return (
    <div className="space-y-lg">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">{t('vaults.title')}</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-xs">
            {t('vaults.subtitle')}
          </p>
        </div>
        <div className="flex gap-sm">
          <Button variant="secondary" size="sm" onClick={handleRefreshAll} disabled={loading || baseLoading}>
            {(loading || baseLoading) ? '…' : t('common.refresh')}
          </Button>
          <Link href="/vaults/create">
            <Button>{t('vaults.create')}</Button>
          </Link>
        </div>
      </div>

      {/* Stats summary bar */}
      {isConnected && !loading && vaults.length > 0 && (
        <div className="grid grid-cols-3 gap-md">
          {[
            { emoji: '🏦', label: t('vaults.stats.total'), value: String(vaults.length) },
            { emoji: '✅', label: t('vaults.stats.active'), value: String(vaults.length) },
            { emoji: '🤖', label: t('vaults.stats.network'), value: 'LUKSO' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 flex items-center gap-3"
            >
              <span className="text-2xl">{s.emoji}</span>
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{s.label}</p>
                <p className="text-xl font-bold text-neutral-900 dark:text-neutral-50">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isConnected && (
        <Alert variant="info">
          <AlertDescription>{t('vaults.connect_prompt')}</AlertDescription>
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
            <CardTitle>{t('vaults.empty.title')}</CardTitle>
            <CardDescription>{t('vaults.empty.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-neutral-600 dark:text-neutral-400 mb-md">
              {t('vaults.empty.description')}
            </p>
            <Link href="/vaults/create">
              <Button variant="primary">{t('vaults.empty.cta')}</Button>
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

      {/* ── Base vaults section ─────────────────────────────────────────────── */}
      {isConnected && isBaseFactoryConfigured() && (
        <div className="space-y-md">
          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-lg">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-sm">
              <span className="text-2xl">🔵</span>
              {t('vaults.base.section_title')}
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400 text-sm mt-xs">
              {t('vaults.base.section_subtitle')}
            </p>
          </div>

          {baseLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <SkeletonCard /><SkeletonCard />
            </div>
          )}

          {baseError && (
            <Card><CardContent><p className="text-danger text-sm">Error: {baseError}</p></CardContent></Card>
          )}

          {!baseLoading && !baseError && baseVaults.length === 0 && (
            <Card>
              <CardContent>
                <p className="text-neutral-500 dark:text-neutral-400 text-sm py-sm">{t('vaults.base.empty')}</p>
              </CardContent>
            </Card>
          )}

          {baseVaults.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              {baseVaults.map((vault) => (
                <BaseVaultCard key={vault.vault} vault={vault} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
