'use client';

import { ethers } from 'ethers';
import { Button } from '@/components/common/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VaultFundingActions } from '@/components/vaults/VaultFundingActions';
import { useI18n } from '@/context/I18nContext';
import type { DeployedVaultSummary } from '@/lib/web3/deployVault';

interface VaultDeployResultDialogProps {
  open: boolean;
  mode: 'success' | 'error';
  onOpenChange: (open: boolean) => void;
  deployed?: DeployedVaultSummary | null;
  ownershipWarnings?: string[];
  errorMessage?: string | null;
  txHash?: string | null;
  budgetToken?: string;
  signer?: ethers.Signer | null;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  primaryLabel?: string;
  secondaryLabel?: string;
}

export function VaultDeployResultDialog({
  open,
  mode,
  onOpenChange,
  deployed,
  ownershipWarnings = [],
  errorMessage,
  txHash,
  budgetToken,
  signer,
  onPrimaryAction,
  onSecondaryAction,
  primaryLabel,
  secondaryLabel,
}: VaultDeployResultDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'success' ? t('deploy_result.success.title') : t('deploy_result.error.title')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'success' ? t('deploy_result.success.desc') : t('deploy_result.error.desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-2">
          {mode === 'success' && deployed ? (
            <>
              <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    {t('create.success.contract.vault')}
                  </p>
                  <p className="mt-1 text-sm font-mono break-all" style={{ color: 'var(--text)' }}>{deployed.safe}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                      {t('create.success.contract.key_manager')}
                    </p>
                    <p className="mt-1 text-xs font-mono break-all" style={{ color: 'var(--text)' }}>{deployed.keyManager}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                      {t('create.success.contract.policy_engine')}
                    </p>
                    <p className="mt-1 text-xs font-mono break-all" style={{ color: 'var(--text)' }}>{deployed.policyEngine}</p>
                  </div>
                </div>
                {txHash ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('deploy_result.tx_hash').replace('{hash}', txHash)}
                  </p>
                ) : null}
              </div>

              <div
                className="rounded-2xl px-4 py-3 text-xs"
                style={{ background: 'rgba(34,255,178,0.07)', border: '1px solid rgba(34,255,178,0.2)', color: 'var(--text-muted)' }}
              >
                {t('create.success.ownership.desc')}
              </div>

              {ownershipWarnings.length > 0 ? (
                <div
                  className="rounded-2xl px-4 py-3 text-xs space-y-2"
                  style={{ background: 'rgba(255,176,0,0.08)', border: '1px solid rgba(255,176,0,0.22)', color: 'var(--text-muted)' }}
                >
                  <p className="font-medium" style={{ color: 'var(--text)' }}>
                    {t('deploy_result.warning.title')}
                  </p>
                  {ownershipWarnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}

              <VaultFundingActions
                vaultAddress={deployed.safe}
                budgetToken={budgetToken}
                signer={signer}
              />
            </>
          ) : (
            <div className="rounded-2xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--blocked)' }}>
                {t('deploy_result.error.label')}
              </p>
              <p className="mt-2 text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--text)' }}>
                {errorMessage}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {secondaryLabel && onSecondaryAction ? (
            <Button variant="secondary" onClick={onSecondaryAction}>{secondaryLabel}</Button>
          ) : null}
          {primaryLabel && onPrimaryAction ? (
            <Button onClick={onPrimaryAction}>{primaryLabel}</Button>
          ) : (
            <Button onClick={() => onOpenChange(false)}>{t('deploy_result.close')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}