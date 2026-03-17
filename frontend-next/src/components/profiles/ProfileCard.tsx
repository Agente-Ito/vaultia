'use client';

import React, { useEffect } from 'react';
import Image from 'next/image';
import { useUniversalProfile } from '@/hooks/useUniversalProfile';
import { useContacts, CATEGORY_META, type ContactCategory, type ContactRecord } from '@/hooks/useContacts';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils/cn';

// ─── Category selector ────────────────────────────────────────────────────────

function CategorySelect({
  value,
  onChange,
}: {
  value: ContactCategory;
  onChange: (cat: ContactCategory) => void;
}) {
  const { t } = useI18n();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ContactCategory)}
      className="text-xs rounded-full border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-400 cursor-pointer"
    >
      {(Object.entries(CATEGORY_META) as [ContactCategory, typeof CATEGORY_META[ContactCategory]][]).map(
        ([key, meta]) => (
          <option key={key} value={key}>
            {meta.emoji} {t(meta.labelKey as Parameters<typeof t>[0])}
          </option>
        )
      )}
    </select>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      className="text-xs text-neutral-400 hover:text-primary-500 transition-colors"
      title="Copy address"
    >
      {copied ? '✓' : '⎘'}
    </button>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProfileCardProps {
  address: string;
  chainId?: number | null;
  /** Pre-loaded cached data — shown while UP data is fetched */
  cachedContact?: ContactRecord | null;
  /** Actions shown only in picker / selection context */
  onSelectAsAgent?: (address: string) => void;
  onSelectAsMerchant?: (address: string) => void;
  className?: string;
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function ProfileCard({
  address,
  chainId,
  cachedContact,
  onSelectAsAgent,
  onSelectAsMerchant,
  className,
}: ProfileCardProps) {
  const { t } = useI18n();
  const { isContact, addContact, removeContact, updateCategory, cacheProfile, findContact } = useContacts();
  const { profile, loading } = useUniversalProfile(address, chainId);

  const contact = findContact(address);
  const saved = isContact(address);

  // Persist fresh UP data into the contact record
  useEffect(() => {
    if (profile && saved) {
      cacheProfile(address, {
        name:      profile.name      || undefined,
        avatarUrl: profile.avatarUrl || undefined,
      });
    }
  }, [profile, saved, address, cacheProfile]);

  // Decide what to display: fresh data > cached contact data > fallback
  const displayName      = profile?.name      || cachedContact?.name      || '';
  const displayAvatarUrl = profile?.avatarUrl  || cachedContact?.avatarUrl || null;
  const displayDesc      = profile?.description ?? '';
  const displayTags      = profile?.tags        ?? [];
  const displayLinks     = profile?.links       ?? [];

  const short = `${address.slice(0, 8)}…${address.slice(-6)}`;

  const categoryValue: ContactCategory = contact?.category ?? 'untagged';

  const handleAddContact = () => {
    addContact({
      address,
      category: 'untagged',
      name: profile?.name,
      avatarUrl: profile?.avatarUrl ?? undefined,
    });
  };

  return (
    <div className={cn(
      'rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden',
      className
    )}>
      {/* Background banner */}
      {profile?.backgroundUrl && (
        <div className="relative h-16 w-full">
          <Image
            src={profile.backgroundUrl}
            alt=""
            fill
            className="object-cover"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40" />
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Identity row */}
        <div className={cn('flex items-start gap-3', profile?.backgroundUrl && '-mt-8')}>
          {/* Avatar */}
          <div className={cn(
            'flex-shrink-0',
            profile?.backgroundUrl && 'ring-2 ring-white dark:ring-neutral-800 rounded-full'
          )}>
            {loading && !displayAvatarUrl ? (
              <div className="w-12 h-12 rounded-full bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
            ) : displayAvatarUrl ? (
              <Image
                src={displayAvatarUrl}
                alt={displayName || address}
                width={48}
                height={48}
                className="w-12 h-12 rounded-full object-cover"
                unoptimized
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center text-lg font-bold">
                {(displayName[0] ?? address[2] ?? '?').toUpperCase()}
              </div>
            )}
          </div>

          {/* Name + address + category */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 truncate">
                  {displayName || t('up.profile.no_name')}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <p className="text-xs font-mono text-neutral-400">{short}</p>
                  <CopyButton text={address} />
                </div>
              </div>
              {saved && (
                <CategorySelect
                  value={categoryValue}
                  onChange={(cat) => updateCategory(address, cat)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {displayDesc && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
            {displayDesc}
          </p>
        )}

        {/* Tags from LSP3 */}
        {displayTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {displayTags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Links */}
        {displayLinks.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {displayLinks.slice(0, 3).map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-500 hover:underline"
              >
                {link.title} ↗
              </a>
            ))}
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-neutral-100 dark:border-neutral-700">
          {/* View on UP explorer */}
          <a
            href={`https://universalprofile.cloud/${address}${chainId === 4201 ? '?network=testnet' : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-neutral-400 hover:text-primary-500 transition-colors"
          >
            {t('profiles.view_profile')} ↗
          </a>

          <div className="flex-1" />

          {/* Selection actions (picker context) */}
          {onSelectAsAgent && (
            <button
              onClick={() => onSelectAsAgent(address)}
              className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 transition-colors font-medium"
            >
              🤖 {t('profiles.select_as_agent')}
            </button>
          )}
          {onSelectAsMerchant && (
            <button
              onClick={() => onSelectAsMerchant(address)}
              className="text-xs px-2.5 py-1 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300 transition-colors font-medium"
            >
              💰 {t('profiles.select_as_merchant')}
            </button>
          )}

          {/* Save / remove */}
          {!onSelectAsAgent && !onSelectAsMerchant && (
            saved ? (
              <button
                onClick={() => removeContact(address)}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                {t('profiles.remove_contact')}
              </button>
            ) : (
              <button
                onClick={handleAddContact}
                className="text-xs px-2.5 py-1 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-300 transition-colors font-medium"
              >
                + {t('profiles.add_contact')}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
