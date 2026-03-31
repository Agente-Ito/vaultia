'use client';

import { useState } from 'react';
import { ethers } from 'ethers';
import { useI18n } from '@/context/I18nContext';
import type { MultisigProposal, MultisigInfo } from '@/hooks/useMultisigController';
import { useMultisigActions } from '@/hooks/useMultisigActions';
import { AddressDisplay } from '@/components/common/AddressDisplay';

const STATUS_LABELS = ['pending', 'executed', 'cancelled'] as const;
const STATUS_COLORS = ['var(--accent)', 'var(--success)', 'var(--blocked)'] as const;
const EXECUTOR_LABELS = ['executor_owner', 'executor_any_signer'] as const;

function shortId(id: string) {
  return id.slice(0, 10) + '…';
}

function formatDate(ts: number) {
  if (ts === 0) return '—';
  return new Date(ts * 1000).toLocaleString();
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-xs" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      <span className="text-xs font-medium text-right break-all" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

interface Props {
  proposal: MultisigProposal;
  info: MultisigInfo;
  onRefresh: () => void;
}

export default function MultisigProposalCard({ proposal, info, onRefresh }: Props) {
  const { t } = useI18n();
  const actions = useMultisigActions(info.address);
  const [expanded, setExpanded] = useState(false);

  // Note: connected address / owner check is handled in the parent for ONLY_OWNER guard

  const statusLabel = STATUS_LABELS[proposal.status] ?? 'pending';
  const statusColor = STATUS_COLORS[proposal.status] ?? STATUS_COLORS[0];
  const executorLabel = EXECUTOR_LABELS[proposal.executorMode] ?? EXECUTOR_LABELS[0];

  const now = Math.floor(Date.now() / 1000);
  const isPending = proposal.status === 0;
  const isExpired = isPending && proposal.deadline > 0 && now > proposal.deadline;
  const isTimelocked = isPending && proposal.timelockEnd > 0 && now < proposal.timelockEnd;
  const hasQuorum = proposal.approvalCount >= info.threshold;

  const canExecute = isPending && hasQuorum && !isTimelocked && !isExpired;

  const handleApprove = async () => {
    await actions.approve(proposal.id);
    onRefresh();
  };

  const handleUnapprove = async () => {
    await actions.unapprove(proposal.id);
    onRefresh();
  };

  const handleRevoke = async () => {
    await actions.revoke(proposal.id);
    onRefresh();
  };

  const handleExecute = async () => {
    await actions.execute(proposal.id);
    onRefresh();
  };

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{shortId(proposal.id)}</p>
          <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text)' }}>
            <AddressDisplay address={proposal.target} />
            {proposal.value > BigInt(0) && (
              <span className="ml-2 text-xs" style={{ color: 'var(--accent)' }}>
                {ethers.formatEther(proposal.value)} LYX
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ background: `color-mix(in srgb, ${statusColor} 15%, transparent)`, color: statusColor }}
          >
            {t(`multisig.status.${statusLabel}` as Parameters<typeof t>[0])}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="text-xs px-2 py-1 rounded-lg transition-colors"
            style={{ background: 'var(--card-mid)', color: 'var(--text-muted)' }}
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Approvals bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--card-mid)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (proposal.approvalCount / info.threshold) * 100)}%`,
              background: hasQuorum ? 'var(--success)' : 'var(--accent)',
            }}
          />
        </div>
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
          {proposal.approvalCount}/{info.threshold} {t('multisig.proposal.approvals')}
        </span>
      </div>

      {/* Status hints */}
      {isPending && isExpired && (
        <p className="text-xs" style={{ color: 'var(--blocked)' }}>Deadline expired</p>
      )}
      {isPending && isTimelocked && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Timelock ends: {formatDate(proposal.timelockEnd)}
        </p>
      )}
      {isPending && proposal.executorMode === 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          ⚠ {t('multisig.warn.only_owner')}
        </p>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="space-y-0 rounded-xl p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <DataRow label={t('multisig.proposal.proposer')} value={<AddressDisplay address={proposal.proposer} />} />
          <DataRow label={t('multisig.proposal.target')} value={<AddressDisplay address={proposal.target} />} />
          <DataRow label={t('multisig.proposal.value')} value={`${ethers.formatEther(proposal.value)} LYX`} />
          <DataRow label={t('multisig.proposal.deadline')} value={formatDate(proposal.deadline)} />
          <DataRow label={t('multisig.proposal.timelock')} value={formatDate(proposal.timelockEnd)} />
          <DataRow label={t('multisig.proposal.executor_mode')} value={t(`multisig.proposal.${executorLabel}` as Parameters<typeof t>[0])} />
          <DataRow label={t('multisig.proposal.intent_hash')} value={<span className="font-mono text-[10px]">{proposal.intentHash.slice(0, 18)}…</span>} />
          {proposal.data && proposal.data !== '0x' && (
            <DataRow label="Calldata" value={<span className="font-mono text-[10px] break-all">{proposal.data.slice(0, 50)}{proposal.data.length > 50 ? '…' : ''}</span>} />
          )}
        </div>
      )}

      {/* Actions */}
      {isPending && !isExpired && (
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label={t('multisig.btn.approve')}
            color="var(--accent)"
            loading={actions.pending === 'approve'}
            onClick={handleApprove}
          />
          <ActionButton
            label={t('multisig.btn.unapprove')}
            color="var(--text-muted)"
            loading={actions.pending === 'unapprove'}
            onClick={handleUnapprove}
          />
          <ActionButton
            label={t('multisig.btn.revoke')}
            color="var(--blocked)"
            loading={actions.pending === 'revoke'}
            onClick={handleRevoke}
          />
          {canExecute && (
            <ActionButton
              label={t('multisig.btn.execute')}
              color="var(--success)"
              loading={actions.pending === 'execute'}
              onClick={handleExecute}
            />
          )}
        </div>
      )}

      {actions.error && (
        <p className="text-xs" style={{ color: 'var(--blocked)' }}>{actions.error}</p>
      )}
    </div>
  );
}

function ActionButton({
  label, color, loading, onClick,
}: {
  label: string; color: string; loading: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-50"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)` }}
    >
      {loading ? '…' : label}
    </button>
  );
}
