import { useEffect, useState, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { useLocalStorage } from '@/hooks/useLocalStorage';

// ─── LSP1 UniversalReceiver event ABI ────────────────────────────────────────

const UP_ABI = [
  'event UniversalReceiver(address indexed from, uint256 indexed value, bytes32 indexed typeId, bytes receivedData, bytes returnedValue)',
];

// ─── Known LSP1 typeIds (keccak256 of the string) ────────────────────────────

const TYPEID_LSP7_RECIPIENT  = ethers.id('LSP7Tokens_RecipientNotification');
const TYPEID_LSP8_RECIPIENT  = ethers.id('LSP8Tokens_RecipientNotification');

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationType = 'lyx' | 'token' | 'nft' | 'other';

export interface UPNotification {
  /** txHash-logIndex — stable unique key */
  key: string;
  blockNumber: number;
  from: string;
  value: bigint;
  typeId: string;
  type: NotificationType;
  /** Formatted LYX amount (only when type === 'lyx' and value > 0) */
  amount?: string;
}

// ─── RPC selection ───────────────────────────────────────────────────────────

function getRpcUrl(chainId: number | null) {
  if (chainId === 42) return 'https://rpc.mainnet.lukso.network';
  return 'https://rpc.testnet.lukso.network';
}

function classifyTypeId(typeId: string, value: bigint): NotificationType {
  if (value > BigInt(0))               return 'lyx';
  if (typeId === TYPEID_LSP7_RECIPIENT) return 'token';
  if (typeId === TYPEID_LSP8_RECIPIENT) return 'nft';
  return 'other';
}

// ─── Hook ────────────────────────────────────────────────────────────────────

const BLOCK_LOOKBACK = 100_000;
const MAX_NOTIFICATIONS = 30;
const STORAGE_KEY = 'up-notifications-read';

export function useNotifications(upAddress: string | null, chainId: number | null) {
  const [notifications, setNotifications] = useState<UPNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readKeys, setReadKeys] = useLocalStorage<string[]>(STORAGE_KEY, []);

  const readSet = useMemo(() => new Set(readKeys), [readKeys]);
  const unreadCount = notifications.filter((n) => !readSet.has(n.key)).length;

  const markAllRead = useCallback(() => {
    setReadKeys(notifications.map((n) => n.key));
  }, [notifications, setReadKeys]);

  const markRead = useCallback((key: string) => {
    if (!readSet.has(key)) {
      setReadKeys([...readKeys, key]);
    }
  }, [readKeys, readSet, setReadKeys]);

  useEffect(() => {
    if (!upAddress) {
      setNotifications([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const provider = new ethers.JsonRpcProvider(getRpcUrl(chainId));
        const contract = new ethers.Contract(upAddress, UP_ABI, provider);

        const latest = await provider.getBlockNumber();
        const fromBlock = Math.max(0, latest - BLOCK_LOOKBACK);

        const logs = await contract.queryFilter(
          contract.filters.UniversalReceiver(),
          fromBlock,
          latest
        ) as ethers.EventLog[];

        if (cancelled) return;

        const parsed: UPNotification[] = logs
          .slice(-MAX_NOTIFICATIONS)
          .reverse()
          .map((log) => {
            const from    = log.args[0] as string;
            const value   = log.args[1] as bigint;
            const typeId  = log.args[2] as string;
            const type    = classifyTypeId(typeId, value);
            const key     = `${log.transactionHash}-${log.index}`;
            return {
              key,
              blockNumber: log.blockNumber,
              from,
              value,
              typeId,
              type,
              amount: type === 'lyx' ? ethers.formatEther(value) : undefined,
            };
          });

        setNotifications(parsed);
      } catch {
        if (!cancelled) setError('rpc');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [upAddress, chainId]);

  return { notifications, unreadCount, loading, error, readSet, markAllRead, markRead };
}
