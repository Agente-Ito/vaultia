'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMode } from '@/context/ModeContext';
import { useI18n } from '@/context/I18nContext';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { cn } from '@/lib/utils/cn';

// ─── Page title + optional CTA resolved from pathname ─────────────────────────

const PAGE_META: Record<string, { titleKey: string; ctaLabelKey?: string; ctaHref?: string }> = {
  '/dashboard':       { titleKey: 'nav.dashboard' },
  '/vaults':          { titleKey: 'nav.vaults',     ctaLabelKey: 'vaults.create',        ctaHref: '/vaults/create' },
  '/vaults/create':   { titleKey: 'create.title' },
  '/rules':           { titleKey: 'nav.rules' },
  '/activity':        { titleKey: 'nav.activity' },
  '/agents':          { titleKey: 'nav.agents' },
  '/automation':      { titleKey: 'nav.automation' },
  '/budgets':         { titleKey: 'nav.budgets' },
  '/settings':        { titleKey: 'nav.settings' },
};

function resolvePageMeta(pathname: string) {
  // Exact match first, then prefix match
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  const prefix = Object.keys(PAGE_META)
    .filter((k) => pathname.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? PAGE_META[prefix] : { titleKey: 'nav.app_name' };
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
  const pathname = usePathname();

  const pageMeta = resolvePageMeta(pathname);
  const pageTitle = t(pageMeta.titleKey as Parameters<typeof t>[0]);

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
      <div className="px-lg py-md flex items-center gap-md">
        {/* Mobile menu button */}
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
            <button
              onClick={() => setMode('simple')}
              className={cn(
                'px-sm py-xs text-xs font-medium rounded transition-colors',
                mode === 'simple'
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-white'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
              )}
            >
              {t('topbar.simple')}
            </button>
            <button
              onClick={() => setMode('advanced')}
              className={cn(
                'px-sm py-xs text-xs font-medium rounded transition-colors',
                mode === 'advanced'
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-white'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
              )}
            >
              {t('topbar.advanced')}
            </button>
          </div>

          {/* Language toggle */}
          <div className="hidden sm:flex items-center gap-xs bg-neutral-100 rounded-md p-xs dark:bg-neutral-700">
            <button
              onClick={() => setLocale('en')}
              className={cn(
                'px-sm py-xs text-xs font-medium rounded transition-colors',
                locale === 'en'
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-white'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
              )}
            >
              EN
            </button>
            <button
              onClick={() => setLocale('es')}
              className={cn(
                'px-sm py-xs text-xs font-medium rounded transition-colors',
                locale === 'es'
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-white'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
              )}
            >
              ES
            </button>
          </div>

          {/* Chain badge */}
          {chainId && (
            <Badge variant={chainId === 4201 || chainId === 42 ? 'success' : 'danger'}>
              {chainId === 4201
                ? t('topbar.lukso_testnet')
                : chainId === 42
                ? t('topbar.lukso_mainnet')
                : `${t('topbar.wrong_chain')} ${chainId}`}
            </Badge>
          )}

          {/* Account */}
          {account ? (
            <div className="flex items-center gap-sm">
              <div className="hidden sm:block text-right">
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('common.connected')}</p>
                <p className="text-sm font-mono font-medium text-neutral-900 dark:text-neutral-50">
                  {formatAddress(account)}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                {account[2] || '?'}
              </div>
            </div>
          ) : (
            <Button size="sm" variant="primary" onClick={onConnect}>
              {t('common.connect_wallet')}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
