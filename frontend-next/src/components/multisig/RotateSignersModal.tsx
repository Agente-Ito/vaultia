'use client';

import { useState } from 'react';
import { ethers } from 'ethers';
import { useI18n } from '@/context/I18nContext';
import { useMultisigActions } from '@/hooks/useMultisigActions';
import type { MultisigInfo } from '@/hooks/useMultisigController';
import { AddressDisplay } from '@/components/common/AddressDisplay';

const inputClass = 'w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none';
const inputStyle = {
  background: 'var(--card-mid)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
};

interface Props {
  multisigAddress: string;
  info: MultisigInfo;
  onClose: () => void;
  onSuccess: (proposalId: string) => void;
}

export default function RotateSignersModal({ multisigAddress, info, onClose, onSuccess }: Props) {
  const { t } = useI18n();
  const actions = useMultisigActions(multisigAddress);

  const [signersRaw, setSignersRaw] = useState(info.signers.join(', '));
  const [threshold, setThreshold]   = useState(String(info.threshold));
  const [timelockOverride, setTimelockOverride] = useState('0');
  const [deadlineHours, setDeadlineHours]       = useState('72');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const newSigners = signersRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (newSigners.length === 0) {
      setError(t('multisig.rotate.error.empty_signers'));
      return;
    }
    for (const addr of newSigners) {
      if (!ethers.isAddress(addr)) {
        setError(t('multisig.rotate.error.invalid_address').replace('{addr}', addr));
        return;
      }
    }

    const newThreshold = parseInt(threshold, 10);
    if (!newThreshold || newThreshold < 1 || newThreshold > newSigners.length) {
      setError(t('multisig.rotate.error.invalid_threshold'));
      return;
    }

    const id = await actions.rotateSigners(
      newSigners,
      newThreshold,
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
        className="w-full max-w-lg rounded-2xl p-6 space-y-5 overflow-y-auto max-h-[90vh]"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              {t('multisig.rotate.title')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.rotate.subtitle')}
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

        {/* Current signers (read-only) */}
        <div
          className="rounded-xl p-3 space-y-1"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {t('multisig.rotate.current_signers')}
          </p>
          {info.signers.map((s) => (
            <p key={s} className="text-xs font-mono" style={{ color: 'var(--text)' }}>
              <AddressDisplay address={s} />
            </p>
          ))}
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('multisig.rotate.current_threshold')}: {info.threshold}
          </p>
        </div>

        {/* Security note */}
        <div
          className="rounded-xl px-3 py-2.5 text-xs"
          style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--text-muted)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}
        >
          {t('multisig.rotate.security_note')}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New signers */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.rotate.field.new_signers')}
            </label>
            <textarea
              className={`${inputClass} font-mono resize-none`}
              style={{ ...inputStyle, minHeight: '80px' }}
              value={signersRaw}
              onChange={(e) => setSignersRaw(e.target.value)}
              placeholder="0x1234…, 0x5678…"
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.rotate.field.new_signers_hint')}
            </p>
          </div>

          {/* New threshold */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.rotate.field.new_threshold')}
            </label>
            <input
              className={inputClass}
              style={inputStyle}
              type="number"
              min="1"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </div>

          {/* Timelock override */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.rotate.field.timelock_override')}
            </label>
            <input
              className={inputClass}
              style={inputStyle}
              type="number"
              min="0"
              value={timelockOverride}
              onChange={(e) => setTimelockOverride(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.rotate.field.timelock_hint')}
            </p>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.rotate.field.deadline_hours')}
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

          {error && (
            <p className="text-xs" style={{ color: 'var(--blocked)' }}>{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: 'var(--card-mid)', color: 'var(--text-muted)' }}
            >
              {t('multisig.rotate.btn.cancel')}
            </button>
            <button
              type="submit"
              disabled={actions.pending === 'rotateSigners'}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--primary)', color: 'var(--primary-fg)', opacity: actions.pending === 'rotateSigners' ? 0.6 : 1 }}
            >
              {actions.pending === 'rotateSigners'
                ? t('multisig.rotate.btn.proposing')
                : t('multisig.rotate.btn.propose')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
