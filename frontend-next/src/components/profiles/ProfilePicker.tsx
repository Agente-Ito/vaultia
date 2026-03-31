'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ethers } from 'ethers';
import { useContacts, ContactCategory, CATEGORY_META } from '@/hooks/useContacts';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils/cn';

const accentSurfaceStyle = {
  backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)',
  borderColor: 'color-mix(in srgb, var(--accent) 40%, var(--border))',
};

const accentSolidStyle = {
  backgroundColor: 'var(--accent)',
  borderColor: 'var(--accent)',
};

const accentAvatarStyle = {
  backgroundColor: 'color-mix(in srgb, var(--accent) 14%, var(--card-mid))',
  color: 'var(--accent)',
};

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
  categoryLabel,
  checked,
  onToggle,
}: {
  address: string;
  name?: string;
  avatarUrl?: string;
  categoryLabel: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const displayName = name || `${address.slice(0, 8)}…${address.slice(-6)}`;
  const initial = name ? name[0].toUpperCase() : address[2]?.toUpperCase() ?? '?';

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
        !checked && 'hover:opacity-90'
      )}
      style={checked ? accentSurfaceStyle : { borderColor: 'var(--border)' }}
    >
      {/* Checkbox */}
      <div className={cn(
        'w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center',
      )}
      style={checked ? accentSolidStyle : { borderColor: 'var(--border)' }}>
        {checked && <span className="h-2 w-2 rounded-full bg-white" />}
      </div>

      {/* Avatar */}
      <div className="flex-shrink-0">
        {avatarUrl ? (
          <div className="w-8 h-8 rounded-full overflow-hidden ring-1" style={{ boxShadow: '0 0 0 1px var(--border) inset' }}>
            <Image src={avatarUrl} alt={displayName} width={32} height={32} className="w-full h-full object-cover" unoptimized />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={accentAvatarStyle}>
            {initial}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{displayName}</p>
        <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{address.slice(0, 10)}…{address.slice(-6)}</p>
      </div>

      {/* Category badge */}
      <span
        className="flex-shrink-0 rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em]"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', backgroundColor: 'var(--card-mid)' }}
        title={categoryLabel}
      >
        {categoryLabel}
      </span>
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
  const [manualAddress, setManualAddress] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualEntries, setManualEntries] = useState<string[]>([]);

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

  const handleAddManual = () => {
    const addr = manualAddress.trim();
    if (!addr) return;
    if (!ethers.isAddress(addr)) {
      setManualError(t('picker.address_invalid'));
      return;
    }
    const normalized = ethers.getAddress(addr);
    const key = normalized.toLowerCase();
    if (selected.has(key)) {
      setManualError(t('picker.address_already'));
      return;
    }
    setManualEntries((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setSelected((prev) => new Set([...prev, key]));
    setManualAddress('');
    setManualError(null);
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
      <div
        className="relative rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        style={{ background: 'var(--card)', fontFamily: 'var(--font-geist-sans), Inter, system-ui, sans-serif' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-light uppercase tracking-[0.12em]" style={{ color: 'var(--text)' }}>
            {t(titleKey as Parameters<typeof t>[0])}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
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
            className="w-full h-8 rounded-lg px-3 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
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
                'px-3 py-1 rounded-full text-[10px] font-medium uppercase tracking-[0.12em] border transition-colors',
                activeCategory !== 'all' && 'hover:opacity-85'
              )}
              style={activeCategory === 'all' ? { ...accentSolidStyle, color: '#fff' } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}
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
                    'px-3 py-1 rounded-full text-[10px] font-medium uppercase tracking-[0.12em] border transition-colors',
                    activeCategory !== cat && 'hover:opacity-85'
                  )}
                  style={activeCategory === cat ? { ...accentSolidStyle, color: '#fff' } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  <span>{t(meta.labelKey as Parameters<typeof t>[0])}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {/* Manually-added entries (shown even when no saved contacts) */}
          {manualEntries.map((addr) => (
            <ContactRow
              key={addr}
              address={addr}
              categoryLabel="manual"
              checked={selected.has(addr.toLowerCase())}
              onToggle={() => toggle(addr)}
            />
          ))}

          {eligible.length === 0 && manualEntries.length === 0 ? (
            <div className="text-center py-6 space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('picker.empty')}</p>

              {/* Inline address input — primary action when no contacts */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('picker.add_by_address')}</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualAddress}
                    onChange={(e) => { setManualAddress(e.target.value); setManualError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
                    placeholder={t('picker.add_by_address_placeholder')}
                    className="flex-1 h-8 rounded-lg px-3 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-mono"
                    style={{ background: 'var(--card-mid)', border: `1px solid ${manualError ? 'var(--blocked)' : 'var(--border)'}`, color: 'var(--text)' }}
                  />
                  <button
                    type="button"
                    onClick={handleAddManual}
                    className="px-3 h-8 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 flex-shrink-0"
                    style={{ background: 'var(--accent)', color: '#000' }}
                  >
                    {t('picker.add_address_btn')}
                  </button>
                </div>
                {manualError && <p className="text-xs text-left" style={{ color: 'var(--blocked)' }}>{manualError}</p>}
              </div>

              <Link
                href={`/profiles?returnTo=%2Fvaults%2Fcreate&field=${mode}`}
                onClick={onClose}
                className="inline-block text-xs font-medium underline transition-opacity hover:opacity-80"
                style={{ color: 'var(--accent)' }}
              >
                {t('picker.go_explorer')}
              </Link>
            </div>
          ) : visible.length === 0 && manualEntries.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>{t('picker.empty_filter')}</p>
          ) : (
            visible.map((contact) => (
              <ContactRow
                key={contact.address}
                address={contact.address}
                name={contact.name}
                avatarUrl={contact.avatarUrl}
                categoryLabel={t(CATEGORY_META[contact.category].labelKey as Parameters<typeof t>[0])}
                checked={selected.has(contact.address.toLowerCase())}
                onToggle={() => toggle(contact.address)}
              />
            ))
          )}

          {/* Add-by-address row — always shown when there ARE contacts */}
          {eligible.length > 0 && (
            <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                {t('picker.add_by_address')}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualAddress}
                  onChange={(e) => { setManualAddress(e.target.value); setManualError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
                  placeholder={t('picker.add_by_address_placeholder')}
                  className="flex-1 h-8 rounded-lg px-3 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-mono"
                  style={{ background: 'var(--card-mid)', border: `1px solid ${manualError ? 'var(--blocked)' : 'var(--border)'}`, color: 'var(--text)' }}
                />
                <button
                  type="button"
                  onClick={handleAddManual}
                  className="px-3 h-8 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 flex-shrink-0"
                  style={{ background: 'var(--accent)', color: '#000' }}
                >
                  {t('picker.add_address_btn')}
                </button>
              </div>
              {manualError && <p className="text-xs mt-1" style={{ color: 'var(--blocked)' }}>{manualError}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {selected.size > 0 ? `${selected.size} ${t('picker.selected')}` : ''}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium uppercase tracking-[0.1em] transition-opacity hover:opacity-70"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className="px-4 py-2 text-xs font-medium uppercase tracking-[0.1em] rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {t('picker.done')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
