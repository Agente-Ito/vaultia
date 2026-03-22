'use client';

import React, { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useDisconnect } from 'wagmi';
import { useMode } from '@/context/ModeContext';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/context/I18nContext';
import { useWeb3 } from '@/context/Web3Context';
import { useUniversalProfile } from '@/hooks/useUniversalProfile';
import { useDisplayName } from '@/hooks/useDisplayName';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { cn } from '@/lib/utils/cn';
import { lookupBasename, BASENAME_CHAINS } from '@/lib/web3/basename';

// ─── Page meta ────────────────────────────────────────────────────────────────

const PAGE_META: Record<string, { titleKey: string; ctaLabelKey?: string; ctaHref?: string }> = {
  '/dashboard':     { titleKey: 'nav.dashboard' },
  '/setup':         { titleKey: 'nav.setup_cta' },
  '/vaults':        { titleKey: 'nav.spaces',         ctaLabelKey: 'vaults.create', ctaHref: '/vaults/create' },
  '/vaults/create': { titleKey: 'create.title' },
  '/rules':         { titleKey: 'nav.spending_rules' },
  '/activity':      { titleKey: 'nav.activity' },
  '/profiles':      { titleKey: 'nav.profiles' },
  '/agents':        { titleKey: 'nav.automations' },
  '/automation':    { titleKey: 'nav.automation' },
  '/budgets':       { titleKey: 'nav.budgets' },
  '/settings':      { titleKey: 'nav.settings' },
  '/missions':      { titleKey: 'nav.active_automations' },
};

function resolvePageMeta(pathname: string) {
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  const prefix = Object.keys(PAGE_META)
    .filter((k) => pathname.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? PAGE_META[prefix] : { titleKey: 'nav.app_name_vaultia' };
}

// ─── Gradient avatar (address-seeded) ─────────────────────────────────────────

function gradientFromAddress(addr: string): string {
  const h1 = parseInt(addr.slice(2, 6), 16) % 360;
  const h2 = (h1 + 120) % 360;
  return `linear-gradient(135deg, hsl(${h1},70%,55%), hsl(${h2},70%,45%))`;
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
      <div
        className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0"
        style={{ boxShadow: '0 0 0 2px var(--accent)' }}
      >
        <Image
          src={avatarUrl}
          alt={name || address}
          width={32}
          height={32}
          className="w-full h-full object-cover"
          unoptimized
        />
      </div>
    );
  }

  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
      style={{ background: gradientFromAddress(address) }}
    >
      {initial}
    </div>
  );
}

// ─── Connect button (RainbowKit, disconnected state) ──────────────────────────

