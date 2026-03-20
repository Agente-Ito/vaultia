'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useWeb3 } from '@/context/Web3Context';
import { useOnboarding } from '@/context/OnboardingContext';
import { useMode } from '@/context/ModeContext';
import { useI18n } from '@/context/I18nContext';
import { useVaults } from '@/hooks/useVaults';
import { cn } from '@/lib/utils/cn';

// ─── Particle field (CSS-only static dots) ────────────────────────────────────

const PARTICLES = Array.from({ length: 48 }, (_, i) => ({
  x: (Math.sin(i * 1.618) * 0.5 + 0.5) * 100,
  y: (Math.cos(i * 2.399) * 0.5 + 0.5) * 100,
  size: (i % 5 === 0) ? 3 : (i % 3 === 0) ? 2 : 1.5,
  opacity: 0.1 + (i % 7) * 0.04,
  animDelay: `${(i * 0.37) % 4}s`,
  animDuration: `${3 + (i % 4)}s`,
}));

function ParticleField() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full animate-float-slow"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: i % 3 === 0 ? 'var(--accent)' : i % 2 === 0 ? 'var(--primary)' : 'var(--nebula)',
            opacity: p.opacity,
            animationDelay: p.animDelay,
            animationDuration: p.animDuration,
          }}
        />
      ))}
      {/* Connector lines (SVG) */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        {PARTICLES.slice(0, 12).map((p, i) => {
          const next = PARTICLES[(i + 3) % 12];
          return (
            <line
              key={i}
              x1={`${p.x}%`} y1={`${p.y}%`}
              x2={`${next.x}%`} y2={`${next.y}%`}
              stroke="var(--accent)"
              strokeWidth="0.5"
              strokeOpacity="0.08"
              strokeDasharray="4 8"
            />
          );
        })}
      </svg>
    </div>
  );
}

// ─── Goal option dots (mini-constellation) ─────────────────────────────────────

function ConstellationIcon({ count }: { count: number }) {
  const pts = Array.from({ length: count }, (_, i) => ({
    cx: 10 + (i % 3) * 12,
    cy: 10 + Math.floor(i / 3) * 12,
  }));
  return (
    <svg width="44" height="36" viewBox="0 0 44 36" aria-hidden="true">
      {pts.map((p, i) => pts.slice(i + 1).map((q, j) => (
        <line
          key={`${i}-${j}`}
          x1={p.cx} y1={p.cy} x2={q.cx} y2={q.cy}
          stroke="var(--accent)" strokeWidth="0.8" strokeOpacity="0.4" strokeDasharray="2 4"
        />
      )))}
      {pts.map((p, i) => (
        <circle key={i} cx={p.cx} cy={p.cy} r={i === 0 ? 3.5 : 2} fill="var(--primary)" opacity="0.85" />
      ))}
    </svg>
  );
}

// ─── Goal card ────────────────────────────────────────────────────────────────

type GoalKey = 'pay_people' | 'pay_vendors' | 'subscriptions' | 'save_funds';

const GOAL_DOTS: Record<GoalKey, number> = {
  pay_people:    3,
  pay_vendors:   4,
  subscriptions: 5,
  save_funds:    6,
};

function GoalCard({
  goalKey,
  selected,
  onSelect,
}: {
  goalKey: GoalKey;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      onClick={onSelect}
      className={cn(
        'relative text-left rounded-2xl px-4 py-4 transition-all duration-200 focus:outline-none group',
        selected ? 'ring-2' : 'opacity-70 hover:opacity-90'
      )}
      style={{
        background: selected
          ? 'linear-gradient(135deg, rgba(123,97,255,0.2) 0%, rgba(60,242,255,0.08) 100%)'
          : 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: selected ? '0 0 0 2px var(--accent)' : 'none',
      }}
    >
      <ConstellationIcon count={GOAL_DOTS[goalKey]} />
      <p className="text-sm font-semibold mt-2" style={{ color: 'var(--text)' }}>
        {t(`wizard.goal.${goalKey}` as Parameters<typeof t>[0])}
      </p>
      <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
        {t(`wizard.goal.${goalKey}_desc` as Parameters<typeof t>[0])}
      </p>
      {selected && (
        <span
          className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          ✓
        </span>
      )}
    </button>
  );
}

// ─── Landing page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const { account, isConnected, registry } = useWeb3();
  const { open: openOnboarding, setGoal, setWizardMode } = useOnboarding();
  const { mode, setMode } = useMode();
  const { t } = useI18n();
  const { vaults, loading: vaultsLoading } = useVaults(registry, account);

  const [selectedGoal, setSelectedGoal] = React.useState<GoalKey | null>(null);

  // If already connected with vaults → go to dashboard
  useEffect(() => {
    if (isConnected && !vaultsLoading && vaults.length > 0) {
      router.replace('/dashboard');
    }
  }, [isConnected, vaultsLoading, vaults.length, router]);

  // If connected but no vaults → stay on landing to start wizard
  const handleGetStarted = () => {
    if (selectedGoal) {
      setGoal(selectedGoal);
    }
    setWizardMode(mode === 'advanced' ? 'expert' : 'simple');
    openOnboarding();
  };

  return (
    <div
      className="relative min-h-screen flex flex-col"
      style={{ background: 'var(--bg)' }}
    >
      <ParticleField />

      {/* Top bar: logo + mode toggle + language */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white text-sm animate-glow-pulse"
            style={{ background: 'linear-gradient(135deg, #7B61FF, #3CF2FF)' }}
          >
            V
          </div>
          <span className="font-bold text-lg" style={{ color: 'var(--text)' }}>
            {t('nav.app_name_vaultia')}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Mode toggle */}
          <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: 'var(--card)' }}>
            {(['simple', 'advanced'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all duration-150',
                  mode === m ? '' : 'opacity-50 hover:opacity-70'
                )}
                style={mode === m
                  ? { background: 'var(--primary)', color: '#fff' }
                  : { color: 'var(--text-muted)' }
                }
              >
                {t(m === 'simple' ? 'wizard.mode.simple' : 'wizard.mode.expert')}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-20 text-center">
        {/* Headline */}
        <div className="max-w-2xl mx-auto mb-10">
          <h1
            className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-4"
            style={{ color: 'var(--text)' }}
          >
            {t('landing.title')}
          </h1>
          <p className="text-lg sm:text-xl" style={{ color: 'var(--text-muted)' }}>
            {t('landing.subtitle')}
          </p>
        </div>

        {/* Goal cards 2×2 */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-lg mb-10">
          {(['pay_people', 'pay_vendors', 'subscriptions', 'save_funds'] as GoalKey[]).map((g) => (
            <GoalCard
              key={g}
              goalKey={g}
              selected={selectedGoal === g}
              onSelect={() => setSelectedGoal((prev) => (prev === g ? null : g))}
            />
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={handleGetStarted}
          className="vaultia-btn-primary text-base px-10 py-3 mb-4 animate-glow-pulse"
          style={{ animationDuration: '3s' }}
        >
          {t('landing.cta')} →
        </button>

        {/* Already connected? */}
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          <span>{t('landing.already_have')}</span>
          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) =>
              mounted ? (
                <button
                  onClick={() => {
                    openConnectModal();
                  }}
                  className="underline underline-offset-2 transition-opacity hover:opacity-70"
                  style={{ color: 'var(--accent)' }}
                >
                  {t('landing.connect_existing')}
                </button>
              ) : null
            }
          </ConnectButton.Custom>
        </div>

        {/* Trust message */}
        <p className="mt-8 text-xs max-w-sm" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
          {t('landing.trust_message')}
        </p>
      </main>
    </div>
  );
}

