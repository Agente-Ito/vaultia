'use client';

import { ethers, parseUnits } from 'ethers';
import { Button } from '@/components/common/Button';
import { useI18n } from '@/context/I18nContext';
import { useTestToken } from '@/hooks/useTestToken';

interface VaultFundingActionsProps {
  vaultAddress: string;
  budgetToken?: string;
  signer?: ethers.Signer | null;
  compact?: boolean;
  showTitle?: boolean;
}

const FAUCET_URL = 'https://faucet.testnet.lukso.network';
const EXPLORER_BASE = 'https://explorer.execution.testnet.lukso.network/tx/';

function shortenHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

export function VaultFundingActions({
  vaultAddress,
  budgetToken,
  signer,
  compact = false,
  showTitle = true,
}: VaultFundingActionsProps) {
  const { t } = useI18n();
  const { minting, success, error, txHash, testTokenAddress, mintToVault } = useTestToken();

  const normalizedBudgetToken = budgetToken?.trim().toLowerCase() ?? '';
  const normalizedTestToken = testTokenAddress.trim().toLowerCase();
  const isTestTokenVault = Boolean(
    normalizedBudgetToken && normalizedTestToken && normalizedBudgetToken === normalizedTestToken
  );

  return (
    <div
      className={compact ? 'space-y-2 rounded-xl p-3' : 'space-y-3 rounded-2xl p-4'}
      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
    >
      {showTitle ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {t('vaults.funding.title')}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {isTestTokenVault ? t('vaults.funding.test_token_note') : t('vaults.funding.native_note')}
          </p>
        </div>
      ) : null}

      {isTestTokenVault ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!signer || minting || success}
              onClick={() => signer && mintToVault(vaultAddress, parseUnits('1000', 18), signer)}
            >
              {minting
                ? t('vaults.funding.test_token_pending')
                : success
                  ? t('vaults.card.test_tokens_success')
                  : t('vaults.card.get_test_tokens')}
            </Button>
            <a
              href={FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center justify-center rounded px-3 text-xs font-light transition-opacity hover:opacity-80"
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}
            >
              {t('vaults.card.fund_faucet')}
            </a>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('vaults.funding.send_to_address')}
          </p>
          <p className="text-xs font-mono break-all" style={{ color: 'var(--text)' }}>
            {vaultAddress}
          </p>
          {txHash ? (
            <a
              href={`${EXPLORER_BASE}${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs hover:underline"
              style={{ color: 'var(--primary)' }}
            >
              {t('vaults.funding.test_token_tx').replace('{hash}', shortenHash(txHash))}
            </a>
          ) : null}
          {error ? (
            <p className="text-xs" style={{ color: 'var(--blocked)' }}>
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <a
              href={FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center justify-center rounded px-3 text-xs font-light transition-opacity hover:opacity-80"
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}
            >
              {t('vaults.funding.native_cta')}
            </a>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('vaults.funding.send_to_address')}
          </p>
          <p className="text-xs font-mono break-all" style={{ color: 'var(--text)' }}>
            {vaultAddress}
          </p>
        </>
      )}
    </div>
  );
}