'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMode } from '@/context/ModeContext';
import { useI18n } from '@/context/I18nContext';
import { useWeb3 } from '@/context/Web3Context';
import { useUniversalProfile } from '@/hooks/useUniversalProfile';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { cn } from '@/lib/utils/cn';

// ─── Page meta ────────────────────────────────────────────────────────────────

const PAGE_META: Record<string, { titleKey: string; ctaLabelKey?: string; ctaHref?: string }> = {
  '/dashboard':     { titleKey: 'nav.dashboard' },
  '/vaults':        { titleKey: 'nav.vaults',    ctaLabelKey: 'vaults.create', ctaHref: '/vaults/create' },
  '/vaults/create': { titleKey: 'create.title' },
  '/rules':         { titleKey: 'nav.rules' },
  '/activity':      { titleKey: 'nav.activity' },
  '/profiles':      { titleKey: 'nav.profiles' },
  '/agents':        { titleKey: 'nav.agents' },
  '/automation':    { titleKey: 'nav.automation' },
  '/budgets':       { titleKey: 'nav.budgets' },
  '/settings':      { titleKey: 'nav.settings' },
};

function resolvePageMeta(pathname: string) {
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  const prefix = Object.keys(PAGE_META)
    .filter((k) => pathname.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? PAGE_META[prefix] : { titleKey: 'nav.app_name' };
}

// ─── UP Avatar ────────────────────────────────────────────────────────────────

function UPAvatar({
  avatarUrl,
  name,
  address,
}: {
  avatarUrl: string | null;
  name: string;
  address: string;
}) {
  const initial = name ? name[0].toUpperCase() : address[2]?.toUpperCase() ?? '?';

  if (avatarUrl) {
    return (
      <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-primary-400 flex-shrink-0">
        <Image
          src={avatarUrl}
          alt={name || address}
          width={32}
          height={32}
          className="w-full h-full object-cover"
          unoptimized // IPFS URLs need unoptimized
        />
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
      {initial}
    </div>
  );
}

// ─── Login button ─────────────────────────────────────────────────────────────

function LoginButton({
  hasUPExtension,
  onConnect,
}: {
  hasUPExtension: boolean;
  onConnect?: () => void;
}) {
  const { t } = useI18n();

  if (hasUPExtension) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <button
          onClick={onConnect}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lukso-gradient text-white text-xs font-semibold shadow-sm hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(135deg, #FE005B 0%, #FF9B00 100%)' }}
        >
          <span>🌐</span>
          {t('up.login_button')}
        </button>
        <button
          onClick={onConnect}
          className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
        >
          {t('up.metamask_fallback')}
        </button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="primary" onClick={onConnect}>
      {t('common.connect_wallet')}
    </Button>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

interface TopBarProps {
  account: string | null;
  chainId: number | null;
  onMenuClick?: () => void;
  onConnect?: () => void;
}

export function TopBar({ account, chainId, onMenuClick, onConnect }: TopBarProps) {
  const { mode, setMode } = useMode();
  const { t, locale, setLocale } = useI18n();
  const { isUniversalProfile, hasUPExtension } = useWeb3();
  const pathname = usePathname();

  const pageMeta  = resolvePageMeta(pathname);
  const pageTitle = t(pageMeta.titleKey as Parameters<typeof t>[0]);

  // Only fetch UP profile when connected via UP extension
  const { profile } = useUniversalProfile(
    isUniversalProfile ? account : null,
    chainId
  );

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
      <div className="px-lg py-md flex items-center gap-md">
        {/* Mobile menu */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-xs hover:bg-neutral-100 rounded-md dark:hover:bg-neutral-700 flex-shrink-0"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Page title + context CTA */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50 truncate">
            {pageTitle}
          </h2>
          {pageMeta.ctaHref && pageMeta.ctaLabelKey && (
            <Link href={pageMeta.ctaHref} className="hidden sm:block flex-shrink-0">
              <Button size="sm" variant="primary">
                {t(pageMeta.ctaLabelKey as Parameters<typeof t>[0])}
              </Button>
            </Link>
          )}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-md flex-shrink-0">
          {/* Mode toggle */}
          <div className="hidden sm:flex items-center gap-xs bg-neutral-100 rounded-md p-xs dark:bg-neutral-700">
            {(['simple', 'advanced'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'px-sm py-xs text-xs font-medium rounded transition-colors',
                  mode === m
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-white'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
                )}
              >
                {t(m === 'simple' ? 'topbar.simple' : 'topbar.advanced')}
              </button>
            ))}
          </div>

          {/* Language toggle */}
          <div className="hidden sm:flex items-center gap-xs bg-neutral-100 rounded-md p-xs dark:bg-neutral-700">
            {(['en', 'es'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={cn(
                  'px-sm py-xs text-xs font-medium rounded transition-colors',
                  locale === l
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-white'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
                )}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Notification bell — only for UP users */}
          {isUniversalProfile && account && (
            <NotificationBell upAddress={account} chainId={chainId} />
          )}

          {/* Chain badge */}
          {chainId && (
            <Badge variant={chainId === 4201 || chainId === 42 ? 'success' : 'danger'}>
              {chainId === 4201 ? t('topbar.lukso_testnet') : chainId === 42 ? t('topbar.lukso_mainnet') : `${t('topbar.wrong_chain')} ${chainId}`}
            </Badge>
          )}

          {/* Account / Login */}
          {account ? (
            <div className="flex items-center gap-sm">
              {/* UP identity: name + address */}
              <div className="hidden sm:block text-right">
                {isUniversalProfile && profile?.name ? (
                  <>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 leading-tight">
                      {profile.name}
                    </p>
                    <p className="text-xs text-neutral-400 font-mono">{formatAddress(account)}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('common.connected')}</p>
                    <p className="text-sm font-mono font-medium text-neutral-900 dark:text-neutral-50">
                      {formatAddress(account)}
                    </p>
                  </>
                )}
              </div>

              <UPAvatar
                avatarUrl={isUniversalProfile ? (profile?.avatarUrl ?? null) : null}
                name={profile?.name ?? ''}
                address={account}
              />
            </div>
          ) : (
            <LoginButton hasUPExtension={hasUPExtension} onConnect={onConnect} />
          )}
        </div>
      </div>
    </header>
  );
}
