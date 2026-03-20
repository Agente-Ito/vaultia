'use client';

import React from 'react';
import { useI18n } from '@/context/I18nContext';
import type { GoalKey } from '@/context/OnboardingContext';
import { cn } from '@/lib/utils/cn';

// Yields is a coming-soon goal, kept as a separate string literal outside GoalKey
type ExtendedGoalKey = GoalKey | 'yields';

const GOAL_DOTS: Record<ExtendedGoalKey, number> = {
  pay_people:          3,
  pay_vendors:         4,
  subscriptions:       5,
  save_funds:          6,
  payroll:             4,
  grants:              3,
  treasury_rebalance:  5,
  tax_reserve:         4,
  yields:              6,
};

function ConstellationIcon({ count, muted = false }: { count: number; muted?: boolean }) {
  const pts = Array.from({ length: count }, (_, i) => ({
    cx: 8 + (i % 3) * 11,
    cy: 8 + Math.floor(i / 3) * 11,
  }));
  return (
    <svg width="40" height="34" viewBox="0 0 40 34" aria-hidden="true">
      {pts.map((p, i) =>
        pts.slice(i + 1).map((q, j) => (
          <line
            key={`${i}-${j}`}
            x1={p.cx} y1={p.cy} x2={q.cx} y2={q.cy}
            stroke={muted ? 'var(--text-muted)' : 'var(--accent)'}
            strokeWidth="0.8"
            strokeOpacity="0.4"
            strokeDasharray="2 4"
          />
        ))
      )}
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.cx} cy={p.cy}
          r={i === 0 ? 3.5 : 2}
          fill={muted ? 'var(--text-muted)' : 'var(--primary)'}
          opacity={muted ? 0.4 : 0.85}
        />
      ))}
    </svg>
  );
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
        'relative text-left rounded-2xl px-4 py-4 transition-all duration-200 focus:outline-none w-full',
        comingSoon
          ? 'cursor-default opacity-70'
          : selected
            ? 'animate-pulse-node'
            : 'opacity-70 hover:opacity-90'
      )}
      style={{
        background: selected
          ? 'linear-gradient(135deg, rgba(123,97,255,0.2) 0%, rgba(60,242,255,0.08) 100%)'
          : 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: selected ? '0 0 0 2px var(--accent)' : 'none',
      }}
    >
      <ConstellationIcon count={GOAL_DOTS[goalKey]} muted={comingSoon} />
      <p className="text-sm font-semibold mt-2" style={{ color: comingSoon ? 'var(--text-muted)' : 'var(--text)' }}>
        {t(titleKey)}
      </p>
      <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
        {t(descKey)}
      </p>

      {/* Selected checkmark */}
      {selected && !comingSoon && (
        <span
          className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          ✓
        </span>
      )}

      {/* Coming soon badge */}
      {comingSoon && (
        <span
          className="absolute top-2.5 right-2.5 text-xs px-2 py-0.5 rounded-full font-semibold"
          style={{ background: 'rgba(255,200,87,0.15)', color: 'var(--warning)', border: '1px solid rgba(255,200,87,0.3)' }}
        >
          {t('wizard.goal.coming_soon')}
        </span>
      )}
    </button>
  );
}
