'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { useMode } from '@/context/ModeContext';
import { Badge } from '@/components/common/Badge';
import { useI18n } from '@/context/I18nContext';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const { mode, setMode } = useMode();
  const { t, locale, setLocale } = useI18n();

  return (
    <div className="space-y-lg max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">{t('settings.title')}</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-xs">
          {t('settings.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.mode.title')}</CardTitle>
          <CardDescription>{t('settings.mode.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-md">
          <div className="space-y-sm">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              {t('settings.mode.current')}: <Badge variant={mode === 'simple' ? 'success' : 'primary'}>{mode}</Badge>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            {/* Simple Mode */}
            <div className={`rounded-lg border-2 p-md transition-colors cursor-pointer ${
              mode === 'simple'
                ? 'border-primary bg-blue-50 dark:bg-blue-900/20'
                : 'border-neutral-200 dark:border-neutral-700'
            }`}
            onClick={() => setMode('simple')}
            >
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-50">{t('settings.mode.simple.title')}</h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-sm">
                {t('settings.mode.simple.desc')}
              </p>
              <ul className="text-xs text-neutral-600 dark:text-neutral-400 mt-sm space-y-xs">
                <li>✓ {t('settings.mode.simple.f1')}</li>
                <li>✓ {t('settings.mode.simple.f2')}</li>
                <li>✓ {t('settings.mode.simple.f3')}</li>
                <li>✓ {t('settings.mode.simple.f4')}</li>
              </ul>
              {mode === 'simple' && (
                <Button size="sm" variant="primary" className="mt-md w-full">
                  {t('settings.mode.btn.active')}
                </Button>
              )}
              {mode !== 'simple' && (
                <Button size="sm" variant="secondary" className="mt-md w-full" onClick={() => setMode('simple')}>
                  {t('settings.mode.btn.switch_simple')}
                </Button>
              )}
            </div>

            {/* Advanced Mode */}
            <div className={`rounded-lg border-2 p-md transition-colors cursor-pointer ${
              mode === 'advanced'
                ? 'border-primary bg-blue-50 dark:bg-blue-900/20'
                : 'border-neutral-200 dark:border-neutral-700'
            }`}
            onClick={() => setMode('advanced')}
            >
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-50">{t('settings.mode.advanced.title')} <Badge variant="primary">Pro</Badge></h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-sm">
                {t('settings.mode.advanced.desc')}
              </p>
              <ul className="text-xs text-neutral-600 dark:text-neutral-400 mt-sm space-y-xs">
                <li>✓ {t('settings.mode.advanced.f1')}</li>
                <li>✓ {t('settings.mode.advanced.f2')}</li>
                <li>✓ {t('settings.mode.advanced.f3')}</li>
                <li>✓ {t('settings.mode.advanced.f4')}</li>
              </ul>
              {mode === 'advanced' && (
                <Button size="sm" variant="primary" className="mt-md w-full">
                  {t('settings.mode.btn.active')}
                </Button>
              )}
              {mode !== 'advanced' && (
                <Button size="sm" variant="secondary" className="mt-md w-full" onClick={() => setMode('advanced')}>
                  {t('settings.mode.btn.switch_advanced')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.language.title')}</CardTitle>
          <CardDescription>{t('settings.language.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-sm">
            <button
              onClick={() => setLocale('en')}
              className={`px-md py-sm rounded-md border-2 text-sm font-medium transition-colors ${
                locale === 'en'
                  ? 'border-primary bg-blue-50 text-primary dark:bg-blue-900/20'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
              }`}
            >
              🇬🇧 English
            </button>
            <button
              onClick={() => setLocale('es')}
              className={`px-md py-sm rounded-md border-2 text-sm font-medium transition-colors ${
                locale === 'es'
                  ? 'border-primary bg-blue-50 text-primary dark:bg-blue-900/20'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
              }`}
            >
              🇪🇸 Español
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.network.title')}</CardTitle>
          <CardDescription>{t('settings.network.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-sm">
            <div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('settings.network.label')}</p>
              <p className="font-semibold text-neutral-900 dark:text-neutral-50">{t('settings.network.value')}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('settings.network.registry')}</p>
              <p className="font-mono text-sm text-neutral-700 dark:text-neutral-300">
                {process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || t('settings.network.not_configured')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
