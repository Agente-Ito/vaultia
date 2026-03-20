'use client';

import React, { useState, useCallback } from 'react';
import { useI18n } from '@/context/I18nContext';

interface RecipientFieldProps {
  recipients: string[];
  onAdd: (addr: string) => void;
  onRemove: (addr: string) => void;
}

export function RecipientField({ recipients, onAdd, onRemove }: RecipientFieldProps) {
  const { t } = useI18n();
  const [input, setInput] = useState('');

  const handleAdd = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setInput('');
  }, [input, onAdd]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('wizard.limits.recipients_placeholder')}
          className="flex-1 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!input.trim()}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: 'var(--primary)' }}
        >
          +
        </button>
      </div>

      {recipients.length > 0 && (
        <ul className="space-y-1.5">
          {recipients.map((r) => (
            <li
              key={r}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-mono"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              {/* Node dot */}
              <span className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse-node"
                  style={{ background: 'var(--accent)' }}
                />
                <span className="truncate max-w-[240px]" style={{ color: 'var(--text)' }}>
                  {r.length > 30 ? `${r.slice(0, 10)}…${r.slice(-8)}` : r}
                </span>
              </span>
              <button
                onClick={() => onRemove(r)}
                className="ml-2 flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--blocked)' }}
                aria-label="Remove"
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
