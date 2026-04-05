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
  'function selfCall(bytes calldata data) external',
  'function updateSigners(address[] calldata newSigners, uint256 newThreshold) external',
  'function updateTimelock(uint256 newDelay) external',
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
        // Extract proposal id from Proposed event.
        // Try v2 ABI first (with timelockEnd); fall back to topics[1] for old nodes.
        const ifaceV2 = new ethers.Interface([
          'event Proposed(bytes32 indexed id, address indexed proposer, address target, uint256 value, uint256 deadline, uint256 timelockEnd, uint8 executorMode)',
        ]);
        for (const log of receipt.logs) {
          try {
            const parsed = ifaceV2.parseLog(log as { topics: string[]; data: string });
            if (parsed?.name === 'Proposed') return parsed.args.id as string;
          } catch { /* v2 parse failed — try raw topic fallback */ }
          // Fallback: id is always topics[1] (first indexed param of Proposed)
          if ((log as { topics?: string[] }).topics?.[0]) {
            const topic0 = ethers.id('Proposed(bytes32,address,address,uint256,uint256,uint256,uint8)');
            const topic0old = ethers.id('Proposed(bytes32,address,address,uint256,uint256,uint8)');
            const logTopics = (log as { topics: string[] }).topics;
            if (logTopics[0] === topic0 || logTopics[0] === topic0old) {
              return logTopics[1] as string;
            }
          }
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

  /**
   * Proposes a signer rotation via selfCall(updateSigners(...)).
   *
   * Call chain once executed:
   *   execute() → KM → Vault.execute(msAddr, selfCallData)
   *             → ms.selfCall(updateSignersData)
   *               → address(ms).call(updateSignersData) → ms.updateSigners(newSigners, threshold)
   *
   * Returns the proposal id on success, null on failure.
   */
  const rotateSigners = useCallback(
    async (
      newSigners: string[],
      newThreshold: number,
      timelockOverride = 0,
      deadlineHours = 72,
    ): Promise<string | null> => {
      const ms = getContract();
      if (!ms || !multisigAddress) { setError('Not connected'); return null; }
      setPending('rotateSigners');
      setError(null);
      try {
        const updateSignersCalldata = ms.interface.encodeFunctionData('updateSigners', [
          newSigners, newThreshold,
        ]);
        const selfCallData = ms.interface.encodeFunctionData('selfCall', [updateSignersCalldata]);
        const deadline = Math.floor(Date.now() / 1000) + deadlineHours * 3600;
        const tx = await ms.propose(
          multisigAddress,
          BigInt(0),
          selfCallData,
          Math.floor(deadline),
          timelockOverride,
          1, // ANY_SIGNER
        );
        const receipt = await tx.wait();
        const ifaceProposed = new ethers.Interface([
          'event Proposed(bytes32 indexed id, address indexed proposer, address target, uint256 value, uint256 deadline, uint256 timelockEnd, uint8 executorMode)',
        ]);
        for (const log of receipt.logs) {
          try {
            const parsed = ifaceProposed.parseLog(log as { topics: string[]; data: string });
            if (parsed?.name === 'Proposed') return parsed.args.id as string;
          } catch { /* skip */ }
          const logTopics = (log as { topics?: string[] }).topics;
          if (logTopics?.[0]) {
            const topic0 = ethers.id('Proposed(bytes32,address,address,uint256,uint256,uint256,uint8)');
            if (logTopics[0] === topic0) return logTopics[1] as string;
          }
        }
        return null;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'rotateSigners failed');
        return null;
      } finally {
        setPending(null);
      }
    },
    [getContract, multisigAddress],
  );

  /**
   * Proposes a timelock change via selfCall(updateTimelock(newDelaySecs)).
   * Returns the proposal id on success, null on failure.
   */
  const changeTimelock = useCallback(
    async (
      newDelaySecs: number,
      timelockOverride = 0,
      deadlineHours = 72,
    ): Promise<string | null> => {
      const ms = getContract();
      if (!ms || !multisigAddress) { setError('Not connected'); return null; }
      setPending('changeTimelock');
      setError(null);
      try {
        const updateTimelockCalldata = ms.interface.encodeFunctionData('updateTimelock', [newDelaySecs]);
        const selfCallData = ms.interface.encodeFunctionData('selfCall', [updateTimelockCalldata]);
        const deadline = Math.floor(Date.now() / 1000) + deadlineHours * 3600;
        const tx = await ms.propose(
          multisigAddress,
          BigInt(0),
          selfCallData,
          Math.floor(deadline),
          timelockOverride,
          1, // ANY_SIGNER
        );
        const receipt = await tx.wait();
        const ifaceProposed = new ethers.Interface([
          'event Proposed(bytes32 indexed id, address indexed proposer, address target, uint256 value, uint256 deadline, uint256 timelockEnd, uint8 executorMode)',
        ]);
        for (const log of receipt.logs) {
          try {
            const parsed = ifaceProposed.parseLog(log as { topics: string[]; data: string });
            if (parsed?.name === 'Proposed') return parsed.args.id as string;
          } catch { /* skip */ }
          const logTopics = (log as { topics?: string[] }).topics;
          if (logTopics?.[0]) {
            const topic0 = ethers.id('Proposed(bytes32,address,address,uint256,uint256,uint256,uint8)');
            if (logTopics[0] === topic0) return logTopics[1] as string;
          }
        }
        return null;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'changeTimelock failed');
        return null;
      } finally {
        setPending(null);
      }
    },
    [getContract, multisigAddress],
  );

  return { propose, approve, unapprove, revoke, execute, previewIntentHash, rotateSigners, changeTimelock, pending, error };
}
