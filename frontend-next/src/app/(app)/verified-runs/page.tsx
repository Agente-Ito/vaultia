'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Skeleton } from '@/components/common/Skeleton';
import { useI18n } from '@/context/I18nContext';
import { useVerifiedRuns } from '@/hooks/useVerifiedRuns';
import type { VerifiedRun } from '@/lib/verified-runs/types';

function formatAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function RunCard({ run }: { run: VerifiedRun }) {
  const { t } = useI18n();

  const contractLinks = [
    { label: 'Registry', href: run.links.registry, value: run.registryAddress },
    { label: 'Safe', href: run.links.safe, value: run.safeAddress },
    { label: 'KeyManager', href: run.links.keyManager, value: run.keyManagerAddress },
    { label: 'PolicyEngine', href: run.links.policyEngine, value: run.policyEngineAddress },
    ...(run.tokenAddress && run.links.token ? [{ label: 'Token', href: run.links.token, value: run.tokenAddress }] : []),
  ];

  const amountRows = [
    { label: t('verified_runs.budget'), value: run.configuredBudget },
    { label: t('verified_runs.recipient_cap'), value: run.configuredRecipientLimit },
    {
      label: run.primaryFundingLabel === 'tokenMintAmount' ? t('verified_runs.token_mint') : t('verified_runs.vault_funding'),
      value: run.primaryFundingAmount,
    },
    ...(run.lyxSeedAmount ? [{ label: t('verified_runs.lyx_seed'), value: run.lyxSeedAmount }] : []),
    { label: t('verified_runs.limited_payment'), value: run.limitedRecipientPaymentAmount },
    { label: t('verified_runs.merchant_payment'), value: run.merchantPaymentAmount },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <CardTitle>
              {run.id === 'lsp7' ? t('verified_runs.lsp7') : t('verified_runs.native')}
            </CardTitle>
            <CardDescription>
              {run.network} · {run.chainId} · block {run.blockNumber}
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a href={run.links.safe} target="_blank" rel="noreferrer">
              <Button size="sm" variant="secondary">{t('verified_runs.open_explorer')}</Button>
            </a>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <p className="font-medium" style={{ color: 'var(--text)' }}>{t('verified_runs.artifact')}</p>
          <p style={{ color: 'var(--text-muted)' }}>{run.artifactRelativePath}</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <section className="xl:col-span-1 space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{t('verified_runs.amounts')}</h2>
            <div className="rounded-2xl px-4 py-3 space-y-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              {amountRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{row.value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="xl:col-span-2 space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{t('verified_runs.contracts')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {contractLinks.map((entry) => (
                <a
                  key={entry.label}
                  href={entry.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl px-4 py-3 transition-opacity hover:opacity-85"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                >
                  <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{entry.label}</p>
                  <p className="text-sm font-medium mt-1" style={{ color: 'var(--text)' }}>{formatAddress(entry.value)}</p>
                </a>
              ))}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{t('verified_runs.transactions')}</h2>
            <div className="space-y-3">
              {run.successfulTransactions.map((tx) => (
                <a
                  key={tx.name}
                  href={tx.link}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl px-4 py-3 transition-opacity hover:opacity-90"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{tx.name}</p>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>#{tx.blockNumber ?? '—'}</span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{formatAddress(tx.hash)}</p>
                </a>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{t('verified_runs.conditions')}</h2>
            <div className="space-y-3">
              {run.staticChecks.map((check) => (
                <div
                  key={check.name}
                  className="rounded-2xl px-4 py-3"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                >
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{check.name}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{check.expectedReason}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

export default function VerifiedRunsPage() {
  const { t } = useI18n();
  const { runs, loading, error } = useVerifiedRuns();

  return (
    <div className="space-y-6">
      <section
        className="rounded-[28px] p-6 md:p-8"
        style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(60,242,255,0.07) 100%)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2 max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
              {t('verified_runs.eyebrow')}
            </p>
            <h1 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.3rem)', fontWeight: 600, color: 'var(--text)' }}>
              {t('verified_runs.title')}
            </h1>
            <p className="text-sm md:text-base" style={{ color: 'var(--text-muted)' }}>
              {t('verified_runs.subtitle')}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Link href="/dashboard">
              <Button size="sm" variant="secondary">{t('common.back')}</Button>
            </Link>
            <a href="https://explorer.testnet.lukso.network" target="_blank" rel="noreferrer">
              <Button size="sm">{t('verified_runs.open_explorer')}</Button>
            </a>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-6 text-sm" style={{ color: 'var(--blocked)' }}>
            {t('dashboard.verified_runs.error_prefix')} {error}
          </CardContent>
        </Card>
      ) : runs.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('verified_runs.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {runs.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}