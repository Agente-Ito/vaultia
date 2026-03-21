'use client';

import React, { useState, useCallback } from 'react';
import { useI18n } from '@/context/I18nContext';
import type { RecipientEntry } from '@/context/OnboardingContext';
import { normalizeRecipient, validateRecipient } from '@/lib/web3/deployVault';
import { ProfilePicker } from '@/components/profiles/ProfilePicker';
import { AddressDisplay } from '@/components/common/AddressDisplay';

interface RecipientFieldProps {
  recipients: RecipientEntry[];
  onAdd: (recipient: RecipientEntry) => void;
  onRemove: (address: string) => void;
  placeholder?: string;
}

export function RecipientField({ recipients, onAdd, onRemove, placeholder }: RecipientFieldProps) {
  const { t } = useI18n();
  const [label, setLabel] = useState('');
  const [input, setInput] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleAdd = useCallback(() => {
    const trimmed = input.trim();
    const recipientError = validateRecipient(trimmed);
    if (recipientError === 'empty') {
      setErrorKey(null);
      return;
    }
    if (recipientError) {
      setErrorKey(`wizard.limits.error.${recipientError}`);
      return;
    }

    const normalized = normalizeRecipient(trimmed);
    if (recipients.some((recipient) => recipient.address.toLowerCase() === normalized.toLowerCase())) {
      setErrorKey('wizard.limits.error.duplicate_address');
      return;
    }

    onAdd({
      address: normalized,
      label: label.trim() || undefined,
    });
    setLabel('');
    setInput('');
    setErrorKey(null);
  }, [input, label, onAdd, recipients]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
  };

  const handlePickerConfirm = useCallback((addresses: string[]) => {
    for (const addr of addresses) {
      if (validateRecipient(addr)) continue;
      const normalized = normalizeRecipient(addr);
      if (recipients.some((r) => r.address.toLowerCase() === normalized.toLowerCase())) continue;
      onAdd({ address: normalized });
    }
  }, [recipients, onAdd]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {recipients.length > 0 ? `${recipients.length} added` : ''}
        </span>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="text-xs font-medium transition-opacity hover:opacity-80"
          style={{ color: 'var(--accent)' }}
        >
          👤 {t('wizard.limits.from_profiles')}
        </button>
      </div>

      <ProfilePicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={handlePickerConfirm}
        mode="merchants"
        preSelected={recipients.map((r) => r.address)}
      />

      <div className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('wizard.limits.recipient_label_placeholder')}
          className="rounded-xl px-3 py-2.5 text-sm focus:outline-none"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
        />
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (errorKey) setErrorKey(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? t('wizard.limits.recipients_placeholder')}
          className="flex-1 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
          style={{
            background: 'var(--card)',
            border: `1px solid ${errorKey ? 'var(--blocked)' : 'var(--border)'}`,
            color: 'var(--text)',
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!input.trim()}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: 'var(--primary)' }}
          aria-label={t('wizard.limits.add_recipient')}
        >
          +
        </button>
      </div>

      {errorKey && (
        <p className="text-xs" style={{ color: 'var(--blocked)' }}>
          {t(errorKey as Parameters<typeof t>[0])}
        </p>
      )}

      {recipients.length > 0 && (
        <ul className="space-y-1.5">
          {recipients.map((recipient) => (
            <li
              key={recipient.address}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-mono"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <span className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse-node"
                  style={{ background: 'var(--accent)' }}
                />
                <span className="min-w-0">
                  {recipient.label && (
                    <span className="block truncate max-w-[240px] font-semibold not-italic" style={{ color: 'var(--text)' }}>
                      {recipient.label}
                    </span>
                  )}
                  <AddressDisplay
                    address={recipient.address}
                    className="block truncate max-w-[240px]"
                    mono={false}
                    showResolvedIndicator={false}
                  />
                </span>
              </span>
              <button
                onClick={() => onRemove(recipient.address)}
                className="ml-2 flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--blocked)' }}
                aria-label={t('wizard.limits.remove_recipient')}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
