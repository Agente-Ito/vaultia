'use client';

import React from 'react';
import { useI18n } from '@/context/I18nContext';
import type { GoalKey } from '@/context/OnboardingContext';
import { cn } from '@/lib/utils/cn';

// Yields is a coming-soon goal, kept as a separate string literal outside GoalKey
type ExtendedGoalKey = GoalKey | 'yields';

// Minimal geometric icons for each goal
function GoalIcon({ goalKey, color }: { goalKey: ExtendedGoalKey; color: string }) {
  const sw = '1.2';
  const icons: Record<ExtendedGoalKey, React.ReactNode> = {
    pay_people: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
        <circle cx="9" cy="7" r="3" /><path d="M3 20c0-4 2.7-7 6-7h2" />
        <circle cx="17" cy="14" r="2.5" /><path d="M17 19v-1m0-8v1" />
      </svg>
    ),
    pay_vendors: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
        <rect x="4" y="8" width="16" height="12" rx="1.5" />
        <path d="M8 8V6a4 4 0 0 1 8 0v2M9 14h6M12 14v3" />
      </svg>
    ),
    subscriptions: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
        <path d="M4 12h16M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3" />
        <circle cx="12" cy="12" r="1.5" fill={color} />
      </svg>
    ),
    save_funds: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
        <path d="M12 3 L20 9 L20 20 L4 20 L4 9 Z" />
        <path d="M9 20v-6h6v6" /><line x1="12" y1="3" x2="12" y2="9" />
      </svg>
    ),
    payroll: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
        <rect x="3" y="6" width="18" height="13" rx="1.5" />
        <path d="M3 10h18M7 14h2M13 14h4" />
      </svg>
    ),
    grants: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
    treasury_rebalance: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
        <path d="M4 7h16M4 12h10M4 17h7" />
        <path d="M18 14l3 3-3 3" />
      </svg>
    ),
    tax_reserve: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
        <path d="M4 4h16v4H4zM4 8v12l8 0 8-12" />
      </svg>
    ),
    yields: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="14 7 21 7 21 14" />
      </svg>
    ),
  };
  return <>{icons[goalKey] ?? null}</>;
}

interface GoalCardProps {
  goalKey: ExtendedGoalKey;
  selected: boolean;
  onSelect: () => void;
  comingSoon?: boolean;
}

export function GoalCard({ goalKey, selected, onSelect, comingSoon = false }: GoalCardProps) {
  const { t } = useI18n();

  const titleKey = `wizard.goal.${goalKey}` as Parameters<typeof t>[0];
  const descKey  = `wizard.goal.${goalKey}_desc` as Parameters<typeof t>[0];

  return (
    <button
      onClick={comingSoon ? undefined : onSelect}
      disabled={comingSoon}
      aria-disabled={comingSoon}
      className={cn(
        'relative text-left rounded-xl px-4 py-4 transition-all duration-200 focus:outline-none w-full',
        comingSoon ? 'cursor-default opacity-55' : 'cursor-pointer',
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
      <span style={{ display: 'block', marginBottom: 8 }}>
        <GoalIcon
          goalKey={goalKey}
          color={selected ? '#10B981' : comingSoon ? '#AEAEB2' : '#6B7280'}
        />
      </span>
      <p className="text-sm" style={{ fontWeight: 400, letterSpacing: '0.04em', color: comingSoon ? 'var(--text-muted)' : 'var(--text)' }}>
        {t(titleKey)}
      </p>
      <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)', fontWeight: 300 }}>
        {t(descKey)}
      </p>

      {/* Selected dot indicator */}
      {selected && !comingSoon && (
        <span
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 7, height: 7, borderRadius: '50%',
            background: '#10B981', boxShadow: '0 0 6px rgba(16,185,129,0.5)',
          }}
        />
      )}

      {/* Coming soon badge */}
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
