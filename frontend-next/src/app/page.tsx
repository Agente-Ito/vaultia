'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useWeb3 } from '@/context/Web3Context';
import { useOnboarding } from '@/context/OnboardingContext';
import { useMode } from '@/context/ModeContext';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { useVaults } from '@/hooks/useVaults';
import { cn } from '@/lib/utils/cn';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { VaultiaLogoLink } from '@/components/common/VaultiaLogo';
import { SkillOverlay } from '@/components/landing/SkillOverlay';

// ─── Goal icons ──────────────────────────────────────────────────────────────

type GoalKey = 'pay_people' | 'pay_vendors' | 'subscriptions' | 'save_funds';

function GoalIcon({ goalKey }: { goalKey: GoalKey }) {
  const icons: Record<GoalKey, React.ReactNode> = {
    pay_people: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <circle cx="9" cy="7" r="3" />
        <path d="M3 20c0-4 2.7-7 6-7h2" />
        <circle cx="17" cy="14" r="2.5" />
        <path d="M17 19v-1m0-8v1" />
      </svg>
    ),
    pay_vendors: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <rect x="4" y="8" width="16" height="12" rx="1.5" />
        <path d="M8 8V6a4 4 0 0 1 8 0v2" />
        <path d="M9 14h6M12 14v3" />
      </svg>
    ),
    subscriptions: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M4 12h16M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </svg>
    ),
    save_funds: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M12 3 L20 9 L20 20 L4 20 L4 9 Z" />
        <path d="M9 20v-6h6v6" />
        <line x1="12" y1="3" x2="12" y2="9" />
      </svg>
    ),
  };
  return <>{icons[goalKey]}</>;
}

function GoalCard({
  goalKey,
  selected,
  comingSoon = false,
  onSelect,
}: {
  goalKey: GoalKey;
  selected: boolean;
  comingSoon?: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      onClick={comingSoon ? undefined : onSelect}
      disabled={comingSoon}
      aria-disabled={comingSoon}
      className={cn(
        'relative text-left rounded-xl px-4 py-4 transition-all duration-200 focus:outline-none',
        comingSoon ? 'cursor-default opacity-55' : selected ? 'cursor-pointer' : 'cursor-pointer',
      )}
      style={{
        background: selected ? 'rgba(16,185,129,0.05)' : 'var(--card)',
        border: `1px solid ${selected ? '#10B981' : '#EDEDED'}`,
      }}
      onMouseEnter={(e) => {
        if (!comingSoon && !selected)
          (e.currentTarget as HTMLElement).style.borderColor = '#FFB000';
      }}
      onMouseLeave={(e) => {
        if (!comingSoon && !selected)
          (e.currentTarget as HTMLElement).style.borderColor = '#EDEDED';
      }}
    >
      <span style={{ color: selected ? '#10B981' : comingSoon ? '#AEAEB2' : '#6B7280', display: 'block', marginBottom: 8 }}>
        <GoalIcon goalKey={goalKey} />
      </span>
      <p
        className="text-sm"
        style={{ fontWeight: 400, letterSpacing: '0.04em', color: comingSoon ? 'var(--text-muted)' : 'var(--text)' }}
      >
        {t(`wizard.goal.${goalKey}` as Parameters<typeof t>[0])}
      </p>
      <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)', fontWeight: 300 }}>
        {t(`wizard.goal.${goalKey}_desc` as Parameters<typeof t>[0])}
      </p>
      {selected && !comingSoon && (
        <span
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 7, height: 7, borderRadius: '50%',
            background: '#10B981', boxShadow: '0 0 6px rgba(16,185,129,0.5)',
          }}
        />
      )}
      {comingSoon && (
        <span
          className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(255,176,0,0.1)', color: '#FFB000', border: '1px solid rgba(255,176,0,0.2)', fontSize: '0.65rem', letterSpacing: '0.06em' }}
        >
          {t('wizard.goal.coming_soon')}
        </span>
      )}
    </button>
  );
}

