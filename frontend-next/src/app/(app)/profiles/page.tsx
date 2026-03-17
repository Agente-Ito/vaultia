'use client';
export const dynamic = 'force-dynamic';

import { useState, useMemo } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '@/context/Web3Context';
import { useContacts, CATEGORY_META, type ContactCategory } from '@/hooks/useContacts';
import { useI18n } from '@/context/I18nContext';
import { ProfileCard } from '@/components/profiles/ProfileCard';
import { cn } from '@/lib/utils/cn';

// ─── Category filter pills ────────────────────────────────────────────────────

const ALL_FILTER = '__all__';

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
        active
          ? 'bg-primary-500 text-white border-primary-500 shadow-sm'
          : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-primary-400'
      )}
    >
      {children}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilesPage() {
  const { chainId } = useWeb3();
  const { contacts } = useContacts();
  const { t } = useI18n();

  const [query, setQuery]           = useState('');
  const [searchAddr, setSearchAddr] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ContactCategory | typeof ALL_FILTER>(ALL_FILTER);

  // Validate and resolve address on form submit
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    setSearchError(null);
    if (!trimmed) { setSearchAddr(null); return; }

    if (ethers.isAddress(trimmed)) {
      setSearchAddr(ethers.getAddress(trimmed));
    } else {
      setSearchError(t('profiles.search.invalid'));
      setSearchAddr(null);
    }
  };

  // Filtered contacts
  const filteredContacts = useMemo(
    () =>
      activeFilter === ALL_FILTER
        ? contacts
        : contacts.filter((c) => c.category === activeFilter),
    [contacts, activeFilter]
  );

  // Don't show the search result if it's already in the contacts list
  const showSearchResult =
    searchAddr !== null &&
    !contacts.some((c) => c.address.toLowerCase() === searchAddr.toLowerCase());

  return (
    <div className="space-y-lg">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">
          {t('profiles.title')}
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-xs">
          {t('profiles.subtitle')}
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch}>
        <div className="flex gap-sm">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">🔍</span>
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSearchError(null); }}
              placeholder={t('profiles.search.placeholder')}
              className={cn(
                'w-full h-10 pl-9 pr-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50 placeholder-neutral-400',
                searchError
                  ? 'border-red-400'
                  : 'border-neutral-200 dark:border-neutral-700'
              )}
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors"
          >
            {t('profiles.search.btn')}
          </button>
        </div>
        {searchError && (
          <p className="text-xs text-red-500 mt-1 ml-1">{searchError}</p>
        )}
        <p className="text-xs text-neutral-400 mt-1 ml-1">{t('profiles.search.hint')}</p>
      </form>

      {/* Search result */}
      {showSearchResult && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-3">
            {t('profiles.search.result')}
          </p>
          <div className="max-w-sm">
            <ProfileCard address={searchAddr!} chainId={chainId} />
          </div>
        </div>
      )}

      {/* Contacts section */}
      <div>
        {/* Section header + filter pills */}
        <div className="flex items-center justify-between gap-md mb-4 flex-wrap">
          <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            {t('profiles.contacts.title')}
            {contacts.length > 0 && (
              <span className="ml-1.5 text-xs font-normal text-neutral-400">({contacts.length})</span>
            )}
          </p>

          <div className="flex flex-wrap gap-2">
            <FilterPill
              active={activeFilter === ALL_FILTER}
              onClick={() => setActiveFilter(ALL_FILTER)}
            >
              {t('profiles.filter.all')}
            </FilterPill>
            {(Object.entries(CATEGORY_META) as [ContactCategory, typeof CATEGORY_META[ContactCategory]][])
              .filter(([key]) => key !== 'untagged')
              .map(([key, meta]) => (
                <FilterPill
                  key={key}
                  active={activeFilter === key}
                  onClick={() => setActiveFilter(key)}
                >
                  {meta.emoji} {t(meta.labelKey as Parameters<typeof t>[0])}
                </FilterPill>
              ))}
          </div>
        </div>

        {/* Contacts grid */}
        {filteredContacts.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-700 py-12 text-center space-y-2">
            <p className="text-3xl">👥</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {contacts.length === 0
                ? t('profiles.contacts.empty')
                : t('profiles.contacts.empty_filter')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
            {filteredContacts
              .slice()
              .sort((a, b) => b.addedAt - a.addedAt)
              .map((contact) => (
                <ProfileCard
                  key={contact.address}
                  address={contact.address}
                  chainId={chainId}
                  cachedContact={contact}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
