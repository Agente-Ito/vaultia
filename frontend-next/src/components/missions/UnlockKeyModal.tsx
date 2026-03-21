'use client';

import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { useI18n } from '@/context/I18nContext';

interface UnlockKeyModalProps {
  missionLabel: string;
  onUnlock: (passphrase: string) => Promise<boolean>;
  onCancel: () => void;
  error?: string | null;
  unlocking?: boolean;
}

export function UnlockKeyModal({
  missionLabel,
  onUnlock,
  onCancel,
  error,
  unlocking,
}: UnlockKeyModalProps) {
  const { t } = useI18n();
  const [passphrase, setPassphrase] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim()) return;
    await onUnlock(passphrase);
  };

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl shadow-xl border p-6 space-y-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
            {t('missions.unlock_title')}
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('missions.unlock_desc')}
          </p>
          <p className="text-xs font-medium rounded px-2 py-1 w-fit" style={{ color: 'var(--accent)', backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)' }}>
            {missionLabel}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
              {t('missions.create.passphrase_label')}
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={t('missions.unlock_placeholder')}
              autoFocus
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              style={{ borderColor: 'var(--border)', background: 'var(--card-mid)', color: 'var(--text)' }}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          {/* Trust copy */}
          <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <span>{t('missions.trust_copy')}</span>
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={onCancel}
              disabled={unlocking}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="flex-1"
              disabled={!passphrase.trim() || unlocking}
            >
              {unlocking ? '…' : t('missions.unlock_cta')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
