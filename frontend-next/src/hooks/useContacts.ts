import { useCallback } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ContactCategory =
  | 'human'
  | 'ai-agent'
  | 'dao'
  | 'service'
  | 'merchant'
  | 'untagged';

export interface ContactRecord {
  address: string;
  category: ContactCategory;
  addedAt: number;
  /** Cached UP data — shown immediately while the hook re-fetches */
  name?: string;
  avatarUrl?: string;
}

export const CATEGORY_META: Record<ContactCategory, { label: string; emoji: string; labelKey: string }> = {
  'human':    { label: 'Human',    emoji: '👤', labelKey: 'profiles.category.human'    },
  'ai-agent': { label: 'AI Agent', emoji: '🤖', labelKey: 'profiles.category.ai-agent' },
  'dao':      { label: 'DAO',      emoji: '🏛️', labelKey: 'profiles.category.dao'      },
  'service':  { label: 'Service',  emoji: '🔧', labelKey: 'profiles.category.service'  },
  'merchant': { label: 'Merchant', emoji: '💰', labelKey: 'profiles.category.merchant' },
  'untagged': { label: 'Untagged', emoji: '❓', labelKey: 'profiles.category.untagged' },
};

// ─── Hook ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'up-contacts';

export function useContacts() {
  const [contacts, setContacts] = useLocalStorage<ContactRecord[]>(STORAGE_KEY, []);

  const normalise = (addr: string) => addr.toLowerCase();

  const addContact = useCallback(
    (record: Omit<ContactRecord, 'addedAt'>) => {
      const next = [
        ...contacts.filter((c) => normalise(c.address) !== normalise(record.address)),
        { ...record, addedAt: Date.now() },
      ];
      setContacts(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contacts, setContacts]
  );

  const removeContact = useCallback(
    (address: string) => {
      setContacts(contacts.filter((c) => normalise(c.address) !== normalise(address)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contacts, setContacts]
  );

  const updateCategory = useCallback(
    (address: string, category: ContactCategory) => {
      setContacts(
        contacts.map((c) =>
          normalise(c.address) === normalise(address) ? { ...c, category } : c
        )
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contacts, setContacts]
  );

  /** Persist freshly-fetched UP data so cards render instantly on next open */
  const cacheProfile = useCallback(
    (address: string, data: { name?: string; avatarUrl?: string }) => {
      setContacts(
        contacts.map((c) =>
          normalise(c.address) === normalise(address) ? { ...c, ...data } : c
        )
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contacts, setContacts]
  );

  const findContact = useCallback(
    (address: string) =>
      contacts.find((c) => normalise(c.address) === normalise(address)) ?? null,
    [contacts]
  );

  const isContact = useCallback(
    (address: string) => contacts.some((c) => normalise(c.address) === normalise(address)),
    [contacts]
  );

  return { contacts, addContact, removeContact, updateCategory, cacheProfile, findContact, isContact };
}
