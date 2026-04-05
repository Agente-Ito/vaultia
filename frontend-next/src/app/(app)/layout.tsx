'use client';

import { AppShell } from '@/components/layout/AppShell';
import { Alert, AlertTitle, AlertDescription } from '@/components/common/Alert';
import { useWeb3 } from '@/context/Web3Context';
import { useI18n } from '@/context/I18nContext';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { account, chainId, connect, isRegistryConfigured, isWrongChain } = useWeb3();
  const { t } = useI18n();

  return (
    <AppShell account={account} chainId={chainId} onConnect={connect}>
      <>
        {isWrongChain && (
          <div className="px-lg pt-md">
            <Alert variant="error">
              <AlertTitle>{t('layout.wrong_chain.title')}</AlertTitle>
              <AlertDescription>
                {t('layout.wrong_chain.desc')} {chainId}.
              </AlertDescription>
            </Alert>
          </div>
        )}
        {!isRegistryConfigured && (
          <div className="px-lg pt-md">
            <Alert variant="warning">
              <AlertTitle>{t('layout.registry_not_configured.title')}</AlertTitle>
              <AlertDescription>
                {t('layout.registry_not_configured.desc')}{' '}
                <code className="font-mono text-xs bg-neutral-100 dark:bg-neutral-700 px-1 rounded">
                  NEXT_PUBLIC_REGISTRY_ADDRESS
                </code>{' '}
                <code className="font-mono text-xs bg-neutral-100 dark:bg-neutral-700 px-1 rounded">
                  .env.local
                </code>
              </AlertDescription>
            </Alert>
          </div>
        )}
        {children}
      </>
    </AppShell>
  );
}