// ─── Landing page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const { account, isConnected, registry } = useWeb3();
  const { setGoal, setWizardMode } = useOnboarding();
  const { mode, setMode } = useMode();
  const { t, locale, setLocale } = useI18n();
  const { isDark, toggle: toggleTheme } = useTheme();
  const { vaults, loading: vaultsLoading } = useVaults(registry, account);

  const [selectedGoal, setSelectedGoal] = React.useState<GoalKey | null>(null);
  const [showSkill, setShowSkill] = useState(false);

  // Track whether the user explicitly triggered the connect flow on this page
  const userInitiatedConnect = React.useRef(false);

  // Redirect only when: user connected here, OR returning to a recent in-app session
  useEffect(() => {
    if (!isConnected || vaultsLoading || vaults.length === 0) return;
    const explicitConnect = userInitiatedConnect.current;
    const recentSession = typeof sessionStorage !== 'undefined' &&
      !!sessionStorage.getItem('vaultia-session-active');
    if (explicitConnect || recentSession) {
      router.replace('/dashboard');
    }
  }, [isConnected, vaultsLoading, vaults.length, router]);

  // If connected but no vaults → stay on landing to start wizard
  const handleGetStarted = () => {
    if (mode === 'advanced') {
      setWizardMode('expert');
      router.push('/vaults/create');
      return;
    }

    if (!selectedGoal) {
      return;
    }

    setGoal(selectedGoal);
    setWizardMode('simple');
    router.push('/setup');
  };

  return (
    <div
      className="relative min-h-screen flex flex-col"
      style={{ background: 'var(--bg)' }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-8 py-5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {/* Wordmark */}
        <VaultiaLogoLink height={32} />

        <div className="flex items-center gap-2">
          {/* Language pill group */}
          <div
            className="flex items-center gap-0.5 rounded p-0.5"
            style={{ background: 'var(--inactive)', border: '1px solid var(--border)' }}
          >
            {(['en', 'es'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                style={{
                  fontSize: '0.7rem', fontWeight: locale === l ? 400 : 300,
                  letterSpacing: '0.07em', textTransform: 'uppercase',
                  padding: '4px 10px', borderRadius: 4, transition: 'all 0.15s',
                  background: locale === l ? 'var(--text)' : 'transparent',
                  color: locale === l ? 'var(--bg)' : 'var(--text-muted)',
                  cursor: 'pointer', border: 'none',
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center p-1.5 rounded transition-opacity hover:opacity-50"
            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            aria-label={t('settings.theme.toggle')}
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

          <button
            onClick={() => router.push('/settings')}
            className="flex items-center justify-center p-1.5 rounded transition-opacity hover:opacity-50"
            style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            aria-label={t('nav.settings')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-20 text-center">
        {/* 7-dot node mark */}
        <div style={{ display: 'flex', gap: 7, marginBottom: 28 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <span
              key={i}
              className="animate-landing-dot"
              style={{
                width: 7, height: 7, borderRadius: '50%',
                background: 'transparent',
                border: '1px solid var(--text-muted)',
                animationDelay: `${i * 180}ms`,
              }}
            />
          ))}
        </div>

        {/* Headline — two sentences arrive sequentially */}
        <div className="max-w-xl mx-auto mb-10">
          <p style={{ fontSize: 'clamp(1.8rem, 3.6vw, 2.34rem)', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.01em', lineHeight: 1.5 }}>
            {t('landing.subtitle').split('. ').map((part, i, arr) => (
              <span
                key={i}
                className="animate-tagline"
                style={{
                  display: 'block',
                  '--tagline-delay': `${0.3 + i * 0.55}s`,
                } as React.CSSProperties}
              >
                {i < arr.length - 1 ? part + '.' : part}
              </span>
            ))}
          </p>
        </div>

        {/* Goal cards 2×2 */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-lg mb-10">
          {(['pay_people', 'pay_vendors', 'subscriptions', 'save_funds'] as GoalKey[]).map((g) => (
            <GoalCard
              key={g}
              goalKey={g}
              selected={g === 'save_funds' ? false : selectedGoal === g}
              comingSoon={g === 'save_funds'}
              onSelect={() => setSelectedGoal((prev) => (prev === g ? null : g))}
            />
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={handleGetStarted}
          disabled={mode === 'simple' && !selectedGoal}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: (mode === 'simple' && !selectedGoal) ? 'var(--inactive)' : 'var(--text)',
            color: (mode === 'simple' && !selectedGoal) ? 'var(--text-muted)' : 'var(--bg)',
            border: 'none', borderRadius: 6, padding: '12px 32px',
            fontSize: '0.8rem', fontWeight: 400, letterSpacing: '0.12em',
            textTransform: 'uppercase',
            cursor: (mode === 'simple' && !selectedGoal) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s', marginBottom: 16,
          }}
        >
          {t('landing.cta')}
          <span style={{ fontSize: 12, opacity: 0.7 }}>→</span>
        </button>

        {/* Already connected? */}
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          <span>{t('landing.already_have')}</span>
          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) =>
              mounted ? (
                <button
                  onClick={() => {
                    userInitiatedConnect.current = true;
                    openConnectModal();
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10B981', fontWeight: 400, fontSize: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}
                >
                  {t('landing.connect_existing')}
                </button>
              ) : null
            }
          </ConnectButton.Custom>
        </div>

        <button
          onClick={() => setShowSkill(true)}
          className="mt-5 inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs uppercase tracking-[0.14em] transition-opacity hover:opacity-85"
          style={{ color: 'var(--text)', border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}
        >
          {t('landing.agent_cta')}
        </button>

        <p className="mt-10 text-xs max-w-xs" style={{ color: 'var(--text-muted)', opacity: 0.65, fontWeight: 300, letterSpacing: '0.03em' }}>
          {t('landing.trust_message')}
        </p>
      </main>

      <SiteFooter />

      {showSkill && <SkillOverlay onClose={() => setShowSkill(false)} />}
    </div>
  );
}

