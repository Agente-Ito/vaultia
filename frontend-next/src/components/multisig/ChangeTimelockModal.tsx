'use client';

import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useMultisigActions } from '@/hooks/useMultisigActions';
import type { MultisigInfo } from '@/hooks/useMultisigController';

const inputClass = 'w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none';
const inputStyle = {
  background: 'var(--card-mid)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
};

// Common delay presets in seconds
const PRESETS = [
  { label: 'None', value: 0 },
  { label: '1h', value: 3600 },
  { label: '6h', value: 21600 },
  { label: '24h', value: 86400 },
  { label: '48h', value: 172800 },
];

interface Props {
  multisigAddress: string;
  info: MultisigInfo;
  onClose: () => void;
  onSuccess: (proposalId: string) => void;
}

export default function ChangeTimelockModal({ multisigAddress, info, onClose, onSuccess }: Props) {
  const { t } = useI18n();
  const actions = useMultisigActions(multisigAddress);

  const currentHours = info.timeLock > 0 ? Math.round(info.timeLock / 3600) : 0;

  const [delaySecs, setDelaySecs] = useState(String(info.timeLock));
  const [timelockOverride, setTimelockOverride] = useState('0');
  const [deadlineHours, setDeadlineHours] = useState('72');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const newDelay = parseInt(delaySecs, 10);
    if (isNaN(newDelay) || newDelay < 0) {
      setError(t('multisig.timelock.error.invalid_delay'));
      return;
    }

    const id = await actions.changeTimelock(
      newDelay,
      parseInt(timelockOverride, 10) || 0,
      parseInt(deadlineHours, 10) || 72,
    );

    if (id) {
      onSuccess(id);
    } else if (actions.error) {
      setError(actions.error);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-5 overflow-y-auto max-h-[90vh]"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              {t('multisig.timelock.title')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.timelock.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-2 py-1 rounded-lg"
            style={{ color: 'var(--text-muted)', background: 'var(--card-mid)' }}
          >
            ✕
          </button>
        </div>

        {/* Current timelock */}
        <div
          className="rounded-xl p-3"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {t('multisig.timelock.current')}
          </p>
          <p className="text-sm font-mono mt-0.5" style={{ color: 'var(--text)' }}>
            {info.timeLock === 0 ? t('multisig.timelock.none') : `${currentHours}h (${info.timeLock}s)`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Presets */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.timelock.presets')}
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setDelaySecs(String(p.value))}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                  style={{
                    background: delaySecs === String(p.value) ? 'var(--primary)' : 'var(--card-mid)',
                    color: delaySecs === String(p.value) ? '#fff' : 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom delay */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.timelock.delay_label')}
            </label>
            <input
              className={inputClass}
              style={inputStyle}
              type="number"
              min="0"
              value={delaySecs}
              onChange={(e) => setDelaySecs(e.target.value)}
              placeholder="0"
            />
            {delaySecs && parseInt(delaySecs, 10) > 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                ≈ {Math.round(parseInt(delaySecs, 10) / 3600 * 10) / 10}h
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                {t('multisig.propose.field.timelock_override')}
              </label>
              <input
                className={inputClass}
                style={inputStyle}
                type="number"
                min="0"
                value={timelockOverride}
                onChange={(e) => setTimelockOverride(e.target.value)}
                placeholder="0 = global"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Deadline (hours)
              </label>
              <input
                className={inputClass}
                style={inputStyle}
                type="number"
                min="1"
                value={deadlineHours}
                onChange={(e) => setDeadlineHours(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs" style={{ color: 'var(--blocked)' }}>{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'var(--card-mid)', color: 'var(--text-muted)' }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={actions.pending === 'changeTimelock'}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
            >
              {actions.pending === 'changeTimelock' ? '…' : t('multisig.timelock.btn_propose')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
