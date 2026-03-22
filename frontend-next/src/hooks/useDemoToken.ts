import { useState } from 'react';
import { Signer } from 'ethers';
import { getLSP7DemoTokenContract } from '@/lib/web3/contracts';

const DEMO_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_LUKSO_DEMO_TOKEN_ADDRESS ?? '';

interface UseDemoTokenResult {
  minting: boolean;
  success: boolean;
  error: string | null;
  demoTokenAddress: string;
  mintToVault: (vaultAddress: string, amount: bigint, signer: Signer) => Promise<void>;
  reset: () => void;
}

export function useDemoToken(): UseDemoTokenResult {
  const [minting, setMinting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mintToVault = async (vaultAddress: string, amount: bigint, signer: Signer) => {
    if (!DEMO_TOKEN_ADDRESS) {
      setError('Demo token not configured');
      return;
    }
    setMinting(true);
    setError(null);
    setSuccess(false);
    try {
      const contract = getLSP7DemoTokenContract(DEMO_TOKEN_ADDRESS, signer);
      const tx = await contract.mint(vaultAddress, amount);
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
  };

  return { minting, success, error, demoTokenAddress: DEMO_TOKEN_ADDRESS, mintToVault, reset };
}
