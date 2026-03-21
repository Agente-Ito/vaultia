'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/common/Card';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { SkeletonRow } from '@/components/common/Skeleton';
import { getSafeContract } from '@/lib/web3/contracts';
import { getProvider } from '@/lib/web3/provider';
import { Alert, AlertDescription } from '@/components/common/Alert';
import { useI18n } from '@/context/I18nContext';
import { useContacts, CATEGORY_META } from '@/hooks/useContacts';
import { AddressDisplay } from '@/components/common/AddressDisplay';

interface AgentEvent { type: 'LYX' | 'TOKEN'; to: string; token?: string; amount: string; txHash: string; blockNumber: number; }
interface SafePaymentLog {
  args?: { to?: string; token?: string; amount?: bigint; };
  transactionHash: string;
  blockNumber: number;
}


export default function ActivityPage() {
  const { registry, account, isConnected, chainId } = useWeb3();
  const { vaults, loading: vaultsLoading } = useVaults(registry, account);
  const [events, setEvents] = useState<(AgentEvent & { vaultLabel: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!vaults.length) { setEvents([]); setWarning(null); return; }
    let cancelled = false;
    setLoading(true); setError(null); setWarning(null);
    const provider = getProvider();

    Promise.all(
      vaults.map(async (vault) => {
        try {
          const safe = getSafeContract(vault.safe, provider);
          const [lyxLogs, tokenLogs] = await Promise.all([
            safe.queryFilter(safe.filters.AgentPaymentExecuted()),
            safe.queryFilter(safe.filters.AgentTokenPaymentExecuted()),
          ]);
          const lyxEvents: (AgentEvent & { vaultLabel: string })[] = lyxLogs.map((raw) => {
            const event = raw as SafePaymentLog;
            return { type: 'LYX' as const, to: event.args?.to ?? '', amount: ethers.formatEther(event.args?.amount ?? BigInt(0)), txHash: event.transactionHash, blockNumber: event.blockNumber, vaultLabel: vault.label || short(vault.safe) };
          });
          const tokenEvents: (AgentEvent & { vaultLabel: string })[] = tokenLogs.map((raw) => {
            const event = raw as SafePaymentLog;
            return { type: 'TOKEN' as const, to: event.args?.to ?? '', token: event.args?.token ?? '', amount: ethers.formatEther(event.args?.amount ?? BigInt(0)), txHash: event.transactionHash, blockNumber: event.blockNumber, vaultLabel: vault.label || short(vault.safe) };
          });
          return { events: [...lyxEvents, ...tokenEvents], failed: false };
        } catch {
          return { events: [] as (AgentEvent & { vaultLabel: string })[], failed: true };
        }
      })
    )
      .then((perVault) => {
        if (cancelled) return;
        const allEvents = perVault.flatMap((r) => r.events).sort((a, b) => b.blockNumber - a.blockNumber).slice(0, 100);
        const anyFailed = perVault.some((r) => r.failed);
        const failedCount = perVault.filter((r) => r.failed).length;
        if (anyFailed && allEvents.length === 0) {
          setError('Failed to load transaction history. Check your RPC connection.');
        } else if (failedCount > 0) {
          setWarning(`Loaded activity from ${vaults.length - failedCount} of ${vaults.length} vaults. Some RPC queries failed.`);
        }
        setEvents(allEvents);
      })
      .catch((err) => { if (!cancelled) setError(err.message ?? String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [vaults]);

  const { findContact } = useContacts();
  const isAnyLoading = vaultsLoading || loading;

  return (
    <div className="space-y-lg">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{t('activity.title')}</h1>
        <p className="mt-xs" style={{ color: 'var(--text-muted)' }}>{t('activity.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('activity.card.title')}</CardTitle>
          <CardDescription>{t('activity.card.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!isConnected && (
            <Alert variant="info"><AlertDescription>{t('activity.connect_prompt')}</AlertDescription></Alert>
          )}
          {isConnected && isAnyLoading && (
            <div className="space-y-sm"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
          )}
          {isConnected && error && (
            <p className="text-sm" style={{ color: 'var(--blocked)' }}>Error: {error}</p>
          )}
          {isConnected && !error && warning && (
            <Alert variant="warning" className="mb-md"><AlertDescription>{warning}</AlertDescription></Alert>
          )}
          {isConnected && !isAnyLoading && events.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>{t('activity.empty')}</p>
          )}

          {events.length > 0 && (
            <div className="space-y-2">
              {events.map((ev, i) => {
                const toContact = findContact(ev.to);
                return (
                  <div key={`${ev.txHash}-${i}`} className="flex items-start gap-3">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-base"
                        style={{ background: 'var(--card-mid)' }}
                      >
                        {ev.type === 'LYX' ? '⚡' : '🪙'}
                      </div>
                      {i < events.length - 1 && (
                        <div className="w-px h-4 mt-1" style={{ background: 'var(--border)' }} />
                      )}
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <div>
                          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                            {parseFloat(ev.amount).toFixed(4)} {ev.type === 'LYX' ? 'LYX' : 'tokens'}
                            {' → '}
                            <span style={toContact ? { color: 'var(--primary)' } : undefined}>
                              {toContact?.name
                                ? `${CATEGORY_META[toContact.category].emoji} ${toContact.name}`
                                : <AddressDisplay address={ev.to} mono={false} showResolvedIndicator={false} />}
                            </span>
                          </span>
                          <span className="text-xs ml-1.5" style={{ color: 'var(--text-muted)' }}>• {ev.vaultLabel}</span>
                        </div>
                        <a
                          href={`https://explorer.execution.${chainId === 42 ? 'mainnet' : 'testnet'}.lukso.network/tx/${ev.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs hover:underline flex-shrink-0"
                          style={{ color: 'var(--primary)' }}
                        >
                          {t('activity.view')}
                        </a>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Block {ev.blockNumber}</span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(34,255,178,0.1)', color: 'var(--success)' }}
                        >
                          {t('timeline.status.completed')}
                        </span>
                        {toContact && (
                          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{short(ev.to)}</span>
                        )}
                        {ev.type === 'TOKEN' && ev.token && (
                          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{short(ev.token)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
