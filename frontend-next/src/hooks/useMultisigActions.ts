'use client';

import { useCallback, useState } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '@/context/Web3Context';

const MULTISIG_WRITE_ABI = [
  'function propose(address target, uint256 value, bytes calldata data, uint256 deadline, uint256 timelockOverride, uint8 executorMode) external returns (bytes32 id)',
  'function approve(bytes32 id) external',
  'function unapprove(bytes32 id) external',
  'function revoke(bytes32 id) external',
  'function execute(bytes32 id) external',
  'function previewIntentHash(address target, uint256 value, bytes calldata data, uint8 executorMode, uint256 deadline, uint256 timelockOverride) external view returns (bytes32 intentHash, bytes32 proposalId, uint256 currentNonce)',
];

export function useMultisigActions(multisigAddress: string | null) {
  const { signer } = useWeb3();
  const [pending, setPending] = useState<string | null>(null); // 'propose' | 'approve' | etc.
  const [error, setError] = useState<string | null>(null);

  const getContract = useCallback(() => {
    if (!signer || !multisigAddress || !ethers.isAddress(multisigAddress)) return null;
    return new ethers.Contract(multisigAddress, MULTISIG_WRITE_ABI, signer);
  }, [signer, multisigAddress]);

  const propose = useCallback(
    async (
      target: string,
      value: bigint,
      data: string,
      deadline: number,
      timelockOverride: number,
      executorMode: number,
    ): Promise<string | null> => {
      const ms = getContract();
      if (!ms) { setError('Not connected'); return null; }
      setPending('propose');
      setError(null);
      try {
        const tx = await ms.propose(target, value, data, deadline, timelockOverride, executorMode);
        const receipt = await tx.wait();
        // Extract proposal id from Proposed event
        const iface = new ethers.Interface([
          'event Proposed(bytes32 indexed id, address indexed proposer, address indexed target, uint256 value, uint256 deadline, bytes32 intentHash)',
        ]);
        for (const log of receipt.logs) {
          try { const parsed = iface.parseLog(log); if (parsed?.name === 'Proposed') return parsed.args.id as string; } catch { /* skip */ }
        }
        return null;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'propose failed');
        return null;
      } finally {
        setPending(null);
      }
    },
    [getContract],
  );

  const approve = useCallback(async (id: string) => {
    const ms = getContract();
    if (!ms) { setError('Not connected'); return false; }
    setPending('approve');
    setError(null);
    try {
      const tx = await ms.approve(id);
      await tx.wait();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'approve failed');
      return false;
    } finally {
      setPending(null);
    }
  }, [getContract]);

  const unapprove = useCallback(async (id: string) => {
    const ms = getContract();
    if (!ms) { setError('Not connected'); return false; }
    setPending('unapprove');
    setError(null);
    try {
      const tx = await ms.unapprove(id);
      await tx.wait();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unapprove failed');
      return false;
    } finally {
      setPending(null);
    }
  }, [getContract]);

  const revoke = useCallback(async (id: string) => {
    const ms = getContract();
    if (!ms) { setError('Not connected'); return false; }
    setPending('revoke');
    setError(null);
    try {
      const tx = await ms.revoke(id);
      await tx.wait();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'revoke failed');
      return false;
    } finally {
      setPending(null);
    }
  }, [getContract]);

  const execute = useCallback(async (id: string) => {
    const ms = getContract();
    if (!ms) { setError('Not connected'); return false; }
    setPending('execute');
    setError(null);
    try {
      const tx = await ms.execute(id);
      await tx.wait();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'execute failed');
      return false;
    } finally {
      setPending(null);
    }
  }, [getContract]);

  const previewIntentHash = useCallback(
    async (
      target: string,
      value: bigint,
      data: string,
      executorMode: number,
      deadline: number,
      timelockOverride: number,
    ): Promise<{ intentHash: string; proposalId: string; currentNonce: number } | null> => {
      const ms = getContract();
      if (!ms) return null;
      try {
        const result = await ms.previewIntentHash(target, value, data, executorMode, deadline, timelockOverride);
        return {
          intentHash: result[0] as string,
          proposalId: result[1] as string,
          currentNonce: Number(result[2]),
        };
      } catch {
        return null;
      }
    },
    [getContract],
  );

  return { propose, approve, unapprove, revoke, execute, previewIntentHash, pending, error };
}