function RainbowConnectButton({ onConnect }: { onConnect?: () => void }) {
  const { t } = useI18n();
  const { hasUPExtension } = useWeb3();

  return (
    <ConnectButton.Custom>
      {({ openConnectModal, mounted }) => {
        if (!mounted) return null;
        const handleClick = () => {
          openConnectModal();
          onConnect?.();
        };
        if (hasUPExtension) {
          return (
            <div className="relative inline-flex">
              <button
                onClick={handleClick}
                className="relative flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-light tracking-widest uppercase z-10 transition-opacity hover:opacity-75"
                style={{ background: 'var(--text)', color: 'var(--bg)', letterSpacing: '0.08em' }}
              >
                {t('up.login_button')}
              </button>
            </div>
          );
        }
        return (
          <div className="relative inline-flex">
            <Button size="sm" variant="primary" onClick={handleClick}>
              {t('common.connect_wallet')}
            </Button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

// ─── Connected account section with dropdown menu ─────────────────────────────

const CHAIN_LABELS: Record<number, string> = {
  4201: 'LUKSO Testnet',
  42:   'LUKSO Mainnet',
  84532: 'Base Sepolia',
  8453:  'Base',
};

function ConnectedAccount({
  account,
  chainId,
  isUniversalProfile,
  profile,
}: {
  account: string;
  chainId: number | null;
  isUniversalProfile: boolean;
  profile: ReturnType<typeof useUniversalProfile>['profile'];
}) {
  const { t } = useI18n();
  const { disconnect } = useDisconnect();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [basename, setBasename] = useState<string | null>(null);
  const { name: resolvedName, isResolved } = useDisplayName(account);

  // Resolve basename for Base chains
  useEffect(() => {
    if (!account || !chainId || !BASENAME_CHAINS.has(chainId)) {
      setBasename(null);
      return;
    }
    lookupBasename(account, chainId).then(setBasename);
  }, [account, chainId]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const chainLabel = chainId ? (CHAIN_LABELS[chainId] ?? `Chain ${chainId}`) : null;
  const isKnownChain = chainId ? chainId in CHAIN_LABELS : false;
  const walletLabel = t('dashboard.graph.wallet');

  // Priority: contact alias / UP name → basename → human wallet label
  const resolvedProfileName = isResolved ? resolvedName : null;
  const displayName = resolvedProfileName ?? basename ?? walletLabel;
  const avatarName = resolvedProfileName ?? basename ?? '';
  const hasExplicitIdentity = !!(resolvedProfileName ?? basename);

  return (
    <ConnectButton.Custom>
      {({ openChainModal }) => (
        <div className="flex items-center gap-sm">
          {/* Chain badge */}
          {chainId && (
            <button
              onClick={openChainModal}
              title={t('topbar.switch_network')}
              className="focus:outline-none"
            >
              <Badge
                variant={isKnownChain ? 'success' : 'danger'}
                className={cn(
                  'cursor-pointer hover:opacity-70 transition-opacity',
                  !isKnownChain && 'animate-[pulse_1.2s_ease-in-out_infinite]'
                )}
                style={{ fontSize: '0.65rem', letterSpacing: '0.06em' }}
              >
                {chainLabel}
              </Badge>
            </button>
          )}

          {/* Identity button — opens dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-sm focus:outline-none"
            >
              {/* Identity text */}
              <div className="hidden sm:block text-right">
                <>
                  <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)' }}>
                    {displayName}
                  </p>
                  {profile?.followerCount !== null && profile?.followerCount !== undefined ? (
                    <p className="text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>
                      {profile.followerCount.toLocaleString()} followers
                    </p>
                  ) : !hasExplicitIdentity && chainLabel ? (
                    <p className="text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>
                      {chainLabel}
                    </p>
                  ) : null}
                </>
              </div>

              <UPAvatar
                avatarUrl={isUniversalProfile ? (profile?.avatarUrl ?? null) : null}
                name={avatarName}
                address={account}
              />
            </button>

            {/* Dropdown menu */}
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-56 rounded-xl overflow-hidden z-50"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                }}
              >
                {/* Profile info */}
                {(hasExplicitIdentity || profile?.description) && (
                  <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    {hasExplicitIdentity && (
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{displayName}</p>
                    )}
                    {profile?.description && (
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{profile.description}</p>
                    )}
                  </div>
                )}

                {/* Address row */}
                <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <p className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>{account}</p>
                </div>

                {/* Switch network */}
                <button
                  onClick={() => { setMenuOpen(false); openChainModal(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
                  style={{ color: 'var(--text)' }}
                >
                  <span>⬡</span>
                  {t('topbar.switch_network')}
                </button>

                {/* Disconnect */}
                <button
                  onClick={() => { setMenuOpen(false); disconnect(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
                  style={{ color: 'var(--blocked)' }}
                >
                  <span>⏻</span>
                  {t('topbar.disconnect')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </ConnectButton.Custom>
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
  const { isDark, toggle: toggleTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const { isUniversalProfile } = useWeb3();
  const pathname = usePathname();
  const router = useRouter();

  const handleModeSwitch = (newMode: 'simple' | 'advanced') => {
    setMode(newMode);
    if (newMode === 'advanced' && pathname === '/setup') {
      router.push('/vaults/create');
    } else if (newMode === 'simple' && pathname === '/vaults/create') {
      router.push('/setup');
    }
  };

  const pageMeta  = resolvePageMeta(pathname);
  const pageTitle = t(pageMeta.titleKey as Parameters<typeof t>[0]);

  // Only fetch UP profile when connected via UP extension
  const { profile } = useUniversalProfile(
    isUniversalProfile ? account : null,
    chainId
  );

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="px-lg py-3 flex items-center gap-md">
        {/* Mobile menu */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-xs rounded flex-shrink-0 transition-opacity hover:opacity-50"
          aria-label="Toggle menu"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Page title + context CTA */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <h2
            className="truncate"
            style={{
              fontSize: '0.8rem',
              fontWeight: 300,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text)',
            }}
          >
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
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Mode toggle */}
          <div
            className="relative hidden sm:flex items-center rounded-md p-0.5"
            style={{ background: 'var(--inactive)', border: '1px solid var(--border)' }}
          >
            {/* Sliding active indicator */}
            <span
              className="absolute top-0.5 bottom-0.5 rounded pointer-events-none"
              style={{
                background: 'var(--bg-surface)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                left: mode === 'simple' ? '2px' : 'calc(50%)',
                width: 'calc(50% - 2px)',
                transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
            {(['simple', 'advanced'] as const).map((m) => (
              <button
                key={m}
                onClick={() => handleModeSwitch(m)}
                className="relative z-10 px-2.5 py-1 rounded transition-colors duration-150"
                style={{
                  flex: '1',
                  fontSize: '0.7rem',
                  fontWeight: mode === m ? 400 : 300,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: 'transparent',
                  color: mode === m ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                {t(m === 'simple' ? 'topbar.simple' : 'topbar.advanced')}
              </button>
            ))}
          </div>

          {/* Language toggle */}
          <div
            className="hidden sm:flex items-center gap-1 rounded-md p-0.5"
            style={{ background: 'var(--inactive)', border: '1px solid var(--border)' }}
          >
            {(['en', 'es'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className="px-2.5 py-1 rounded transition-all duration-150"
                style={{
                  fontSize: '0.7rem',
                  fontWeight: locale === l ? 400 : 300,
                  letterSpacing: '0.06em',
                  background: locale === l ? 'var(--bg-surface)' : 'transparent',
                  color: locale === l ? 'var(--text)' : 'var(--text-muted)',
                  boxShadow: locale === l ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={t('settings.theme.toggle')}
            className="p-1.5 rounded transition-opacity hover:opacity-50 hidden sm:flex items-center justify-center"
            style={{ color: 'var(--text-muted)', background: 'transparent' }}
          >
            {isDark ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5" strokeWidth="2" strokeLinecap="round" />
                <path strokeWidth="2" strokeLinecap="round" d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>

          {/* Notification bell — only for UP users */}
          {isUniversalProfile && account && (
            <NotificationBell upAddress={account} chainId={chainId} />
          )}

          {/* Account / Login */}
          {account ? (
            <ConnectedAccount
              account={account}
              chainId={chainId}
              isUniversalProfile={isUniversalProfile}
              profile={profile}
            />
          ) : (
            <RainbowConnectButton onConnect={onConnect} />
          )}
        </div>
      </div>
    </header>
  );
}
