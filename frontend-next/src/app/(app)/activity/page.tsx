'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ethers } from 'ethers';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { SkeletonRow } from '@/components/common/Skeleton';
import { getPolicyEngineContract, getSafeContract } from '@/lib/web3/contracts';
import { getReadOnlyProvider } from '@/lib/web3/provider';
import { Alert, AlertDescription } from '@/components/common/Alert';
import { useI18n } from '@/context/I18nContext';
import { useContacts, CATEGORY_META } from '@/hooks/useContacts';
import { AddressDisplay } from '@/components/common/AddressDisplay';
import { getLocalActivityLogs } from '@/lib/activityLocalLog';

interface AgentEvent {
  status: 'approved' | 'blocked';
  source?: 'onchain' | 'manual' | 'keeper';
  type: 'LYX' | 'TOKEN';
  to: string;
  token?: string;
  amount: string;
  txHash?: string;
  blockNumber: number;
  reason?: string;
  createdAt?: number;
}
interface SafePaymentLog {
  args?: { to?: string; token?: string; amount?: bigint; };
  transactionHash: string;
  blockNumber: number;
}
interface BlockedExecutionLog {
  args?: { to?: string; token?: string; amount?: bigint; reason?: string; };
  transactionHash: string;
  blockNumber: number;
}
interface KeeperActivityApiEntry {
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

const short = (addr: string) => addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
const ZERO_ADDRESS = ethers.ZeroAddress;
const ACTIVITY_LOOKBACK_BLOCKS = 50_000;
const ACTIVITY_QUERY_CHUNK = 5_000;

type ParsedContractLog<TArgs> = {
  args: TArgs;
  transactionHash: string;
  blockNumber: number;
};

function sortActivity(a: AgentEvent, b: AgentEvent) {
  const localTimeDiff = (b.createdAt ?? 0) - (a.createdAt ?? 0);
  if (localTimeDiff !== 0) return localTimeDiff;
  return b.blockNumber - a.blockNumber;
}

function getStatusLabel(event: AgentEvent, t: (key: string) => string) {
  if (event.status === 'blocked' && event.source === 'keeper') {
    return t('activity.status.blocked_keeper');
  }

  return event.status === 'blocked' ? t('activity.status.blocked') : t('activity.status.approved');
}

function getSourceLabel(event: AgentEvent, t: (key: string) => string) {
  if (event.source === 'keeper') return t('activity.source.keeper');
  if (event.source === 'manual') return t('activity.source.manual');
  return null;
}

async function queryParsedLogs<TArgs>(
  provider: ethers.Provider,
  contract: ethers.Contract,
  eventName: string,
  fromBlock: number,
  toBlock: number,
  chunkSize = ACTIVITY_QUERY_CHUNK,
): Promise<ParsedContractLog<TArgs>[]> {
  const event = contract.interface.getEvent(eventName);
  if (!event) return [];

  const logs: ParsedContractLog<TArgs>[] = [];

  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(toBlock, start + chunkSize - 1);
    const rawLogs = await provider.getLogs({
      address: String(contract.target),
      fromBlock: start,
      toBlock: end,
      topics: [event.topicHash],
    });

    for (const rawLog of rawLogs) {
      const parsed = contract.interface.parseLog(rawLog);
      if (!parsed || parsed.name !== eventName) continue;

      logs.push({
        args: parsed.args as unknown as TArgs,
        transactionHash: rawLog.transactionHash,
        blockNumber: rawLog.blockNumber,
      });
    }
  }

  return logs;
}


