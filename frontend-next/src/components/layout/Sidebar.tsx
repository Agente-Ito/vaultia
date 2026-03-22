'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMode } from '@/context/ModeContext';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/context/I18nContext';
import { useOnboarding } from '@/context/OnboardingContext';
import { useDemo } from '@/context/DemoContext';
import { cn } from '@/lib/utils/cn';

// ─── Nav structure ────────────────────────────────────────────────────────────

type NavItem = { href: string; labelKey: string; icon: string };

const AGENTS_ENABLED = !!process.env.NEXT_PUBLIC_COORDINATOR_ADDRESS;

const CORE_ITEMS: NavItem[] = [
  { href: '/dashboard',  labelKey: 'nav.dashboard',       icon: '◈' },
  { href: '/vaults',     labelKey: 'nav.spaces',           icon: '✦' },
  { href: '/missions',   labelKey: 'nav.active_automations', icon: '⚡' },
  { href: '/rules',      labelKey: 'nav.spending_rules',   icon: '⬡' },
  { href: '/activity',   labelKey: 'nav.activity',         icon: '◎' },
  { href: '/verified-runs', labelKey: 'nav.verified_runs', icon: '▣' },
  { href: '/profiles',   labelKey: 'nav.profiles',         icon: '◉' },
];

const PRO_ITEMS: NavItem[] = [
  { href: '/agents',     labelKey: 'nav.automations',      icon: '⬛' },
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: '/settings',   labelKey: 'nav.settings',         icon: '⚙' },
];

// ─── Single nav link ──────────────────────────────────────────────────────────

function NavLink({
  item,
  isActive,
  onClose,
  badge,
}: {
  item: NavItem;
  isActive: boolean;
  onClose: () => void;
  badge?: string;
}) {
  const { t } = useI18n();
  return (
    <Link
      href={item.href}
      onClick={onClose}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative group',
        isActive
          ? 'text-white'
          : 'hover:text-white'
      )}
      style={isActive ? {
        background: 'linear-gradient(135deg, rgba(123,97,255,0.25) 0%, rgba(60,242,255,0.1) 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(123,97,255,0.4)',
      } : undefined}
    >
      {/* Active indicator bar */}
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
          style={{ background: 'var(--accent)' }}
        />
      )}
      <span
        className={cn('text-sm font-mono flex-shrink-0 w-5 text-center', isActive ? 'opacity-100' : 'opacity-50 group-hover:opacity-80')}
      >
        {item.icon}
      </span>
      <span className="flex-1" style={{ color: isActive ? 'var(--text)' : 'var(--text-muted)' }}>
        {t(item.labelKey as Parameters<typeof t>[0])}
      </span>
      {badge && (
        <span className="text-xs px-1.5 py-0.5 rounded-md font-normal" style={{ background: 'rgba(123,97,255,0.2)', color: 'var(--accent)' }}>
          {badge}
        </span>
      )}
    </Link>
  );
}

// ─── Section divider ──────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-5 pb-1">
      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
    </div>
  );
}

// ─── Theme toggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  const { t } = useI18n();
  return (
    <button
      onClick={toggle}
      title={t('settings.theme.toggle')}
      className="flex items-center gap-2 text-xs transition-colors hover:opacity-80 w-full"
      style={{ color: 'var(--text-muted)' }}
    >
      <span>{isDark ? '☀' : '☾'}</span>
      <span>{isDark ? t('settings.theme.light') : t('settings.theme.dark')}</span>
    </button>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAdvanced } = useMode();
  const { t } = useI18n();
  const { completed, setWizardMode } = useOnboarding();
  const { isDemo, enableDemo, disableDemo } = useDemo();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {/* Overlay — always shown (not just mobile) in setup mode */}
      {isOpen && (
        <div
          className={cn('fixed inset-0 z-20 bg-black/60 backdrop-blur-sm', !pathname.startsWith('/setup') && 'md:hidden')}
          onClick={onClose}
        />
      )}

      {/* Sidebar panel — pinned on desktop except in setup mode */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-64 flex flex-col overflow-y-auto transition-transform duration-300',
          !pathname.startsWith('/setup') && 'md:relative md:translate-x-0 md:w-64',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div className="px-5 py-5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          {/* Granular sky logo mark */}
          <div className="flex items-center gap-2.5 mb-1">
            <div className="relative w-7 h-7 flex-shrink-0">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                style={{ background: 'linear-gradient(135deg, #7B61FF, #3CF2FF)' }}
              >
                V
              </div>
            </div>
            <h1 className="text-base font-bold tracking-tight" style={{ color: 'var(--text)' }}>
              {t('nav.app_name_vaultia')}
            </h1>
          </div>
          <p className="text-xs pl-9" style={{ color: 'var(--text-muted)' }}>
            {t(isAdvanced ? 'nav.advanced_mode' : 'nav.simple_mode')}
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {/* Core section */}
          {CORE_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} isActive={isActive(item.href)} onClose={onClose} />
          ))}

          {/* Pro section — only visible in advanced mode */}
          {isAdvanced && (
            <>
              <SectionDivider label={t('nav.section.pro')} />
              {PRO_ITEMS.filter((item) => AGENTS_ENABLED || item.href !== '/agents').map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  isActive={isActive(item.href)}
                  onClose={onClose}
                  badge={item.href === '/agents' ? 'Pro' : undefined}
                />
              ))}
            </>
          )}

          {/* Bottom items */}
          <div className="pt-3 mt-3 space-y-0.5" style={{ borderTop: '1px solid var(--border)' }}>
            {BOTTOM_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} isActive={isActive(item.href)} onClose={onClose} />
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div
          className="px-4 py-3 flex-shrink-0 space-y-2.5"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}
        >
          {/* Theme toggle */}
          <ThemeToggle />

          {/* Demo mode toggle */}
          <button
            onClick={() => { if (isDemo) { disableDemo(); } else { enableDemo(); } onClose(); }}
            className={cn('w-full flex items-center gap-2 text-xs transition-colors')}
            style={{ color: isDemo ? 'var(--warning)' : 'var(--text-muted)' }}
          >
            <span>◎</span>
            <span>{t(isDemo ? 'demo.exit' : 'demo.try_demo')}</span>
          </button>

          {/* Setup guide */}
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
            className="w-full flex items-center gap-2 text-xs transition-colors"
            style={{ color: completed ? 'var(--text-muted)' : 'var(--warning)' }}
          >
            <span>{completed ? '◎' : '⚡'}</span>
            <span>{t(completed ? 'nav.setup_reopen' : 'nav.setup_cta')}</span>
          </button>

          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>{t('nav.network')}</p>
            <a
              href="https://github.com/locodigo/agent-vault-protocol"
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub"
              className="opacity-40 hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-label="GitHub">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.607.069-.607 1.004.07 1.532 1.032 1.532 1.032.891 1.529 2.341 1.087 2.91.832.091-.647.349-1.086.635-1.337-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.682-.103-.253-.446-1.27.098-2.646 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.376.202 2.393.1 2.646.64.698 1.028 1.591 1.028 2.682 0 3.841-2.337 4.687-4.565 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

