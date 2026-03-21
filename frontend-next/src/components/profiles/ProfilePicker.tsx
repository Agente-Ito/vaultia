'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useContacts, ContactCategory, CATEGORY_META } from '@/hooks/useContacts';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PickerMode = 'agents' | 'merchants' | 'contacts';

interface ProfilePickerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the addresses the user confirmed */
  onConfirm: (addresses: string[]) => void;
  mode?: PickerMode;
  /** Addresses already in the field — shown as pre-checked */
  preSelected?: string[];
}

// ─── Category filter config ───────────────────────────────────────────────────

const MODE_CATEGORIES: Record<PickerMode, ContactCategory[]> = {
  agents:    ['ai-agent'],
  merchants: ['merchant', 'service'],
  contacts:  ['human', 'ai-agent', 'dao', 'service', 'merchant', 'untagged'],
};

// ─── Mini contact row ─────────────────────────────────────────────────────────

function ContactRow({
  address,
  name,
  avatarUrl,
  category,
  checked,
  onToggle,
}: {
  address: string;
  name?: string;
  avatarUrl?: string;
  category: ContactCategory;
  checked: boolean;
  onToggle: () => void;
}) {
  const meta = CATEGORY_META[category];
  const displayName = name || `${address.slice(0, 8)}…${address.slice(-6)}`;
  const initial = name ? name[0].toUpperCase() : address[2]?.toUpperCase() ?? '?';

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
        checked
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
      )}
    >
      {/* Checkbox */}
      <div className={cn(
        'w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center',
        checked ? 'bg-primary-600 border-primary-600' : 'border-neutral-300 dark:border-neutral-600'
      )}>
        {checked && <span className="text-white text-xs leading-none">✓</span>}
      </div>

      {/* Avatar */}
      <div className="flex-shrink-0">
        {avatarUrl ? (
          <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-neutral-200 dark:ring-neutral-700">
            <Image src={avatarUrl} alt={displayName} width={32} height={32} className="w-full h-full object-cover" unoptimized />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center text-xs font-bold">
            {initial}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">{displayName}</p>
        <p className="text-xs text-neutral-400 font-mono">{address.slice(0, 10)}…{address.slice(-6)}</p>
      </div>

      {/* Category badge */}
      <span className="flex-shrink-0 text-base" title={meta.label}>{meta.emoji}</span>
    </button>
  );
}

// ─── ProfilePicker ────────────────────────────────────────────────────────────

export function ProfilePicker({ isOpen, onClose, onConfirm, mode = 'contacts', preSelected = [] }: ProfilePickerProps) {
  const { contacts } = useContacts();
  const { t } = useI18n();

  const allowedCategories = MODE_CATEGORIES[mode];
  const [activeCategory, setActiveCategory] = useState<ContactCategory | 'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(preSelected.map((a) => a.toLowerCase())));
  const [searchQuery, setSearchQuery] = useState('');

  const titleKey = mode === 'agents'
    ? 'picker.title.agents'
    : mode === 'merchants'
    ? 'picker.title.merchants'
    : 'picker.title.contacts';

  // Contacts filtered to allowed categories
  const eligible = useMemo(
    () => contacts.filter((c) => allowedCategories.includes(c.category)),
    [contacts, allowedCategories]
  );

  // Further filter by active category pill + search query
  const visible = useMemo(() => {
    const byCategory = activeCategory === 'all' ? eligible : eligible.filter((c) => c.category === activeCategory);
    if (!searchQuery.trim()) return byCategory;
    const q = searchQuery.toLowerCase();
    return byCategory.filter((c) =>
      (c.name ?? '').toLowerCase().includes(q) || c.address.toLowerCase().includes(q)
    );
  }, [eligible, activeCategory, searchQuery]);

  const toggle = (address: string) => {
    const key = address.toLowerCase();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" style={{ background: 'var(--card)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            {t(titleKey as Parameters<typeof t>[0])}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-3 pb-1 flex-shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('picker.search_placeholder')}
            className="w-full h-8 rounded-lg px-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
            style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>

        {/* Category filter pills — only shown when mode=contacts or multiple categories available */}
        {allowedCategories.length > 1 && (
          <div className="px-5 pt-3 pb-1 flex gap-2 flex-wrap flex-shrink-0">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                activeCategory === 'all'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
              )}
            >
              {t('profiles.filter.all')}
            </button>
            {allowedCategories.map((cat) => {
              const meta = CATEGORY_META[cat];
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1',
                    activeCategory === cat
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
                  )}
                >
                  <span>{meta.emoji}</span>
                  <span>{t(meta.labelKey as Parameters<typeof t>[0])}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {eligible.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('picker.empty')}</p>
              <Link
                href="/profiles"
                onClick={onClose}
                className="inline-block text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium underline"
              >
                {t('picker.go_explorer')}
              </Link>
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-8">{t('picker.empty_filter')}</p>
          ) : (
            visible.map((contact) => (
              <ContactRow
                key={contact.address}
                address={contact.address}
                name={contact.name}
                avatarUrl={contact.avatarUrl}
                category={contact.category}
                checked={selected.has(contact.address.toLowerCase())}
                onToggle={() => toggle(contact.address)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            {selected.size > 0 ? `${selected.size} ${t('picker.selected')}` : ''}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('picker.done')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
