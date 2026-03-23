'use client';

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { decodeRevertReason } from '@/lib/errorMap';
import {
  getBudgetPolicyContract,
  getMerchantPolicyContract,
  getExpirationPolicyContract,
} from '@/lib/web3/contracts';

export function useManageVaultPolicy() {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withUpdate = useCallback(async (fn: () => Promise<void>): Promise<boolean> => {
    setUpdating(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err: unknown) {
      setError(decodeRevertReason(err));
      return false;
    } finally {
      setUpdating(false);
    }
  }, []);

  const updateBudget = useCallback(
    (policyAddr: string, newBudget: bigint, signer: ethers.Signer) =>
      withUpdate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = getBudgetPolicyContract(policyAddr, signer) as any;
        await (await c.ownerSetBudget(newBudget)).wait();
      }),
    [withUpdate]
  );

  const addMerchants = useCallback(
    (policyAddr: string, addresses: string[], signer: ethers.Signer) =>
      withUpdate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = getMerchantPolicyContract(policyAddr, signer) as any;
        await (await c.addMerchants(addresses)).wait();
      }),
    [withUpdate]
  );

  const removeMerchant = useCallback(
    (policyAddr: string, address: string, signer: ethers.Signer) =>
      withUpdate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = getMerchantPolicyContract(policyAddr, signer) as any;
        await (await c.removeMerchant(address)).wait();
      }),
    [withUpdate]
  );

  const updateExpiration = useCallback(
    (policyAddr: string, timestamp: bigint, signer: ethers.Signer) =>
      withUpdate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = getExpirationPolicyContract(policyAddr, signer) as any;
        await (await c.setExpiration(timestamp)).wait();
      }),
    [withUpdate]
  );

  return { updating, error, updateBudget, addMerchants, removeMerchant, updateExpiration };
}
