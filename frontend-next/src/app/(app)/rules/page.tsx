'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { useVault } from '@/hooks/useVault';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/common/Skeleton';
import { Button } from '@/components/common/Button';
import { Alert, AlertDescription } from '@/components/common/Alert';
import { useI18n } from '@/context/I18nContext';
import { useContacts } from '@/hooks/useContacts';
import { getMerchantRegistryContract, getPolicyEngineContract } from '@/lib/web3/contracts';
import { getReadOnlyProvider } from '@/lib/web3/provider';

const MERCHANT_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_MERCHANT_REGISTRY_ADDRESS ?? '';

function PolicyCard({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          {badge}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-xs text-sm" style={{ borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="font-medium text-right" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

function BudgetBar({ pct }: { pct: number }) {
  const barColor = pct >= 100 ? 'var(--blocked)' : pct >= 85 ? 'var(--warning)' : 'var(--success)';
  return (
    <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: 'var(--card-mid)' }}>
      <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
    </div>
  );
}

function EmergencyPanel({ paused, policyEngineAddr, signer }: {
  paused: boolean;
  policyEngineAddr: string;
  signer: ethers.Signer | null;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [localPaused, setLocalPaused] = useState(paused);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async () => {
    if (!signer) return;
    setPending(true);
    setErr(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pe = getPolicyEngineContract(policyEngineAddr, signer) as any;
      await (await pe.setPaused(!localPaused)).wait();
      setLocalPaused((p) => !p);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Transaction failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <PolicyCard
      title={t('rules.emergency.title')}
      badge={
        <Badge variant={localPaused ? 'warning' : 'neutral'}>
          {localPaused ? '⏸ Paused' : '✅ Active'}
        </Badge>
      }
    >
      <p className="text-sm mb-md" style={{ color: localPaused ? 'var(--blocked)' : 'var(--success)' }}>
        {localPaused ? t('rules.emergency.paused_state') : t('rules.emergency.active_state')}
      </p>
      <p className="text-xs mb-md" style={{ color: 'var(--text-muted)' }}>{t('rules.emergency.owner_note')}</p>
      {err && <p className="text-xs mb-xs" style={{ color: 'var(--blocked)' }}>{err}</p>}
      <Button
        variant={localPaused ? 'primary' : 'secondary'}
        onClick={toggle}
        disabled={pending || !signer}
      >
        {pending
          ? t('rules.emergency.pending')
          : localPaused
          ? t('rules.emergency.btn_resume')
          : t('rules.emergency.btn_pause')}
      </Button>
    </PolicyCard>
  );
}

function VaultPolicies({ safeAddress }: { safeAddress: string }) {
  const { detail, loading, error } = useVault(safeAddress);
  const { t } = useI18n();
  const { findContact } = useContacts();
  const { account, signer } = useWeb3();
  const [merchantNames, setMerchantNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const merchants = detail?.policySummary.merchants ?? [];
    if (!MERCHANT_REGISTRY_ADDRESS || merchants.length === 0) {
      setMerchantNames({});
      return;
    }

    let cancelled = false;

    const loadMerchantNames = async () => {
      try {
        const registry = getMerchantRegistryContract(MERCHANT_REGISTRY_ADDRESS, getReadOnlyProvider());
        const pairs = await Promise.all(merchants.map(async (merchant) => {
          try {
            const name = await registry.getName(merchant) as string;
            return [merchant.toLowerCase(), name] as const;
          } catch {
            return [merchant.toLowerCase(), ''] as const;
          }
        }));

        if (!cancelled) {
          setMerchantNames(Object.fromEntries(pairs.filter(([, name]) => Boolean(name))));
        }
      } catch {
        if (!cancelled) {
          setMerchantNames({});
        }
      }
    };

    void loadMerchantNames();

    return () => {
      cancelled = true;
    };
  }, [detail?.policySummary.merchants]);

  if (loading) return (
    <div className="space-y-md">
      <div className="space-y-sm p-md rounded-xl" style={{ border: '1px solid var(--border)' }}>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-2 w-full mt-sm" />
      </div>
    </div>
  );
  if (error) return <p className="text-sm py-md" style={{ color: 'var(--blocked)' }}>Error: {error}</p>;
  if (!detail) return null;

  const { policySummary } = detail;
  const hasBudget    = !!policySummary.budget;
  const hasMerchants = !!policySummary.merchants;
  const hasExpiry    = !!policySummary.expiration && policySummary.expiration !== '0';

  if (!hasBudget && !hasMerchants && !hasExpiry) {
    return <p className="text-sm py-md" style={{ color: 'var(--text-muted)' }}>{t('rules.no_policies')}</p>;
  }

  return (
    <div className="space-y-md">
      {!!policySummary.warnings?.length && (
        <Alert variant="warning"><AlertDescription>{policySummary.warnings.join(' ')}</AlertDescription></Alert>
      )}

      {detail.policyEngineOwner.toLowerCase() === (account ?? '').toLowerCase() && (
        <EmergencyPanel
          paused={detail.policyEnginePaused}
          policyEngineAddr={detail.policyEngine}
          signer={signer}
        />
      )}

      {hasBudget && (
        <PolicyCard title={t('rules.budget.title')} badge={<Badge variant="primary">{t('rules.budget.active')}</Badge>}>
          <Row label={t('rules.budget.max')} value={`${policySummary.budget} LYX`} />
          <Row label={t('rules.budget.spent')} value={`${policySummary.spent ?? '0'} LYX`} />
          {policySummary.periodStart && <Row label={t('rules.budget.period_start')} value={policySummary.periodStart} />}
          <div className="mt-sm">
            <div className="flex justify-between text-xs mb-xs" style={{ color: 'var(--text-muted)' }}>
              <span>{t('rules.budget.spent_label')}</span>
              <span>{policySummary.spent ?? '0'} / {policySummary.budget} LYX</span>
            </div>
            <BudgetBar pct={Math.min(100, (parseFloat(policySummary.spent ?? '0') / parseFloat(policySummary.budget!)) * 100)} />
          </div>
        </PolicyCard>
      )}

      {hasMerchants && (
        <PolicyCard title={t('rules.merchants.title')} badge={<Badge variant="warning">{t('rules.merchants.badge')}</Badge>}>
          <p className="text-xs mb-md" style={{ color: 'var(--text-muted)' }}>{t('rules.merchants.info')}</p>
          {policySummary.merchants!.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('rules.merchants.none')}</p>
          ) : (
            <div className="space-y-xs">
              {policySummary.merchants!.map((m) => {
                const contact = findContact(m);
                const registryName = merchantNames[m.toLowerCase()];
                return (
                  <div key={m} className="rounded-xl px-3 py-2" style={{ background: 'var(--card-mid)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      {registryName && (
                        <span className="text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
                          {registryName}
                        </span>
                      )}
                      {contact?.name && (
                        <span className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                          <span>{contact.avatarUrl ? '🖼️' : '👤'}</span>
                          {contact.name}
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs break-all mt-1" style={{ color: 'var(--text-muted)' }}>{m}</p>
                  </div>
                );
              })}
              <p className="text-xs mt-xs" style={{ color: 'var(--text-muted)' }}>{policySummary.merchants!.length} {t('rules.merchants.count')}</p>
            </div>
          )}
        </PolicyCard>
      )}

      {hasExpiry && (
        <PolicyCard title={t('rules.expiry.title')} badge={<Badge variant="neutral">{t('rules.expiry.badge')}</Badge>}>
          <Row label={t('rules.expiry.label')} value={new Date(Number(policySummary.expiration) * 1000).toLocaleString()} />
          <Row
            label={t('rules.expiry.status')}
            value={
              Number(policySummary.expiration) * 1000 > Date.now()
                ? <span style={{ color: 'var(--success)' }}>{t('rules.expiry.active')}</span>
                : <span style={{ color: 'var(--blocked)' }}>{t('rules.expiry.expired')}</span>
            }
          />
        </PolicyCard>
      )}
    </div>
  );
}

function RulesPageContent() {
  const { registry, account, isConnected } = useWeb3();
  const searchParams = useSearchParams();
  const { vaults, loading: vaultsLoading } = useVaults(registry, account);
  const [selectedSafe, setSelectedSafe]    = useState<string>('');
  const { t } = useI18n();
  const preselectedSafe = searchParams.get('safe') ?? '';

  useEffect(() => {
    if (!preselectedSafe || selectedSafe) return;
    if (vaults.some((vault) => vault.safe.toLowerCase() === preselectedSafe.toLowerCase())) {
      setSelectedSafe(preselectedSafe);
    }
  }, [preselectedSafe, selectedSafe, vaults]);

  return (
    <div className="space-y-lg">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{t('rules.title')}</h1>
        <p className="mt-xs" style={{ color: 'var(--text-muted)' }}>{t('rules.subtitle')}</p>
      </div>

      {!isConnected && (
        <Alert variant="info"><AlertDescription>{t('rules.connect_prompt')}</AlertDescription></Alert>
      )}

      {isConnected && !vaultsLoading && vaults.length === 0 && (
        <Card>
          <CardContent>
            <p className="mb-md" style={{ color: 'var(--text-muted)' }}>{t('rules.no_vaults')}</p>
            <Link href="/vaults/create"><Button variant="primary">Create Vault</Button></Link>
          </CardContent>
        </Card>
      )}

      {isConnected && vaults.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('rules.select_vault.title')}</CardTitle>
              <CardDescription>{t('rules.select_vault.desc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <select className="input" value={selectedSafe} onChange={(e) => setSelectedSafe(e.target.value)}>
                <option value="">{t('rules.select_vault.placeholder')}</option>
                {vaults.map((v) => (
                  <option key={v.safe} value={v.safe}>
                    {v.label || 'Unnamed Vault'} ({v.safe.slice(0, 8)}…{v.safe.slice(-6)})
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>
          {selectedSafe && <VaultPolicies safeAddress={selectedSafe} />}
        </>
      )}
    </div>
  );
}

export default function RulesPage() {
  return (
    <Suspense fallback={<div className="space-y-lg" />}>
      <RulesPageContent />
    </Suspense>
  );
}
