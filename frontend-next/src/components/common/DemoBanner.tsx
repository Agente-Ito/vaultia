'use client';

import React from 'react';
import { useDemo } from '@/context/DemoContext';
import { useI18n } from '@/context/I18nContext';

export function DemoBanner() {
  const { isDemo, disableDemo } = useDemo();
  const { t } = useI18n();

  if (!isDemo) return null;

  return (
    <div className="bg-amber-400 text-amber-900 px-4 py-2 flex items-center justify-between text-sm font-medium">
      <div className="flex items-center gap-2">
        <span>🎮</span>
        <span>{t('demo.banner_text')}</span>
      </div>
      <button
        onClick={disableDemo}
        className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-900/20 hover:bg-amber-900/30 transition-colors text-xs font-semibold"
      >
        {t('demo.exit')}
      </button>
    </div>
  );
}
