import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

// ─── Constants ─────────────────────────────────────────────────────────────

export const IPFS_GATEWAY = 'https://api.universalprofile.cloud/ipfs/';

const RPC_URLS: Record<number, string> = {
  4201: 'https://rpc.testnet.lukso.network',
  42:   'https://rpc.lukso.network',
};
const DEFAULT_RPC = 'https://rpc.testnet.lukso.network';

// Inline LSP3ProfileMetadata schema — avoids JSON import issues in Next.js
const LSP3_SCHEMA = [
  {
    name: 'LSP3Profile',
    key: '0x5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5',
    keyType: 'Singleton',
    valueType: 'bytes',
    valueContent: 'VerifiableURI',
  },
];

/** True when NEXT_PUBLIC_INDEXER_URL is configured at build time */
const INDEXER_ENABLED = false; // @lsp-indexer/react removed (security); re-add package to re-enable

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UPProfile {
  name: string;
  description: string;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  tags: string[];
  links: Array<{ title: string; url: string }>;
  followerCount: number | null;
  followingCount: number | null;
}

interface LSP3Raw {
  name?: string;
  description?: string;
  profileImage?: Array<{ url?: string }>;
  backgroundImage?: Array<{ url?: string }>;
  tags?: string[];
  links?: Array<{ title: string; url: string }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function resolveIpfs(url: string): string {
  if (!url) return '';
  if (url.startsWith('ipfs://')) return IPFS_GATEWAY + url.slice(7);
  return url;
}

// ─── Indexer-based fetcher (disabled — @lsp-indexer/react not installed) ──────
// To re-enable: npm install @lsp-indexer/react, set NEXT_PUBLIC_INDEXER_URL,
// and set INDEXER_ENABLED = !!process.env.NEXT_PUBLIC_INDEXER_URL above.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchFromIndexer(_address: string): Promise<UPProfile | null> {
  return null;
}

// ─── ERC725.js-based fetcher (always available, no external service needed) ──

async function fetchFromERC725(address: string, chainId?: number | null): Promise<UPProfile | null> {
  try {
    const { default: ERC725 } = await import('@erc725/erc725.js');
    const rpcUrl = (chainId && RPC_URLS[chainId]) ?? DEFAULT_RPC;

    const erc725 = new ERC725(LSP3_SCHEMA, address, rpcUrl, { ipfsGateway: IPFS_GATEWAY });
    const result = await erc725.fetchData('LSP3Profile');

    const val = result?.value as Record<string, unknown> | null;
    const lsp3: LSP3Raw =
      (val?.LSP3Profile as LSP3Raw) ?? (val as LSP3Raw) ?? {};

    return {
      name:           lsp3.name           ?? '',
      description:    lsp3.description    ?? '',
      avatarUrl:      lsp3.profileImage?.[0]?.url    ? resolveIpfs(lsp3.profileImage[0].url!)    : null,
      backgroundUrl:  lsp3.backgroundImage?.[0]?.url ? resolveIpfs(lsp3.backgroundImage[0].url!) : null,
      tags:           lsp3.tags  ?? [],
      links:          lsp3.links ?? [],
      followerCount:  null,
      followingCount: null,
    };
  } catch {
    return null;
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useUniversalProfile(address: string | null, chainId?: number | null) {
  // ── Indexer path (TanStack Query, enabled only when indexer is configured) ──
  const indexerQuery = useQuery({
    queryKey: ['up-indexer', address],
    queryFn:  () => fetchFromIndexer(address!),
    enabled:  INDEXER_ENABLED && !!address,
    staleTime: 60_000,
  });

  // ── ERC725 path — used when indexer is disabled or returns null ────────────
  const [erc725Profile, setErc725Profile] = useState<UPProfile | null>(null);
  const [loading725, setLoading725]       = useState(false);

  useEffect(() => {
    // Skip ERC725 fetch if the indexer already returned a non-null result
    if (INDEXER_ENABLED && indexerQuery.data !== undefined) return;
    if (!address) { setErc725Profile(null); return; }

    let cancelled = false;
    setLoading725(true);

    fetchFromERC725(address, chainId).then((profile) => {
      if (!cancelled) {
        setErc725Profile(profile);
        setLoading725(false);
      }
    });

    return () => { cancelled = true; };
  }, [address, chainId, indexerQuery.data]);

  // ── Merge: prefer indexer result when present ──────────────────────────────
  const profile  = (INDEXER_ENABLED ? indexerQuery.data : null) ?? erc725Profile;
  const loading  = (INDEXER_ENABLED ? indexerQuery.isLoading : false) || loading725;
  const error    = INDEXER_ENABLED && indexerQuery.isError
    ? String(indexerQuery.error)
    : null;

  return { profile, loading, error };
}
