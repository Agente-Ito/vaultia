'use client';

import { useState } from 'react';
import { ethers } from 'ethers';
import { useI18n } from '@/context/I18nContext';

export interface MultisigConfig {
  signers: string[];
  threshold: number;
  timelockHours: number;
  executorMode: 'any_signer' | 'only_owner';
}

const TIMELOCK_PRESETS = [
  { value: 0, labelKey: 'create.controller.multisig.timelock.none' as const },
  { value: 1, labelKey: 'create.controller.multisig.timelock.1h' as const },
  { value: 12, labelKey: 'create.controller.multisig.timelock.12h' as const },
  { value: 24, labelKey: 'create.controller.multisig.timelock.24h' as const },
  { value: 72, labelKey: 'create.controller.multisig.timelock.3d' as const },
];

interface Props {
  value: MultisigConfig;
  onChange: (cfg: MultisigConfig) => void;
  /** Raw comma-separated string as the user types it */
  rawSigners: string;
  onRawSignersChange: (raw: string) => void;
  errors?: {
    signers?: string | null;
    threshold?: string | null;
  };
}

const inputClass = 'w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none';
const inputStyle = {
  background: 'var(--card-mid)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-xs font-semibold uppercase tracking-widest mb-1.5"
      style={{ color: 'var(--text-muted)' }}
    >
      {children}
    </label>
  );
}

function FieldError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <p className="text-xs mt-1" style={{ color: 'var(--blocked)' }}>{message}</p>;
}

/**
 * Parses a comma-separated address list.
 * Returns deduplicated valid addresses and an optional error string.
 */
export function parseSignerList(raw: string): { signers: string[]; error: string | null } {
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const signers: string[] = [];
  for (const p of parts) {
    if (!ethers.isAddress(p)) return { signers: [], error: `Invalid address: ${p}` };
    const norm = ethers.getAddress(p);
    if (!seen.has(norm)) { seen.add(norm); signers.push(norm); }
  }
  return { signers, error: null };
}

export default function MultisigConfigForm({
  value,
  onChange,
  rawSigners,
  onRawSignersChange,
  errors,
}: Props) {
  const { t } = useI18n();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleSignersBlur = () => {
    const { signers } = parseSignerList(rawSigners);
    // Clamp threshold if more restrictive now
    const clampedThreshold = Math.min(
      value.threshold || 1,
      signers.length || 1,
    );
    onChange({ ...value, signers, threshold: clampedThreshold });
  };

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    onChange({ ...value, threshold: isNaN(v) ? 1 : v });
  };

  return (
    <div className="space-y-5 pt-1">
      {/* Signers */}
      <div>
        <FieldLabel>{t('create.controller.multisig.signers.label')}</FieldLabel>
        <textarea
          className={inputClass}
          style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
          value={rawSigners}
          onChange={(e) => onRawSignersChange(e.target.value)}
          onBlur={handleSignersBlur}
          placeholder={t('create.controller.multisig.signers.placeholder')}
        />
        <FieldError message={errors?.signers} />
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {t('create.controller.multisig.signers.hint')}
        </p>
        {value.signers.length > 0 && (
          <p className="text-xs mt-1 font-medium" style={{ color: 'var(--accent)' }}>
            {value.signers.length} signer{value.signers.length !== 1 ? 's' : ''} detected
          </p>
        )}
      </div>

      {/* Threshold + Timelock side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel>{t('create.controller.multisig.threshold.label')}</FieldLabel>
          <input
            className={inputClass}
            style={{
              ...inputStyle,
              borderColor: errors?.threshold ? 'var(--blocked)' : 'var(--border)',
            }}
            type="number"
            min={1}
            max={value.signers.length || undefined}
            value={value.threshold || ''}
            onChange={handleThresholdChange}
            placeholder={t('create.controller.multisig.threshold.placeholder')}
          />
          <FieldError message={errors?.threshold} />
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {t('create.controller.multisig.threshold.hint')}
          </p>
        </div>

        <div>
          <FieldLabel>{t('create.controller.multisig.timelock.label')}</FieldLabel>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {TIMELOCK_PRESETS.map(({ value: presetVal, labelKey }) => (
              <button
                key={presetVal}
                type="button"
                onClick={() => onChange({ ...value, timelockHours: presetVal })}
                className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                style={{
                  background: value.timelockHours === presetVal ? 'var(--card-mid)' : 'var(--bg)',
                  border: `1px solid ${value.timelockHours === presetVal ? 'var(--accent)' : 'var(--border)'}`,
                  color: value.timelockHours === presetVal ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            {t('create.controller.multisig.timelock.hint')}
          </p>
        </div>
      </div>

      {/* Summary badge */}
      {value.signers.length > 0 && value.threshold > 0 && (
        <div
          className="rounded-xl px-4 py-2.5 text-xs"
          style={{
            background: 'rgba(34,255,178,0.07)',
            border: '1px solid rgba(34,255,178,0.2)',
            color: 'var(--text-muted)',
          }}
        >
          Requires{' '}
          <strong style={{ color: 'var(--accent)' }}>{value.threshold}</strong>
          {' '}of{' '}
          <strong style={{ color: 'var(--accent)' }}>{value.signers.length}</strong>
          {' '}approval{value.threshold !== 1 ? 's' : ''} to execute
          {value.timelockHours > 0 && (
            <> · <strong style={{ color: 'var(--accent)' }}>{value.timelockHours}h</strong> timelock after quorum</>
          )}
        </div>
      )}

      {/* Advanced options */}
      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
          style={{ color: 'var(--text-muted)' }}
        >
          <span
            className="inline-block transition-transform duration-200"
            style={{ transform: advancedOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >▶</span>
          {t('create.controller.multisig.executor.advanced_toggle')}
        </button>

        {advancedOpen && (
          <div className="mt-3 rounded-xl p-4 space-y-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
              {t('create.controller.multisig.executor.label')}
            </p>
            {(['any_signer', 'only_owner'] as const).map((mode) => {
              const isActive = value.executorMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChange({ ...value, executorMode: mode })}
                  className="w-full rounded-xl p-3 text-left transition-all"
                  style={{
                    background: isActive ? 'var(--card-mid)' : 'transparent',
                    border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                      {t(mode === 'any_signer'
                        ? 'create.controller.multisig.executor.any_signer_label'
                        : 'create.controller.multisig.executor.only_owner_label')}
                    </p>
                    {mode === 'any_signer' && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: 'rgba(34,255,178,0.15)', color: 'var(--success)', fontSize: '10px' }}
                      >
                        {t('create.controller.multisig.executor.default_badge')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t(mode === 'any_signer'
                      ? 'create.controller.multisig.executor.any_signer_desc'
                      : 'create.controller.multisig.executor.only_owner_desc')}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
