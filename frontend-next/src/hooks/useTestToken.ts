import { useState } from 'react';
import { Signer } from 'ethers';
import { getLSP7DemoTokenContract } from '@/lib/web3/contracts';

const TEST_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_LUKSO_DEMO_TOKEN_ADDRESS ?? '';

interface UseTestTokenResult {
  minting: boolean;
  success: boolean;
  error: string | null;
  txHash: string | null;
  testTokenAddress: string;
  mintToVault: (vaultAddress: string, amount: bigint, signer: Signer) => Promise<void>;
  reset: () => void;
}

export function useTestToken(): UseTestTokenResult {
  const [minting, setMinting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const mintToVault = async (vaultAddress: string, amount: bigint, signer: Signer) => {
    if (!TEST_TOKEN_ADDRESS) {
      setError('Test token not configured');
      return;
    }
    setMinting(true);
    setError(null);
    setSuccess(false);
    setTxHash(null);
    try {
      const contract = getLSP7DemoTokenContract(TEST_TOKEN_ADDRESS, signer);
      const tx = await contract.mint(vaultAddress, amount);
      setTxHash(tx.hash);
      await tx.wait();
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMinting(false);
    }
  };

  const reset = () => {
    setMinting(false);
    setSuccess(false);
    setError(null);
    setTxHash(null);
  };

  return { minting, success, error, txHash, testTokenAddress: TEST_TOKEN_ADDRESS, mintToVault, reset };
}