export default function ActivityPage() {
  const { registry, account, isConnected, chainId, signer } = useWeb3();
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
    const provider = signer?.provider ?? getReadOnlyProvider();

    provider.getBlockNumber()
      .then((latestBlock) => {
        const fromBlock = Math.max(0, latestBlock - ACTIVITY_LOOKBACK_BLOCKS);
        const keeperUrl = `/api/keeper-activity?${vaults.map((vault) => `vault=${encodeURIComponent(vault.safe)}`).join('&')}`;
        return Promise.all([
          Promise.all(
            vaults.map(async (vault) => {
              try {
                const safe = getSafeContract(vault.safe, provider);
                const policyEngine = getPolicyEngineContract(vault.policyEngine, provider);
                const [lyxResult, tokenResult, blockedResult] = await Promise.allSettled([
                  queryParsedLogs<SafePaymentLog['args']>(provider, safe, 'AgentPaymentExecuted', fromBlock, latestBlock),
                  queryParsedLogs<SafePaymentLog['args']>(provider, safe, 'AgentTokenPaymentExecuted', fromBlock, latestBlock),
                  queryParsedLogs<BlockedExecutionLog['args']>(provider, policyEngine, 'ExecutionBlocked', fromBlock, latestBlock),
                ]);

                const lyxLogs = lyxResult.status === 'fulfilled' ? lyxResult.value : [];
                const tokenLogs = tokenResult.status === 'fulfilled' ? tokenResult.value : [];
                const blockedLogs = blockedResult.status === 'fulfilled' ? blockedResult.value : [];
                const failed = [lyxResult, tokenResult, blockedResult].some((result) => result.status === 'rejected');

                const lyxEvents: (AgentEvent & { vaultLabel: string })[] = lyxLogs.map((raw) => {
                  const event = raw as SafePaymentLog;
                  return {
                    status: 'approved' as const,
                    source: 'onchain' as const,
                    type: 'LYX' as const,
                    to: event.args?.to ?? '',
                    amount: ethers.formatEther(event.args?.amount ?? BigInt(0)),
                    txHash: event.transactionHash,
                    blockNumber: event.blockNumber,
                    vaultLabel: vault.label || short(vault.safe),
                  };
                });

                const tokenEvents: (AgentEvent & { vaultLabel: string })[] = tokenLogs.map((raw) => {
                  const event = raw as SafePaymentLog;
                  return {
                    status: 'approved' as const,
                    source: 'onchain' as const,
                    type: 'TOKEN' as const,
                    to: event.args?.to ?? '',
                    token: event.args?.token ?? '',
                    amount: ethers.formatEther(event.args?.amount ?? BigInt(0)),
                    txHash: event.transactionHash,
                    blockNumber: event.blockNumber,
                    vaultLabel: vault.label || short(vault.safe),
                  };
                });

                const blockedEvents: (AgentEvent & { vaultLabel: string })[] = blockedLogs.map((raw) => {
                  const event = raw as BlockedExecutionLog;
                  const token = event.args?.token ?? ZERO_ADDRESS;
                  return {
                    status: 'blocked' as const,
                    source: 'onchain' as const,
                    type: token === ZERO_ADDRESS ? 'LYX' as const : 'TOKEN' as const,
                    to: event.args?.to ?? '',
                    token: token === ZERO_ADDRESS ? undefined : token,
                    amount: ethers.formatEther(event.args?.amount ?? BigInt(0)),
                    txHash: event.transactionHash,
                    blockNumber: event.blockNumber,
                    reason: event.args?.reason ?? '',
                    vaultLabel: vault.label || short(vault.safe),
                  };
                });

                return { events: [...blockedEvents, ...lyxEvents, ...tokenEvents], failed };
              } catch {
                return { events: [] as (AgentEvent & { vaultLabel: string })[], failed: true };
              }
            })
          ),
          fetch(keeperUrl, { cache: 'no-store' })
            .then(async (response) => {
              if (!response.ok) {
                throw new Error(`keeper activity request failed with ${response.status}`);
              }

              const payload = await response.json() as { activity?: KeeperActivityApiEntry[] };
              return payload.activity ?? [];
            })
            .catch(() => [] as KeeperActivityApiEntry[]),
        ]);
      })
      .then(([perVault, keeperActivity]) => {
        if (cancelled) return;
        const localEvents = getLocalActivityLogs(vaults.map((vault) => vault.safe)).map((entry) => ({
          status: entry.status,
          source: 'manual' as const,
          type: entry.type,
          to: entry.to,
          token: entry.token,
          amount: entry.amount,
          txHash: entry.id,
          blockNumber: 0,
          reason: entry.reason,
          createdAt: entry.createdAt,
          vaultLabel: entry.vaultLabel || short(entry.vaultSafe),
        }));
        const keeperSuccessTxHashes = new Set(
          keeperActivity
            .filter((entry) => entry.status === 'approved' && !!entry.txHash)
            .map((entry) => entry.txHash!.toLowerCase())
        );

        const keeperEvents = keeperActivity
          .filter((entry) => entry.status === 'blocked')
          .map((entry) => {
          const vault = vaults.find((item) => item.safe.toLowerCase() === entry.vaultSafe.toLowerCase());
          return {
            status: entry.status,
            source: 'keeper' as const,
            type: entry.type,
            to: entry.to,
            token: entry.token,
            amount: entry.amount,
            txHash: entry.txHash ?? entry.id,
            blockNumber: entry.blockNumber ?? 0,
            reason: entry.reason,
            createdAt: entry.createdAt,
            vaultLabel: vault?.label || short(entry.vaultSafe),
          };
        });
        const matchedKeeperTxHashes = new Set<string>();
        const onChainEvents = perVault.flatMap((r) => r.events).map((event) => {
          if (event.status === 'approved' && event.txHash && keeperSuccessTxHashes.has(event.txHash.toLowerCase())) {
            matchedKeeperTxHashes.add(event.txHash.toLowerCase());
            return { ...event, source: 'keeper' as const };
          }

          return event;
        });
        const unmatchedKeeperApproved = keeperActivity
          .filter((entry) => entry.status === 'approved' && !!entry.txHash && !matchedKeeperTxHashes.has(entry.txHash!.toLowerCase()))
          .map((entry) => {
            const vault = vaults.find((item) => item.safe.toLowerCase() === entry.vaultSafe.toLowerCase());
            return {
              status: entry.status,
              source: 'keeper' as const,
              type: entry.type,
              to: entry.to,
              token: entry.token,
              amount: entry.amount,
              txHash: entry.txHash,
              blockNumber: entry.blockNumber ?? 0,
              reason: entry.reason,
              createdAt: entry.createdAt,
              vaultLabel: vault?.label || short(entry.vaultSafe),
            };
          });
        const allEvents = [...keeperEvents, ...unmatchedKeeperApproved, ...localEvents, ...onChainEvents].sort(sortActivity).slice(0, 100);
        const anyFailed = perVault.some((r) => r.failed);
        const failedCount = perVault.filter((r) => r.failed).length;
        if (anyFailed && allEvents.length === 0) {
          setError('Failed to load activity from chain logs. Check your RPC connection.');
        } else if (failedCount > 0) {
          setWarning(`Loaded activity from ${vaults.length - failedCount} of ${vaults.length} vaults. Some RPC queries failed.`);
        }
        setEvents(allEvents);
      })
      .catch((err) => { if (!cancelled) setError(err.message ?? String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [signer, vaults]);

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
            <Alert variant="error" className="mb-md">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {isConnected && !error && warning && (
            <Alert variant="warning" className="mb-md"><AlertDescription>{warning}</AlertDescription></Alert>
          )}
          {isConnected && !isAnyLoading && !error && events.length === 0 && (
            <ActivityEmptyCTA t={t} />
          )}

          {events.length > 0 && (
            <div className="space-y-2">
              {events.map((ev, i) => {
                const toContact = findContact(ev.to);
                return (
                  <div key={`${ev.txHash ?? 'event'}-${i}`} className="flex items-start gap-3">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-full"
                        style={{ background: 'var(--card-mid)' }}
                      >
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{
                            background: ev.status === 'blocked'
                              ? 'var(--blocked)'
                              : ev.type === 'LYX'
                                ? 'var(--success)'
                                : 'var(--accent)',
                          }}
                        />
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
                        {ev.txHash && ev.txHash.startsWith('0x') ? (
                          <a
                            href={`https://explorer.execution.${chainId === 42 ? 'mainnet' : 'testnet'}.lukso.network/tx/${ev.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs hover:underline flex-shrink-0"
                            style={{ color: 'var(--primary)' }}
                          >
                            {t('activity.view')}
                          </a>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {ev.blockNumber > 0 ? `Block ${ev.blockNumber}` : 'Local attempt'}
                        </span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full"
                          style={ev.status === 'blocked'
                            ? { background: 'rgba(255,77,109,0.1)', color: 'var(--blocked)' }
                            : { background: 'rgba(34,255,178,0.1)', color: 'var(--success)' }}
                        >
                          {getStatusLabel(ev, t)}
                        </span>
                        {getSourceLabel(ev, t) && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded-full"
                            style={{ background: 'var(--card-mid)', color: 'var(--text-muted)' }}
                          >
                            {getSourceLabel(ev, t)}
                          </span>
                        )}
                        {toContact && (
                          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{short(ev.to)}</span>
                        )}
                        {ev.type === 'TOKEN' && ev.token && (
                          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{short(ev.token)}</span>
                        )}
                        {ev.status === 'blocked' && ev.reason && (
                          <span className="text-xs break-words leading-relaxed" style={{ color: 'var(--blocked)' }}>
                            {ev.reason}
                          </span>
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

function ActivityEmptyCTA({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      {/* 7-dot row — same mark as the landing, stays empty to signal no activity */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <span
            key={i}
            className="animate-landing-dot"
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'transparent',
              border: '1px solid var(--border)',
              animationDelay: `${i * 180}ms`,
            }}
          />
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>{t('activity.empty_cta.title')}</p>
        <p className="text-sm max-w-sm" style={{ color: 'var(--text-muted)' }}>{t('activity.empty_cta.desc')}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/automation">
          <Button variant="primary" size="sm">{t('activity.empty_cta.automate')}</Button>
        </Link>
        <Link href="/vaults">
          <Button variant="secondary" size="sm">{t('activity.empty_cta.send')}</Button>
        </Link>
      </div>
    </div>
  );
}
