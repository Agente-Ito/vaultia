'use client';

import Link from 'next/link';
import { ethers } from 'ethers';
import { useI18n } from '@/context/I18nContext';
import { useMultisigController } from '@/hooks/useMultisigController';

interface Props {
  safeAddress: string;
  multisigAddress?: string | null;
}

function formatTimelock(seconds: number, t: (key: string) => string) {
  if (seconds <= 0) return t('multisig.summary.no_timelock');
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export default function CompactMultisigSummary({ safeAddress, multisigAddress }: Props) {
  const { t } = useI18n();
  const { info, proposals, loading, signerStatus, matchedControllers } = useMultisigController(multisigAddress ?? null, { includeProposals: false });

  if (!multisigAddress || !ethers.isAddress(multisigAddress)) {
    return null;
  }

  const pendingCount = proposals.filter((proposal) => proposal.status === 0).length;
  const quorumReachedCount = proposals.filter((proposal) => proposal.status === 0 && proposal.hasQuorum).length;

  return (
    <div
      className="rounded-xl p-3 space-y-2"
      style={{ background: 'var(--card-mid)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {t('multisig.summary.title')}
        </p>
        <Link
          href={`/vaults/${safeAddress}/multisig?ms=${multisigAddress}`}
          className="text-xs font-medium transition-opacity hover:opacity-80"
          style={{ color: 'var(--accent)' }}
        >
          {t('multisig.summary.open')}
        </Link>
      </div>

      {loading && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('multisig.summary.loading')}
        </p>
      )}

      {info && !loading && (
        <>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--success)' }}>
              {t('multisig.summary.threshold')
                .replace('{threshold}', String(info.threshold))
                .replace('{total}', String(info.signers.length))}
            </span>
            {proposals.length > 0 ? (
              <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ background: pendingCount > 0 ? 'rgba(255,176,0,0.12)' : 'var(--card)', color: pendingCount > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                {t('multisig.summary.pending').replace('{count}', String(pendingCount))}
              </span>
            ) : null}
            {proposals.length > 0 && quorumReachedCount > 0 && (
              <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--success)' }}>
                {t('multisig.summary.quorum_ready').replace('{count}', String(quorumReachedCount))}
              </span>
            )}
            <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ background: 'var(--card)', color: 'var(--text-muted)' }}>
              {t('multisig.summary.timelock').replace('{value}', formatTimelock(info.timeLock, t))}
            </span>
            <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ background: signerStatus === 'direct' ? 'rgba(16,185,129,0.12)' : 'rgba(255,176,0,0.12)', color: signerStatus === 'direct' ? 'var(--success)' : 'var(--warning)' }}>
              {signerStatus === 'direct'
                ? t('multisig.summary.you_are_signer')
                : signerStatus === 'controller'
                  ? t('multisig.summary.controller_is_signer')
                  : t('multisig.summary.not_signer')}
            </span>
          </div>
          {signerStatus === 'controller' && matchedControllers.length > 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.summary.controller_signer_note').replace('{address}', matchedControllers[0])}
            </p>
          ) : null}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.summary.controller_address')}
            </p>
            <p className="text-xs font-mono break-all" style={{ color: 'var(--text-muted)' }}>
              {multisigAddress}
            </p>
          </div>
        </>
      )}
    </div>
  );
}