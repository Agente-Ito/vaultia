'use client';

import { useEffect, useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '@/context/Web3Context';

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
  status: number; // 0 = PENDING, 1 = EXECUTED, 2 = CANCELLED
}

export interface MultisigInfo {
  address: string;
  signers: string[];
  threshold: number;
  timeLock: number;
  nonce: number;
}

export function useMultisigController(multisigAddress: string | null) {
  const { signer } = useWeb3();
  const [info, setInfo] = useState<MultisigInfo | null>(null);
  const [proposals, setProposals] = useState<MultisigProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!multisigAddress || !ethers.isAddress(multisigAddress)) {
      setInfo(null);
      setProposals([]);
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

      setInfo({
        address: multisigAddress,
        signers,
        threshold: Number(threshold),
        timeLock: Number(timeLock),
        nonce: Number(nonce),
      });

      // Fetch proposals via event logs.
      // Backward-compat: old nodes emit Proposed without timelockEnd — the id is always
      // topics[1] (first indexed param), so fall back to raw log topic if parse fails.
      const logs = await ms.queryFilter(ms.filters.Proposed(), -50000);

      const ids = [...new Set(logs.map((l) => {
        // Primary: ethers successfully parsed the log against the v2 ABI
        if ('args' in l && (l as ethers.EventLog).args?.id) {
          return (l as ethers.EventLog).args.id as string;
        }
        // Fallback: read id directly from topics[1] (hex bytes32)
        const raw = l as ethers.Log;
        return raw.topics?.[1] ?? null;
      }).filter((id): id is string => typeof id === 'string'))];

      const proposalList = await Promise.all(
        ids.map(async (id): Promise<MultisigProposal | null> => {
          try {
            const p = await ms.proposals(id);
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
              status: Number(p[11]),
            };
          } catch {
            return null;
          }
        }),
      );

      setProposals(proposalList.filter(Boolean) as MultisigProposal[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load multisig data');
    } finally {
      setLoading(false);
    }
  }, [multisigAddress, signer]);

  useEffect(() => { load(); }, [load]);

  return { info, proposals, loading, error, reload: load };
}
