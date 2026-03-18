'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMode } from '@/context/ModeContext';
import { useI18n } from '@/context/I18nContext';
import { useOnboarding } from '@/context/OnboardingContext';
import { useDemo } from '@/context/DemoContext';
import { cn } from '@/lib/utils/cn';

// ─── Nav structure ────────────────────────────────────────────────────────────

type NavItem = { href: string; labelKey: string; icon: string };

const CORE_ITEMS: NavItem[] = [
  { href: '/dashboard',  labelKey: 'nav.dashboard',  icon: '📊' },
  { href: '/vaults',     labelKey: 'nav.vaults',     icon: '🔐' },
  { href: '/rules',      labelKey: 'nav.rules',      icon: '🛡️' },
  { href: '/activity',   labelKey: 'nav.activity',   icon: '📈' },
  { href: '/profiles',   labelKey: 'nav.profiles',   icon: '👥' },
];

const PRO_ITEMS: NavItem[] = [
  { href: '/agents',     labelKey: 'nav.agents',     icon: '🤖' },
  { href: '/automation', labelKey: 'nav.automation', icon: '⏰' },
  { href: '/budgets',    labelKey: 'nav.budgets',    icon: '💰' },
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: '/settings',   labelKey: 'nav.settings',   icon: '⚙️' },
];

// ─── Single nav link ──────────────────────────────────────────────────────────

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
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative',
        isActive
          ? 'bg-primary-600 text-white'
          : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
      )}
    >
      {/* Active indicator bar */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-r-full" />
      )}
      <span className="text-base" aria-hidden="true">{item.icon}</span>
      <span>{t(item.labelKey as Parameters<typeof t>[0])}</span>
    </Link>
  );
}

// ─── Section divider ──────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-4 pb-1">
      <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      <div className="flex-1 h-px bg-neutral-800" />
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { isAdvanced } = useMode();
  const { t } = useI18n();
  const { completed, dismissed, open: openOnboarding } = useOnboarding();
  const { isDemo, enableDemo, disableDemo } = useDemo();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-64 bg-neutral-900 text-neutral-50 flex flex-col border-r border-neutral-800 overflow-y-auto transition-transform duration-300 md:relative md:translate-x-0 md:w-64',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="px-5 py-5 border-b border-neutral-800 flex-shrink-0">
          <h1 className="text-lg font-bold text-white tracking-tight">
            💰 {t('nav.app_name')}
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
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
              {PRO_ITEMS.map((item) => (
                <NavLink key={item.href} item={item} isActive={isActive(item.href)} onClose={onClose} />
              ))}
            </>
          )}

          {/* Bottom items */}
          <div className="pt-3 border-t border-neutral-800 mt-3 space-y-0.5">
            {BOTTOM_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} isActive={isActive(item.href)} onClose={onClose} />
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-neutral-800 bg-neutral-950 flex-shrink-0 space-y-2">
          {/* Demo mode toggle */}
          <button
            onClick={() => { isDemo ? disableDemo() : enableDemo(); onClose(); }}
            className={cn(
              'w-full flex items-center gap-2 text-xs transition-colors',
              isDemo
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-neutral-500 hover:text-neutral-300'
            )}
          >
            <span>🎮</span>
            <span>{t(isDemo ? 'demo.exit' : 'demo.try_demo')}</span>
          </button>

          {/* Setup guide */}
          <button
            onClick={() => { openOnboarding(); onClose(); }}
            className={cn(
              'w-full flex items-center gap-2 text-xs transition-colors',
              completed || dismissed
                ? 'text-neutral-500 hover:text-neutral-300'
                : 'text-yellow-400 hover:text-yellow-300'
            )}
          >
            <span>{completed ? '📖' : '⚡'}</span>
            <span>{t(completed ? 'nav.setup_reopen' : 'nav.setup_cta')}</span>
          </button>

          <p className="text-xs text-neutral-500">{t('nav.network')}</p>
        </div>
      </div>
    </>
  );
}
