'use client';

import { useEffect, useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '@/context/Web3Context';
import { AP_ARRAY_KEY, apArrayElementKey } from '@/lib/missions/permissionCompiler';

const MULTISIG_ABI = [
  // View
  'function vault() external view returns (address)',
  'function keyManager() external view returns (address)',
  'function threshold() external view returns (uint256)',
  'function timeLock() external view returns (uint256)',
  'function nonce() external view returns (uint256)',
  'function isSigner(address) external view returns (bool)',
  'function getSigners() external view returns (address[])',
  'function hasQuorum(bytes32 id) external view returns (bool)',
  'function approved(bytes32 id, address signer) external view returns (bool)',
  'function previewIntentHash(address target, uint256 value, bytes calldata data, uint8 executorMode, uint256 deadline, uint256 timelockOverride) external view returns (bytes32 intentHash, bytes32 proposalId, uint256 currentNonce)',
  // Struct getter (no named returns, so we decode manually)
  'function proposals(bytes32 id) external view returns (address proposer, address target, uint256 value, bytes data, uint256 deadline, uint256 timelockEnd, uint256 timelockOverride, uint8 executorMode, bytes32 intentHash, uint256 proposalNonce, uint256 approvalCount, uint8 status)',
  // Write
  'function propose(address target, uint256 value, bytes calldata data, uint256 deadline, uint256 timelockOverride, uint8 executorMode) external returns (bytes32 id)',
  'function approve(bytes32 id) external',
  'function unapprove(bytes32 id) external',
  'function revoke(bytes32 id) external',
  'function execute(bytes32 id) external',
  // Events — v2: added timelockEnd between deadline and executorMode
  // Nodes running old contract binary will emit without timelockEnd; we fall back to topics[1] for the id.
  'event Proposed(bytes32 indexed id, address indexed proposer, address target, uint256 value, uint256 deadline, uint256 timelockEnd, uint8 executorMode)',
  'event Approved(bytes32 indexed id, address indexed signer)',
  'event Unapproved(bytes32 indexed id, address indexed signer)',
  'event Revoked(bytes32 indexed id, address indexed proposer)',
  'event Executed(bytes32 indexed id, address indexed executor)',
];

export interface MultisigProposal {
  id: string;
  proposer: string;
  target: string;
  value: bigint;
  data: string;
  deadline: number;
  timelockEnd: number;
  timelockOverride: number;
  executorMode: number; // 0 = ONLY_OWNER, 1 = ANY_SIGNER
  intentHash: string;
  proposalNonce: number;
  approvalCount: number;
  hasQuorum: boolean;
  status: number; // 0 = PENDING, 1 = EXECUTED, 2 = CANCELLED
}

export interface MultisigInfo {
  address: string;
  signers: string[];
  threshold: number;
  timeLock: number;
  nonce: number;
}

export type MultisigSignerStatus = 'direct' | 'controller' | 'none';

interface UseMultisigControllerOptions {
  includeProposals?: boolean;
  proposalLookbackBlocks?: number;
}

export function useMultisigController(multisigAddress: string | null, options: UseMultisigControllerOptions = {}) {
  const { signer, account } = useWeb3();
  const [info, setInfo] = useState<MultisigInfo | null>(null);
  const [proposals, setProposals] = useState<MultisigProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [signerStatus, setSignerStatus] = useState<MultisigSignerStatus>('none');
  const [matchedControllers, setMatchedControllers] = useState<string[]>([]);

  const includeProposals = options.includeProposals ?? true;
  const proposalLookbackBlocks = options.proposalLookbackBlocks ?? 10000;

  const load = useCallback(async () => {
    if (!multisigAddress || !ethers.isAddress(multisigAddress)) {
      setInfo(null);
      setProposals([]);
      setSignerStatus('none');
      setMatchedControllers([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const provider = signer?.provider ?? ethers.getDefaultProvider();
      const ms = new ethers.Contract(multisigAddress, MULTISIG_ABI, provider);

      const [signers, threshold, timeLock, nonce] = await Promise.all([
        ms.getSigners() as Promise<string[]>,
        ms.threshold() as Promise<bigint>,
        ms.timeLock() as Promise<bigint>,
        ms.nonce() as Promise<bigint>,
      ]);

      const resolvedInfo: MultisigInfo = {
        address: multisigAddress,
        signers,
        threshold: Number(threshold),
        timeLock: Number(timeLock),
        nonce: Number(nonce),
      };
      setInfo(resolvedInfo);

      if (account) {
        const normalizedAccount = account.toLowerCase();
        const normalizedSigners = new Set(signers.map((entry) => entry.toLowerCase()));
        if (normalizedSigners.has(normalizedAccount)) {
          setSignerStatus('direct');
          setMatchedControllers([]);
        } else {
          const controllers = await readProfileControllers(account, provider);
          const matches = controllers.filter((controller) => normalizedSigners.has(controller.toLowerCase()));
          setSignerStatus(matches.length > 0 ? 'controller' : 'none');
          setMatchedControllers(matches);
        }
      } else {
        setSignerStatus('none');
        setMatchedControllers([]);
      }

      // Proposals are loaded separately so they don't block the info display.
      if (includeProposals) {
        setProposalsLoading(true);
        setProposalsError(null);
        loadProposalsAsync(ms, provider, proposalLookbackBlocks)
          .then((list) => setProposals(list))
          .catch((err: unknown) => setProposalsError(err instanceof Error ? err.message : 'Could not load proposals'))
          .finally(() => setProposalsLoading(false));
      } else {
        setProposals([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load multisig data');
    } finally {
      setLoading(false);
    }
  }, [account, includeProposals, multisigAddress, proposalLookbackBlocks, signer]);

  useEffect(() => { load(); }, [load]);

  return { info, proposals, loading, proposalsLoading, proposalsError, error, reload: load, signerStatus, matchedControllers };
}

async function loadProposalsAsync(ms: ethers.Contract, provider: ethers.Provider, lookbackBlocks: number): Promise<MultisigProposal[]> {
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - lookbackBlocks);
  const logs = await loadRecentProposalLogs(ms, fromBlock, latestBlock);

  const ids = [...new Set(logs.map((l) => {
    if ('args' in l && (l as ethers.EventLog).args?.id) {
      return (l as ethers.EventLog).args.id as string;
    }
    const raw = l as ethers.Log;
    return raw.topics?.[1] ?? null;
  }).filter((id): id is string => typeof id === 'string'))];

  const proposalList = await Promise.all(
    ids.map(async (id): Promise<MultisigProposal | null> => {
      try {
        const [p, hasQuorum] = await Promise.all([
          ms.proposals(id),
          ms.hasQuorum(id) as Promise<boolean>,
        ]);
        return {
          id,
          proposer: p[0],
          target: p[1],
          value: p[2],
          data: p[3],
          deadline: Number(p[4]),
          timelockEnd: Number(p[5]),
          timelockOverride: Number(p[6]),
          executorMode: Number(p[7]),
          intentHash: p[8],
          proposalNonce: Number(p[9]),
          approvalCount: Number(p[10]),
          hasQuorum,
          status: Number(p[11]),
        };
      } catch {
        return null;
      }
    }),
  );

  return proposalList.filter(Boolean) as MultisigProposal[];
}

async function readProfileControllers(profileAddress: string, provider: ethers.Provider): Promise<string[]> {
  const erc725 = new ethers.Contract(profileAddress, ['function getData(bytes32 dataKey) view returns (bytes memory)'], provider);

  let count = 0;
  try {
    const raw: string = await erc725.getData(AP_ARRAY_KEY);
    if (raw && raw !== '0x') {
      count = Number(BigInt(raw));
    }
  } catch {
    return [];
  }

  if (count <= 0) return [];

  const limit = Math.min(count, 30);
  const keys = Array.from({ length: limit }, (_, index) => apArrayElementKey(index));
  const values = await Promise.all(keys.map((key) => erc725.getData(key).catch(() => '0x')));

  return values
    .map((value: string) => {
      const raw = value.replace(/^0x/, '');
      if (raw.length < 40) return null;
      try {
        return ethers.getAddress(`0x${raw.slice(-40)}`);
      } catch {
        return null;
      }
    })
    .filter((value): value is string => value !== null);
}

async function loadRecentProposalLogs(ms: ethers.Contract, fromBlock: number, latestBlock: number) {
  const collected: Array<ethers.EventLog | ethers.Log> = [];
  const chunkSize = 500;

  for (let start = fromBlock; start <= latestBlock; start += chunkSize) {
    const end = Math.min(latestBlock, start + chunkSize - 1);
    try {
      const logs = await ms.queryFilter(ms.filters.Proposed(), start, end);
      collected.push(...logs);
    } catch {
      // Skip chunks that time out — show what loaded
    }
  }

  return collected;
}
