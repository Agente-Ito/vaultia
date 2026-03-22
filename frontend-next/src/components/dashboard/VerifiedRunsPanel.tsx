'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Skeleton } from '@/components/common/Skeleton';
import { useI18n } from '@/context/I18nContext';
import { useVerifiedRuns } from '@/hooks/useVerifiedRuns';

export function VerifiedRunsPanel() {
  const { t } = useI18n();
  const { runs, loading, error } = useVerifiedRuns();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1.5">
            <CardTitle>{t('dashboard.verified_runs.title')}</CardTitle>
            <CardDescription>{t('dashboard.verified_runs.desc')}</CardDescription>
          </div>
          <Link href="/verified-runs">
            <Button size="sm" variant="secondary">{t('dashboard.verified_runs.open_cta')}</Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--blocked)', border: '1px solid rgba(239,68,68,0.15)' }}>
            {t('dashboard.verified_runs.error_prefix')} {error}
          </div>
        ) : runs.length === 0 ? (
          <div className="rounded-2xl px-4 py-5 text-sm" style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
            {t('dashboard.verified_runs.empty')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {runs.map((run) => (
              <div
                key={run.id}
                className="rounded-2xl px-4 py-4 space-y-3"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      {run.id === 'lsp7' ? t('verified_runs.lsp7') : t('verified_runs.native')}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {run.network} · {run.chainId}
                    </p>
                  </div>
                  <a
                    href={run.links.safe}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    {t('verified_runs.open_explorer')}
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p style={{ color: 'var(--text-muted)' }}>{t('verified_runs.successful_txs')}</p>
                    <p className="font-semibold" style={{ color: 'var(--text)' }}>{run.successfulTransactions.length}</p>
                  </div>
                  <div>
                    <p style={{ color: 'var(--text-muted)' }}>{t('verified_runs.static_checks')}</p>
                    <p className="font-semibold" style={{ color: 'var(--text)' }}>{run.staticChecks.length}</p>
                  </div>
                </div>

                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {run.artifactRelativePath}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}