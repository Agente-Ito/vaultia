'use client';

import { AppShell } from '@/components/layout/AppShell';
import { Alert, AlertTitle, AlertDescription } from '@/components/common/Alert';
import { useWeb3 } from '@/context/Web3Context';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { account, chainId, connect, isRegistryConfigured, isWrongChain } = useWeb3();

  return (
    <AppShell account={account} chainId={chainId} onConnect={connect}>
      {isWrongChain && (
        <div className="px-lg pt-md">
          <Alert variant="error">
            <AlertTitle>Wrong network</AlertTitle>
            <AlertDescription>
              Please switch your wallet to{' '}
              <strong>LUKSO Testnet</strong> (chain ID 4201) or{' '}
              <strong>LUKSO Mainnet</strong> (chain ID 42). Contract calls will
              fail on chain {chainId}.
            </AlertDescription>
          </Alert>
        </div>
      )}
      {!isRegistryConfigured && (
        <div className="px-lg pt-md">
          <Alert variant="warning">
            <AlertTitle>Registry contract not configured</AlertTitle>
            <AlertDescription>
              Set{' '}
              <code className="font-mono text-xs bg-neutral-100 dark:bg-neutral-700 px-1 rounded">
                NEXT_PUBLIC_REGISTRY_ADDRESS
              </code>{' '}
              in your{' '}
              <code className="font-mono text-xs bg-neutral-100 dark:bg-neutral-700 px-1 rounded">
                .env.local
              </code>{' '}
              to enable vault creation and management.
            </AlertDescription>
          </Alert>
        </div>
      )}
      {children}
    </AppShell>
  );
}
