'use client';

import Link from 'next/link';
import { ethers } from 'ethers';
import { useI18n } from '@/context/I18nContext';
import { useMultisigController } from '@/hooks/useMultisigController';
import { AddressDisplay } from '@/components/common/AddressDisplay';

interface Props {
  safeAddress: string;
  /** Address of the MultisigController for this vault, if known */
  multisigAddress?: string | null;
}

export default function ControllerCard({ safeAddress, multisigAddress }: Props) {
  const { t } = useI18n();
  const { info, loading } = useMultisigController(multisigAddress ?? null, { includeProposals: false });

  if (!multisigAddress || !ethers.isAddress(multisigAddress)) {
    return (
      <div
        className="rounded-2xl p-5 space-y-2"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {t('settings.controller.title')}
        </p>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ background: 'rgba(34,255,178,0.12)', color: 'var(--accent)' }}
          >
            {t('settings.controller.single')}
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('settings.controller.no_multisig')}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {t('settings.controller.title')}
        </p>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ background: 'rgba(34,255,178,0.12)', color: 'var(--accent)' }}
        >
          {t('settings.controller.multisig')}
        </span>
      </div>

      {loading && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      )}

      {info && !loading && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('settings.controller.threshold')}</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>
                {info.threshold} / {info.signers.length}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('settings.controller.timelock')}</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>
                {info.timeLock === 0 ? 'None' : `${Math.round(info.timeLock / 3600)}h`}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nonce</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>{info.nonce}</p>
            </div>
          </div>

          <div>
            <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('settings.controller.signers')} ({info.signers.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {info.signers.map((s) => (
                <span
                  key={s}
                  className="rounded-full px-2 py-0.5 text-xs font-mono"
                  style={{ background: 'var(--card-mid)', color: 'var(--text-muted)', fontSize: '11px' }}
                >
                  <AddressDisplay address={s} />
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      <Link
        href={`/vaults/${safeAddress}/multisig?ms=${multisigAddress}`}
        className="text-xs font-medium transition-opacity hover:opacity-80"
        style={{ color: 'var(--accent)' }}
      >
        {t('settings.controller.view_proposals')}
      </Link>
    </div>
  );
}
