'use client';

import Image from 'next/image';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { useMode } from '@/context/ModeContext';
import { Badge } from '@/components/common/Badge';
import { useI18n } from '@/context/I18nContext';
import { useWeb3 } from '@/context/Web3Context';
import { useUniversalProfile } from '@/hooks/useUniversalProfile';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const { mode, setMode } = useMode();
  const { t, locale, setLocale } = useI18n();
  const { account, chainId, isUniversalProfile, hasUPExtension } = useWeb3();
  const { profile, loading } = useUniversalProfile(account, chainId);

  // Universal Profile explorer URL
  const upExplorerUrl = account
    ? `https://universalprofile.cloud/${account}${chainId === 4201 ? '?network=testnet' : ''}`
    : null;

  const modeCardStyle = (active: boolean) => ({
    borderRadius: '0.75rem',
    border: active ? '2px solid var(--primary)' : '2px solid var(--border)',
    background: active ? 'rgba(16,185,129,0.06)' : 'var(--card)',
    padding: '1rem',
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s',
  });

  const langBtnStyle = (active: boolean) => ({
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    border: active ? '2px solid var(--primary)' : '2px solid var(--border)',
    background: active ? 'rgba(16,185,129,0.06)' : 'transparent',
    color: active ? '#10B981' : 'var(--text-muted)',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  });

  return (
    <div className="space-y-lg max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{t('settings.title')}</h1>
        <p className="mt-xs" style={{ color: 'var(--text-muted)' }}>
          {t('settings.subtitle')}
        </p>
      </div>

      {/* ─── Universal Profile card ───────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{t('up.profile.title')}</CardTitle>
          <CardDescription>{t('up.profile.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!account ? (
            /* Not connected */
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="text-4xl">🌐</span>
              <p className="text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
                {t('up.profile.not_connected')}
              </p>
              {!hasUPExtension && (
                <a
                  href="https://chromewebstore.google.com/detail/universal-profiles/abpickdkkbnbcoepogfhkhennhfhehfn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs hover:underline"
                  style={{ color: 'var(--primary)' }}
                >
                  {t('up.install_extension')}
                </a>
              )}
            </div>
          ) : loading ? (
            /* Loading */
            <div className="flex items-center gap-3 py-4">
              <div
                className="w-14 h-14 rounded-full animate-pulse flex-shrink-0"
                style={{ background: 'var(--card-mid)' }}
              />
              <div className="space-y-2 flex-1">
                <div className="h-4 w-32 rounded animate-pulse" style={{ background: 'var(--card-mid)' }} />
                <div className="h-3 w-48 rounded animate-pulse" style={{ background: 'var(--card-mid)' }} />
              </div>
            </div>
          ) : (
            /* Profile loaded */
            <div className="space-y-4">
              {/* Background banner */}
              {profile?.backgroundUrl && (
                <div className="relative h-24 -mx-6 -mt-6 overflow-hidden rounded-t-none">
                  <Image
                    src={profile.backgroundUrl}
                    alt="Profile background"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30" />
                </div>
              )}

              {/* Avatar + identity */}
              <div className="flex items-start gap-4">
                <div
                  className="flex-shrink-0"
                  style={profile?.backgroundUrl
                    ? { marginTop: '-2rem', borderRadius: '9999px', boxShadow: '0 0 0 4px var(--card)' }
                    : undefined}
                >
                  {profile?.avatarUrl ? (
                    <Image
                      src={profile.avatarUrl}
                      alt={profile.name || account}
                      width={56}
                      height={56}
                      className="w-14 h-14 rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold"
                      style={{ background: 'var(--primary)', color: '#fff' }}
                    >
                      {(profile?.name?.[0] ?? account[2] ?? '?').toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-bold" style={{ color: 'var(--text)' }}>
                      {profile?.name || t('up.profile.no_name')}
                    </p>
                    {isUniversalProfile && (
                      <Badge variant="primary">Universal Profile</Badge>
                    )}
                  </div>
                  <p className="text-xs font-mono mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    {account}
                  </p>
                  {profile?.description && (
                    <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                      {profile.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Tags */}
              {profile?.tags && profile.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {profile.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: 'var(--card-mid)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Links */}
              {profile?.links && profile.links.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {profile.links.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs hover:underline"
                      style={{ color: 'var(--primary)' }}
                    >
                      {link.title} ↗
                    </a>
                  ))}
                </div>
              )}

              {/* View on UP explorer */}
              {upExplorerUrl && (
                <a href={upExplorerUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="secondary" size="sm">
                    {t('up.profile.view')} ↗
                  </Button>
                </a>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Mode selector ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.mode.title')}</CardTitle>
          <CardDescription>{t('settings.mode.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-md">
          <div className="space-y-sm">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {t('settings.mode.current')}: <Badge variant={mode === 'simple' ? 'success' : 'primary'}>{mode}</Badge>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            {/* Simple Mode */}
            <div style={modeCardStyle(mode === 'simple')} onClick={() => setMode('simple')}>
              <h4 className="font-semibold" style={{ color: 'var(--text)' }}>{t('settings.mode.simple.title')}</h4>
              <p className="text-sm mt-sm" style={{ color: 'var(--text-muted)' }}>
                {t('settings.mode.simple.desc')}
              </p>
              <ul className="text-xs mt-sm space-y-xs" style={{ color: 'var(--text-muted)' }}>
                <li>✓ {t('settings.mode.simple.f1')}</li>
                <li>✓ {t('settings.mode.simple.f2')}</li>
                <li>✓ {t('settings.mode.simple.f3')}</li>
                <li>✓ {t('settings.mode.simple.f4')}</li>
              </ul>
              {mode === 'simple' ? (
                <Button size="sm" variant="primary" className="mt-md w-full">
                  {t('settings.mode.btn.active')}
                </Button>
              ) : (
                <Button size="sm" variant="secondary" className="mt-md w-full" onClick={() => setMode('simple')}>
                  {t('settings.mode.btn.switch_simple')}
                </Button>
              )}
            </div>

            {/* Advanced Mode */}
            <div style={modeCardStyle(mode === 'advanced')} onClick={() => setMode('advanced')}>
              <h4 className="font-semibold" style={{ color: 'var(--text)' }}>
                {t('settings.mode.advanced.title')} <Badge variant="primary">Pro</Badge>
              </h4>
              <p className="text-sm mt-sm" style={{ color: 'var(--text-muted)' }}>
                {t('settings.mode.advanced.desc')}
              </p>
              <ul className="text-xs mt-sm space-y-xs" style={{ color: 'var(--text-muted)' }}>
                <li>✓ {t('settings.mode.advanced.f1')}</li>
                <li>✓ {t('settings.mode.advanced.f2')}</li>
                <li>✓ {t('settings.mode.advanced.f3')}</li>
                <li>✓ {t('settings.mode.advanced.f4')}</li>
              </ul>
              {mode === 'advanced' ? (
                <Button size="sm" variant="primary" className="mt-md w-full">
                  {t('settings.mode.btn.active')}
                </Button>
              ) : (
                <Button size="sm" variant="secondary" className="mt-md w-full" onClick={() => setMode('advanced')}>
                  {t('settings.mode.btn.switch_advanced')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Language selector ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.language.title')}</CardTitle>
          <CardDescription>{t('settings.language.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-sm">
            <button style={langBtnStyle(locale === 'en')} onClick={() => setLocale('en')}>
              🇬🇧 English
            </button>
            <button style={langBtnStyle(locale === 'es')} onClick={() => setLocale('es')}>
              🇪🇸 Español
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Network info ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.network.title')}</CardTitle>
          <CardDescription>{t('settings.network.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-sm">
            <div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('settings.network.label')}</p>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>{t('settings.network.value')}</p>
            </div>
            <div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('settings.network.registry')}</p>
              <p className="font-mono text-sm" style={{ color: 'var(--text-muted)' }}>
                {process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || t('settings.network.not_configured')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
