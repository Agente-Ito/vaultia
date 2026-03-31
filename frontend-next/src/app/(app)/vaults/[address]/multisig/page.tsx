'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useMultisigController } from '@/hooks/useMultisigController';
import MultisigProposalCard from '@/components/multisig/MultisigProposalCard';
import ProposeActionModal from '@/components/multisig/ProposeActionModal';
import { AddressDisplay } from '@/components/common/AddressDisplay';

/**
 * /vaults/[address]/multisig
 *
 * Reads the MultisigController address from the URL search param ?ms=0x…
 * or from localStorage under key `multisig:${address}`.
 *
 * Example URL: /vaults/0xSAFE/multisig?ms=0xMULTISIG
 */
export default function MultisigPage() {
  const { t } = useI18n();
  const params = useParams();
  const safeAddress = Array.isArray(params?.address) ? params.address[0] : params?.address ?? '';

  // Determine multisig controller address from URL or localStorage
  const multisigAddress = (() => {
    if (typeof window === 'undefined') return null;
    const sp = new URLSearchParams(window.location.search);
    const fromQuery = sp.get('ms');
    if (fromQuery) return fromQuery;
    try {
      return localStorage.getItem(`multisig:${safeAddress.toLowerCase()}`);
    } catch {
      return null;
    }
  })();

  const { info, proposals, loading, error, reload } = useMultisigController(multisigAddress);
  const [proposeOpen, setProposeOpen] = useState(false);

  if (!multisigAddress) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <Link href="/vaults" className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            ← Vaults
          </Link>
        </div>
        <div
          className="rounded-2xl p-8 text-center space-y-3"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('multisig.page.no_controller')}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Tip: Add <code className="px-1 rounded" style={{ background: 'var(--card-mid)' }}>?ms=0x…</code> to the URL to specify the controller address.
          </p>
        </div>
      </div>
    );
  }

  const pendingProposals = proposals.filter((p) => p.status === 0);
  const historicalProposals = proposals.filter((p) => p.status !== 0);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/vaults" className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              ← Vaults
            </Link>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            {t('multisig.page.title')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {t('multisig.page.subtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setProposeOpen(true)}
          className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--primary)', color: '#fff' }}
        >
          {t('multisig.btn.new_proposal')}
        </button>
      </div>

      {/* Controller info */}
      {info && (
        <div
          className="rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <InfoStat label="Controller" value={<AddressDisplay address={info.address} />} />
          <InfoStat label={t('multisig.info.threshold'
            .replace('{count}', String(info.threshold))
            .replace('{total}', String(info.signers.length)) as Parameters<typeof t>[0])} value={`${info.threshold} / ${info.signers.length}`} />
          <InfoStat label="Timelock" value={info.timeLock === 0 ? 'None' : `${Math.round(info.timeLock / 3600)}h`} />
          <InfoStat label="Nonce" value={String(info.nonce)} />
        </div>
      )}

      {/* Signers */}
      {info && info.signers.length > 0 && (
        <div
          className="rounded-2xl p-5 space-y-3"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {t('settings.controller.signers')} ({info.signers.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {info.signers.map((s) => (
              <span
                key={s}
                className="rounded-full px-3 py-1 text-xs font-mono"
                style={{ background: 'var(--card-mid)', color: 'var(--text-muted)' }}
              >
                <AddressDisplay address={s} />
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Loading / Error */}
      {loading && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('multisig.page.loading')}</p>
      )}
      {error && (
        <p className="text-sm" style={{ color: 'var(--blocked)' }}>{error}</p>
      )}

      {/* Pending proposals */}
      {!loading && pendingProposals.length > 0 && info && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {t('multisig.status.pending')} ({pendingProposals.length})
          </p>
          {pendingProposals.map((p) => (
            <MultisigProposalCard key={p.id} proposal={p} info={info} onRefresh={reload} />
          ))}
        </div>
      )}

      {/* Historical */}
      {!loading && historicalProposals.length > 0 && info && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            History ({historicalProposals.length})
          </p>
          {historicalProposals.map((p) => (
            <MultisigProposalCard key={p.id} proposal={p} info={info} onRefresh={reload} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && proposals.length === 0 && !error && (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('multisig.page.empty')}</p>
        </div>
      )}

      {/* Propose modal */}
      {proposeOpen && info && (
        <ProposeActionModal
          multisigAddress={info.address}
          info={info}
          onClose={() => setProposeOpen(false)}
          onSuccess={() => {
            setProposeOpen(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function InfoStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>{value}</p>
    </div>
  );
}
