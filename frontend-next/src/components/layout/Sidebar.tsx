'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMode } from '@/context/ModeContext';
import { useI18n } from '@/context/I18nContext';
import { useOnboarding } from '@/context/OnboardingContext';
import { cn } from '@/lib/utils/cn';
import { VaultiaLogoLink } from '@/components/common/VaultiaLogo';

type NavItem = {
  href: string;
  labelKey: string;
  hidden?: boolean;
};

const AGENTS_ENABLED = !!process.env.NEXT_PUBLIC_COORDINATOR_ADDRESS;

const CORE_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard' },
  { href: '/vaults', labelKey: 'nav.vaults' },
  { href: '/agents', labelKey: 'nav.agents', hidden: !AGENTS_ENABLED },
  { href: '/missions', labelKey: 'nav.active_automations' },
  { href: '/rules', labelKey: 'nav.rules' },
  { href: '/activity', labelKey: 'nav.activity' },
  { href: '/profiles', labelKey: 'nav.profiles' },
];

function NavLink({
  item,
  isActive,
  onClose,
}: {
  item: NavItem;
  isActive: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();

  return (
    <Link
      href={item.href}
      onClick={onClose}
      aria-current={isActive ? 'page' : undefined}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200"
      style={{
        background: isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
        boxShadow: isActive ? 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 32%, transparent)' : 'none',
      }}
    >
      <span className="flex h-4 w-4 items-center justify-center flex-shrink-0" aria-hidden="true">
        <span
          className="block h-2.5 w-2.5 rounded-full transition-all duration-200"
          style={{
            background: isActive ? 'var(--accent)' : 'transparent',
            border: `1px solid ${isActive ? 'var(--accent)' : 'var(--text-muted)'}`,
            boxShadow: isActive ? '0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent)' : 'none',
          }}
        />
      </span>
      <span style={{ color: isActive ? 'var(--text)' : 'var(--text-muted)' }}>
        {t(item.labelKey as Parameters<typeof t>[0])}
      </span>
    </Link>
  );
}

export function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAdvanced } = useMode();
  const { t } = useI18n();
  const { completed, setWizardMode } = useOnboarding();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {isOpen && (
        <div
          className={cn('fixed inset-0 z-20 bg-black/60 backdrop-blur-sm', !pathname.startsWith('/setup') && 'md:hidden')}
          onClick={onClose}
        />
      )}

      <div
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col overflow-y-auto transition-transform duration-300',
          !pathname.startsWith('/setup') && 'md:relative md:translate-x-0 md:w-64',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border)' }}
      >
        <div className="flex-shrink-0 px-5 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="mb-1">
            <VaultiaLogoLink height={26} />
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('nav.network')}
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-3">
          {CORE_ITEMS.filter((item) => !item.hidden).map((item) => (
            <NavLink key={item.href} item={item} isActive={isActive(item.href)} onClose={onClose} />
          ))}
        </nav>

        <div className="flex-shrink-0 space-y-2.5 px-4 py-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <button
            onClick={() => {
              if (isAdvanced) {
                setWizardMode('expert');
                router.push('/vaults/create');
              } else {
                setWizardMode('simple');
                router.push('/setup');
              }
              onClose();
            }}
            className="flex w-full items-center gap-2 text-xs transition-colors"
            style={{ color: completed ? 'var(--text-muted)' : 'var(--warning)' }}
          >
            <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full border" style={{ borderColor: completed ? 'var(--text-muted)' : 'var(--warning)', background: completed ? 'transparent' : 'var(--warning)' }} />
            </span>
            <span>{t(completed ? 'nav.setup_reopen' : 'nav.setup_cta')}</span>
          </button>

          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t(isAdvanced ? 'topbar.advanced' : 'topbar.simple')}
          </p>
        </div>
      </div>
    </>
  );
}

