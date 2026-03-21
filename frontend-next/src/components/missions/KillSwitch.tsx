'use client';

import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { useI18n } from '@/context/I18nContext';

interface KillSwitchProps {
  missionLabel: string;
  disabled?: boolean;
  onConfirm: () => Promise<void>;
}

export function KillSwitch({ missionLabel, disabled, onConfirm }: KillSwitchProps) {
  const { t } = useI18n();
  const [showConfirm, setShowConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const handleConfirm = async () => {
    setRevoking(true);
    try {
      await onConfirm();
    } finally {
      setRevoking(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      {/* Kill switch button */}
      <Button
        variant="danger"
        size="sm"
        disabled={disabled || revoking}
        onClick={() => setShowConfirm(true)}
      >
        ☠️ {t('missions.kill_switch')}
      </Button>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl shadow-xl border p-6 space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">
                {t('missions.kill_switch')}
              </h2>
              <p className="text-sm" style={{ color: 'var(--text)' }}>
                {t('missions.kill_switch_confirm')}
              </p>
              <p className="text-xs font-medium px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded text-red-700 dark:text-red-300">
                {missionLabel}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('missions.kill_switch_desc')}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => setShowConfirm(false)}
                disabled={revoking}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                size="md"
                className="flex-1"
                onClick={handleConfirm}
                disabled={revoking}
              >
                {revoking ? 'Revoking…' : 'Yes, revoke'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
