import { useState, useEffect } from 'react';

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

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UPProfile {
  name: string;
  description: string;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  tags: string[];
  links: Array<{ title: string; url: string }>;
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

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useUniversalProfile(address: string | null, chainId?: number | null) {
  const [profile, setProfile] = useState<UPProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Dynamic import keeps erc725.js out of the SSR bundle
        const { default: ERC725 } = await import('@erc725/erc725.js');

        const rpcUrl = (chainId && RPC_URLS[chainId]) ?? DEFAULT_RPC;

        const erc725 = new ERC725(LSP3_SCHEMA, address, rpcUrl, {
          ipfsGateway: IPFS_GATEWAY,
        });

        const result = await erc725.fetchData('LSP3Profile');
        if (cancelled) return;

        // value can be { LSP3Profile: { ... } } or the raw object depending on version
        const val = result?.value as Record<string, unknown> | null;
        const lsp3: LSP3Raw =
          (val?.LSP3Profile as LSP3Raw) ?? (val as LSP3Raw) ?? {};

        setProfile({
          name:          lsp3.name          ?? '',
          description:   lsp3.description   ?? '',
          avatarUrl:     lsp3.profileImage?.[0]?.url    ? resolveIpfs(lsp3.profileImage[0].url!)    : null,
          backgroundUrl: lsp3.backgroundImage?.[0]?.url ? resolveIpfs(lsp3.backgroundImage[0].url!) : null,
          tags:          lsp3.tags  ?? [],
          links:         lsp3.links ?? [],
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load profile');
          setProfile(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [address, chainId]);

  return { profile, loading, error };
}
