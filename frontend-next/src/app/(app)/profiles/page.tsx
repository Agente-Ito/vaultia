'use client';
export const dynamic = 'force-dynamic';

import { useState, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ethers } from 'ethers';
import { useWeb3 } from '@/context/Web3Context';
import { useContacts, CATEGORY_META, type ContactCategory } from '@/hooks/useContacts';
import { useI18n } from '@/context/I18nContext';
import { ProfileCard } from '@/components/profiles/ProfileCard';

const ALL_FILTER = '__all__';

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
      style={{
        background: active ? 'var(--primary)' : 'var(--card-mid)',
        color:      active ? 'var(--bg)'      : 'var(--text-muted)',
        border:     active ? '1px solid transparent' : '1px solid var(--border)',
      }}
    >
      {children}
    </button>
  );
}

function ProfilesPageInner() {
  const { chainId } = useWeb3();
  const { contacts } = useContacts();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const returnTo = searchParams.get('returnTo');   // e.g. /vaults/create
  const returnField = searchParams.get('field');   // e.g. 'merchants'
  const isVaultReturn = !!returnTo;

  const [query, setQuery]               = useState('');
  const [searchAddr, setSearchAddr]     = useState<string | null>(null);
  const [searchError, setSearchError]   = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ContactCategory | typeof ALL_FILTER>(ALL_FILTER);
  const [pendingAddresses, setPendingAddresses] = useState<Set<string>>(new Set());

  const togglePending = useCallback((address: string) => {
    setPendingAddresses((prev) => {
      const next = new Set(prev);
      const key = address.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleVaultDone = () => {
    try {
      sessionStorage.setItem('vaultPendingMerchants', JSON.stringify(Array.from(pendingAddresses)));
    } catch { /* ignore */ }
    router.push(returnTo!);
  };

  const handleVaultCancel = () => {
    router.push(returnTo!);
  };

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

  const filteredContacts = useMemo(
    () => activeFilter === ALL_FILTER ? contacts : contacts.filter((c) => c.category === activeFilter),
    [contacts, activeFilter]
  );

  const showSearchResult = searchAddr !== null && !contacts.some((c) => c.address.toLowerCase() === searchAddr.toLowerCase());

  return (
    <div className="space-y-lg">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{t('profiles.title')}</h1>
        <p className="mt-xs" style={{ color: 'var(--text-muted)' }}>{t('profiles.subtitle')}</p>
      </div>

      {/* Vault-return banner — shown when navigated from vault creation */}
      {isVaultReturn && (
        <div
          className="sticky top-0 z-40 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap"
          style={{ background: 'color-mix(in srgb, var(--accent) 12%, var(--card))', border: '1px solid color-mix(in srgb, var(--accent) 40%, var(--border))' }}
        >
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {t('profiles.vault_return_banner')}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {pendingAddresses.size > 0
                ? `${pendingAddresses.size} ${t('profiles.vault_return_hint')}`
                : returnField === 'merchants'
                  ? t('profiles.vault_return_hint').replace(/^\d+\s/, '')
                  : t('profiles.vault_return_hint').replace(/^\d+\s/, '')}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleVaultCancel}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              {t('profiles.vault_return_cancel')}
            </button>
            <button
              type="button"
              onClick={handleVaultDone}
              disabled={pendingAddresses.size === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              {t('profiles.vault_return_done')}
              {pendingAddresses.size > 0 && ` (${pendingAddresses.size})`}
            </button>
          </div>
        </div>
      )}

      {/* Search bar */}
      <form onSubmit={handleSearch}>
        <div className="flex gap-sm">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>🔍</span>
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSearchError(null); }}
              placeholder={t('profiles.search.placeholder')}
              className="w-full h-10 pl-9 pr-3 rounded-lg text-sm focus:outline-none focus:ring-2"
              style={{
                background: 'var(--card-mid)',
                border: searchError ? '1px solid var(--blocked)' : '1px solid var(--border)',
                color: 'var(--text)',
              }}
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-85"
            style={{ background: 'var(--primary)', color: 'var(--bg)' }}
          >
            {t('profiles.search.btn')}
          </button>
        </div>
        {searchError && (
          <p className="text-xs mt-1 ml-1" style={{ color: 'var(--blocked)' }}>{searchError}</p>
        )}
        <p className="text-xs mt-1 ml-1" style={{ color: 'var(--text-muted)' }}>{t('profiles.search.hint')}</p>
      </form>

      {showSearchResult && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
            {t('profiles.search.result')}
          </p>
          <div className="max-w-sm">
            <ProfileCard
              address={searchAddr!}
              chainId={chainId}
              onSelectAsMerchant={isVaultReturn ? togglePending : undefined}
            />
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-md mb-4 flex-wrap">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            {t('profiles.contacts.title')}
            {contacts.length > 0 && (
              <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                ({contacts.length})
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <FilterPill active={activeFilter === ALL_FILTER} onClick={() => setActiveFilter(ALL_FILTER)}>
              {t('profiles.filter.all')}
            </FilterPill>
            {(Object.entries(CATEGORY_META) as [ContactCategory, typeof CATEGORY_META[ContactCategory]][])
              .filter(([key]) => key !== 'untagged')
              .map(([key, meta]) => (
                <FilterPill key={key} active={activeFilter === key} onClick={() => setActiveFilter(key)}>
                  {meta.emoji} {t(meta.labelKey as Parameters<typeof t>[0])}
                </FilterPill>
              ))}
          </div>
        </div>

        {filteredContacts.length === 0 ? (
          <div
            className="rounded-xl border-2 border-dashed py-12 text-center space-y-2"
            style={{ borderColor: 'var(--border)' }}
          >
            <p className="text-3xl">👥</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {contacts.length === 0 ? t('profiles.contacts.empty') : t('profiles.contacts.empty_filter')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
            {filteredContacts
              .slice()
              .sort((a, b) => b.addedAt - a.addedAt)
              .map((contact) => (
                <div key={contact.address} className="relative">
                  <ProfileCard
                    address={contact.address}
                    chainId={chainId}
                    cachedContact={contact}
                    onSelectAsMerchant={isVaultReturn ? togglePending : undefined}
                  />
                  {/* Selected-for-vault indicator */}
                  {isVaultReturn && pendingAddresses.has(contact.address.toLowerCase()) && (
                    <div
                      className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: 'var(--accent)', color: '#000' }}
                    >
                      ✓
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProfilesPage() {
  return (
    <Suspense>
      <ProfilesPageInner />
    </Suspense>
  );
}
