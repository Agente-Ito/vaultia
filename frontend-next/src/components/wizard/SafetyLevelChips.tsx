'use client';

import React from 'react';
import { useI18n } from '@/context/I18nContext';
import type { SafetyLevel } from '@/context/OnboardingContext';
import { cn } from '@/lib/utils/cn';

interface SafetyLevelChipsProps {
  value: SafetyLevel;
  onChange: (v: SafetyLevel) => void;
}

const LEVELS: { key: SafetyLevel; color: string }[] = [
  { key: 'safe',     color: 'var(--success)' },
  { key: 'flexible', color: 'var(--accent)' },
  { key: 'advanced', color: 'var(--blocked)' },
];

export function SafetyLevelChips({ value, onChange }: SafetyLevelChipsProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-2">
      {LEVELS.map(({ key, color }) => {
        const active = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              'w-full flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-all duration-150 focus:outline-none',
              active ? '' : 'opacity-60 hover:opacity-80'
            )}
            style={{
              background: active ? 'var(--card-mid)' : 'var(--card)',
              border: `1px solid ${active ? color : 'var(--border)'}`,
              boxShadow: active ? `0 0 0 1px ${color}` : 'none',
            }}
          >
            <span
              className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0"
              style={{ background: color, opacity: active ? 1 : 0.5 }}
            />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {t(`wizard.automation.safety.${key}` as Parameters<typeof t>[0])}
                {key === 'safe' && (
                  <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded" style={{ background: 'var(--success)', color: '#000' }}>
                    ✓ Recommended
                  </span>
                )}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {t(`wizard.automation.safety.${key}_desc` as Parameters<typeof t>[0])}
              </p>
              {key === 'advanced' && active && (
                <p className="text-xs mt-1 font-medium" style={{ color: 'var(--blocked)' }}>
                  ⚠ {t('wizard.automation.safety.advanced_warn')}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
