import { useContacts } from './useContacts';
import { useUniversalProfile } from './useUniversalProfile';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DisplayName {
  /** Resolved name or truncated address fallback */
  name: string;
  /** true when a real name (contact alias or UP profile) was found */
  isResolved: boolean;
  /** true while an async UP profile fetch is in progress */
  loading: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Resolves a human display name for an address using three sources in order:
 *  1. Local contact alias (instant, from useContacts)
 *  2. LUKSO Universal Profile name (async, React Query cached 60s)
 *  3. Truncated address fallback
 *
 * NOTE: Use only for human accounts (recipients, agents, merchants).
 * Contract addresses (policyEngine, keyManager) should stay as truncated hex.
 */
export function useDisplayName(address: string | null | undefined): DisplayName {
  const { findContact } = useContacts();
  const { profile, loading } = useUniversalProfile(address ?? null);

  if (!address) {
    return { name: '—', isResolved: false, loading: false };
  }

  // Priority 1: Local contact alias (instant)
  const contact = findContact(address);
  if (contact?.name) {
    return { name: contact.name, isResolved: true, loading: false };
  }

  // Priority 2: Universal Profile name (async)
  if (profile?.name) {
    return { name: profile.name, isResolved: true, loading: false };
  }

  // Priority 3: Truncated fallback
  return { name: truncate(address), isResolved: false, loading };
}
