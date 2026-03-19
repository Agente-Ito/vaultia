'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { useVault } from '@/hooks/useVault';
import Link from 'next/link';
import { Skeleton } from '@/components/common/Skeleton';
import { Button } from '@/components/common/Button';
import { Alert, AlertDescription } from '@/components/common/Alert';
import { useI18n } from '@/context/I18nContext';
import { useContacts } from '@/hooks/useContacts';
import { useDemo, DEMO_PERSONAS } from '@/context/DemoContext';

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
    <div className="flex justify-between items-center py-xs border-b border-neutral-100 dark:border-neutral-700 last:border-0 text-sm">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="font-medium text-neutral-900 dark:text-neutral-50 text-right">{value}</span>
    </div>
  );
}

function VaultPolicies({ safeAddress }: { safeAddress: string }) {
  const { detail, loading, error } = useVault(safeAddress);
  const { t } = useI18n();
  const { findContact } = useContacts();

  if (loading) return (
    <div className="space-y-md">
      <div className="space-y-sm p-md border border-neutral-200 dark:border-neutral-700 rounded-md">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-2 w-full mt-sm" />
      </div>
    </div>
  );
  if (error) return <p className="text-danger text-sm py-md">Error: {error}</p>;
  if (!detail) return null;

  const { policySummary } = detail;
  const hasBudget = !!policySummary.budget;
  const hasMerchants = !!policySummary.merchants;
  const hasExpiry = !!policySummary.expiration && policySummary.expiration !== '0';

  if (!hasBudget && !hasMerchants && !hasExpiry) {
    return <p className="text-neutral-500 text-sm py-md">{t('rules.no_policies')}</p>;
  }

  return (
    <div className="space-y-md">
      {!!policySummary.warnings?.length && (
        <Alert variant="warning">
          <AlertDescription>{policySummary.warnings.join(' ')}</AlertDescription>
        </Alert>
      )}

      {hasBudget && (
        <PolicyCard title={t('rules.budget.title')} badge={<Badge variant="primary">{t('rules.budget.active')}</Badge>}>
          <Row label={t('rules.budget.max')} value={`${policySummary.budget} LYX`} />
          <Row label={t('rules.budget.spent')} value={`${policySummary.spent ?? '0'} LYX`} />
          {policySummary.periodStart && (
            <Row label={t('rules.budget.period_start')} value={policySummary.periodStart} />
          )}
          <div className="mt-sm">
            <div className="flex justify-between text-xs text-neutral-500 mb-xs">
              <span>{t('rules.budget.spent_label')}</span>
              <span>{policySummary.spent ?? '0'} / {policySummary.budget} LYX</span>
            </div>
            <div className="w-full bg-neutral-100 dark:bg-neutral-700 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    (parseFloat(policySummary.spent ?? '0') / parseFloat(policySummary.budget!)) * 100
                  )}%`,
                }}
              />
            </div>
          </div>
        </PolicyCard>
      )}

      {hasMerchants && (
        <PolicyCard title={t('rules.merchants.title')} badge={<Badge variant="warning">{t('rules.merchants.badge')}</Badge>}>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-md">
            {t('rules.merchants.info')}
          </p>
          {policySummary.merchants!.length === 0 ? (
            <p className="text-sm text-neutral-500">{t('rules.merchants.none')}</p>
          ) : (
            <div className="space-y-xs">
              {policySummary.merchants!.map((m) => {
                const contact = findContact(m);
                return (
                  <div key={m} className="flex items-center gap-2">
                    {contact?.name && (
                      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
                        <span>{contact.avatarUrl ? '🖼️' : '👤'}</span>
                        {contact.name}
                      </span>
                    )}
                    <p className="font-mono text-xs text-neutral-400 dark:text-neutral-500 break-all">
                      {m}
                    </p>
                  </div>
                );
              })}
              <p className="text-xs text-neutral-500 mt-xs">{policySummary.merchants!.length} {t('rules.merchants.count')}</p>
            </div>
          )}
        </PolicyCard>
      )}

      {hasExpiry && (
        <PolicyCard title={t('rules.expiry.title')} badge={<Badge variant="neutral">{t('rules.expiry.badge')}</Badge>}>
          <Row
            label={t('rules.expiry.label')}
            value={new Date(Number(policySummary.expiration) * 1000).toLocaleString()}
          />
          <Row
            label={t('rules.expiry.status')}
            value={
              Number(policySummary.expiration) * 1000 > Date.now()
                ? <span className="text-success">{t('rules.expiry.active')}</span>
                : <span className="text-danger">{t('rules.expiry.expired')}</span>
            }
          />
        </PolicyCard>
      )}
    </div>
  );
}

function DemoRulesSection() {
  const { t } = useI18n();
  const { demoPersonaId } = useDemo();
  const persona = DEMO_PERSONAS.find((p) => p.id === demoPersonaId) ?? DEMO_PERSONAS[0];
  const totalSpent = persona.subVaults.filter((sv) => sv.activeByDefault).reduce((s, sv) => s + sv.spent, 0);
  const budget = persona.totalBudget;
  const pct = Math.min(Math.round((totalSpent / budget) * 100), 100);

  return (
    <div className="space-y-md">
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md text-sm text-amber-800 dark:text-amber-300">
        <span>🎮</span>
        <span className="font-medium">{t('demo.label')}</span>
        <span>—</span>
        <span>{persona.emoji} {persona.vaultName} ({persona.label})</span>
      </div>

      {/* Budget */}
      <PolicyCard title={t('rules.budget.title')} badge={<Badge variant="primary">{t('rules.budget.active')}</Badge>}>
        <Row label={t('rules.budget.max')}   value={`${budget.toLocaleString()} LYX`} />
        <Row label={t('rules.budget.spent')} value={`${totalSpent.toLocaleString()} LYX`} />
        <div className="mt-sm">
          <div className="flex justify-between text-xs text-neutral-500 mb-xs">
            <span>{t('rules.budget.spent_label')}</span>
            <span>{totalSpent.toLocaleString()} / {budget.toLocaleString()} LYX</span>
          </div>
          <div className="w-full bg-neutral-100 dark:bg-neutral-700 rounded-full h-2">
            <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </PolicyCard>

      {/* Merchant whitelist */}
      <PolicyCard title={t('rules.merchants.title')} badge={<Badge variant="warning">{t('rules.merchants.badge')}</Badge>}>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-md">{t('rules.merchants.info')}</p>
        <div className="space-y-xs">
          {persona.merchants.slice(0, 3).map((m) => (
            <div key={m.address} className="flex items-center gap-2">
              <span className="text-sm">{m.emoji}</span>
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{m.name}</span>
              <span className="text-xs text-neutral-400">({m.category})</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-neutral-500 mt-xs">3 {t('rules.merchants.count')}</p>
      </PolicyCard>

      {/* Expiry */}
      <PolicyCard title={t('rules.expiry.title')} badge={<Badge variant="neutral">{t('rules.expiry.badge')}</Badge>}>
        <Row label={t('rules.expiry.label')} value="Dec 31, 2026" />
        <Row
          label={t('rules.expiry.status')}
          value={<span className="text-success">{t('rules.expiry.active')}</span>}
        />
      </PolicyCard>
    </div>
  );
}

export default function RulesPage() {
  const { registry, account, isConnected } = useWeb3();
  const { vaults, loading: vaultsLoading } = useVaults(registry, account);
  const [selectedSafe, setSelectedSafe] = useState<string>('');
  const { t } = useI18n();
  const { isDemo } = useDemo();

  return (
    <div className="space-y-lg">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">{t('rules.title')}</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-xs">
          {t('rules.subtitle')}
        </p>
      </div>

      {isDemo && <DemoRulesSection />}

      {!isDemo && !isConnected && (
        <Alert variant="info">
          <AlertDescription>{t('rules.connect_prompt')}</AlertDescription>
        </Alert>
      )}

      {!isDemo && isConnected && !vaultsLoading && vaults.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-neutral-600 dark:text-neutral-400 mb-md">{t('rules.no_vaults')}</p>
            <Link href="/vaults/create"><Button variant="primary">Create Vault</Button></Link>
          </CardContent>
        </Card>
      )}

      {!isDemo && isConnected && vaults.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('rules.select_vault.title')}</CardTitle>
              <CardDescription>{t('rules.select_vault.desc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <select
                className="input"
                value={selectedSafe}
                onChange={(e) => setSelectedSafe(e.target.value)}
              >
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
