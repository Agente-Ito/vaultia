'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Button } from '@/components/common/Button';
import { useI18n } from '@/context/I18nContext';
import { useMissions } from '@/hooks/useMissions';
import { useWeb3 } from '@/context/Web3Context';
import { MissionCard } from '@/components/missions/MissionCard';
import { Skeleton } from '@/components/common/Skeleton';
import { Alert, AlertDescription } from '@/components/common/Alert';

export default function MissionsPage() {
  const { t } = useI18n();
  const { account } = useWeb3();
  const { missions, loading, error, reload } = useMissions(account);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            🎯 {t('missions.page_title')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {t('missions.page_desc')}
          </p>
        </div>
        <Link href="/missions/create">
          <Button variant="primary" size="md">+ {t('missions.create_cta')}</Button>
        </Link>
      </div>

      <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
        <span>🔒</span>
        <span>{t('missions.trust_copy')}</span>
      </p>

      {error && (
        <Alert variant="error"><AlertDescription>{error}</AlertDescription></Alert>
      )}

      {loading && (
        <div className="space-y-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-lg" />)}
        </div>
      )}

      {!loading && !error && missions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <span className="text-6xl">🎯</span>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
              {t('missions.empty_title')}
            </h2>
            <p className="text-sm mt-1 max-w-sm" style={{ color: 'var(--text-muted)' }}>
              {t('missions.empty_desc')}
            </p>
          </div>
          <Link href="/missions/create">
            <Button variant="primary">{t('missions.create_cta')}</Button>
          </Link>
        </div>
      )}

      {!loading && missions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {missions.map((mission, i) => (
            <div key={mission.id} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <MissionCard mission={mission} onUpdate={reload} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
