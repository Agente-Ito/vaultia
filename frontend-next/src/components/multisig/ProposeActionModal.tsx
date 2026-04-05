'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { ethers } from 'ethers';
import { useI18n } from '@/context/I18nContext';
import { useMultisigActions } from '@/hooks/useMultisigActions';
import type { MultisigInfo } from '@/hooks/useMultisigController';

const inputClass = 'w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none';
const inputStyle = {
  background: 'var(--card-mid)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
};

const EXECUTOR_MODE = { ONLY_OWNER: 0, ANY_SIGNER: 1 } as const;

// ─── Proposal templates ────────────────────────────────────────────────────────
const TEMPLATES = [
  { key: 'lyx',      target: '', value: '', data: '0x', executorMode: EXECUTOR_MODE.ANY_SIGNER },
  { key: 'lsp7',     target: '', value: '0', data: '0x', executorMode: EXECUTOR_MODE.ANY_SIGNER },
  { key: 'merchant', target: '', value: '0', data: '0x', executorMode: EXECUTOR_MODE.ONLY_OWNER },
  { key: 'limits',   target: '', value: '0', data: '0x', executorMode: EXECUTOR_MODE.ONLY_OWNER },
  { key: 'signers',  target: '', value: '0', data: '0x', executorMode: EXECUTOR_MODE.ONLY_OWNER },
  { key: 'timelock', target: '', value: '0', data: '0x', executorMode: EXECUTOR_MODE.ANY_SIGNER },
] as const;

const SAFE_AGENT_TRANSFER_ABI = [
  'function agentTransferToken(address token, address to, uint256 amount, bool allowNonLSP1Recipient, bytes tokenData) external',
];

const MULTISIG_TEMPLATE_ABI = [
  'function selfCall(bytes calldata data) external',
  'function updateTimelock(uint256 newDelay) external',
];

interface Props {
  multisigAddress: string;
  safeAddress: string;
  info: MultisigInfo;
  onClose: () => void;
  onSuccess: (proposalId: string) => void;
}

export default function ProposeActionModal({ multisigAddress, safeAddress, onClose, onSuccess }: Omit<Props, 'info'> & { info?: MultisigInfo }) {
  const { t } = useI18n();
  const actions = useMultisigActions(multisigAddress);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const safeInterface = useMemo(() => new ethers.Interface(SAFE_AGENT_TRANSFER_ABI), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const multisigInterface = useMemo(() => new ethers.Interface(MULTISIG_TEMPLATE_ABI), []);

  const [target, setTarget]                   = useState('');
  const [value, setValue]                     = useState('0');
  const [data, setData]                       = useState('0x');
  const [executorMode, setExecutorMode]       = useState<number>(EXECUTOR_MODE.ANY_SIGNER);
  const [deadlineHours, setDeadlineHours]     = useState('72');
  const [timelockOverride, setTimelockOverride] = useState('0');
  const [previewHash, setPreviewHash]         = useState<string | null>(null);
  const [error, setError]                     = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate]   = useState<(typeof TEMPLATES)[number]['key'] | null>(null);
  const [lsp7TokenAddress, setLsp7TokenAddress] = useState('');
  const [lsp7Recipient, setLsp7Recipient] = useState('');
  const [lsp7Amount, setLsp7Amount] = useState('');
  const [timelockDelay, setTimelockDelay] = useState('0');
  const [showRawCalldata, setShowRawCalldata] = useState(false);

  const applyTemplate = (tpl: typeof TEMPLATES[number]) => {
    setActiveTemplate(tpl.key);
    setValue(tpl.value);
    setData(tpl.data);
    setExecutorMode(tpl.executorMode);
    if (tpl.key === 'lsp7') {
      setTarget(safeAddress);
      return;
    }
    if (tpl.key === 'timelock') {
      setTarget(multisigAddress);
      return;
    }
    if (tpl.target) setTarget(tpl.target);
  };

  useEffect(() => {
    if (activeTemplate !== 'lsp7') return;
    if (!ethers.isAddress(safeAddress) || !ethers.isAddress(lsp7TokenAddress) || !ethers.isAddress(lsp7Recipient) || !lsp7Amount) {
      setData('0x');
      return;
    }

    try {
      const encoded = safeInterface.encodeFunctionData('agentTransferToken', [
        lsp7TokenAddress,
        lsp7Recipient,
        ethers.parseEther(lsp7Amount),
        true,
        '0x',
      ]);
      setTarget(safeAddress);
      setValue('0');
      setData(encoded);
    } catch {
      setData('0x');
    }
  }, [activeTemplate, lsp7Amount, lsp7Recipient, lsp7TokenAddress, safeAddress]);

  useEffect(() => {
    if (activeTemplate !== 'timelock') return;
    const parsed = parseInt(timelockDelay, 10);
    if (isNaN(parsed) || parsed < 0) {
      setData('0x');
      return;
    }

    try {
      const updateTimelockData = multisigInterface.encodeFunctionData('updateTimelock', [parsed]);
      const selfCallData = multisigInterface.encodeFunctionData('selfCall', [updateTimelockData]);
      setTarget(multisigAddress);
      setValue('0');
      setData(selfCallData);
      setExecutorMode(EXECUTOR_MODE.ANY_SIGNER);
    } catch {
      setData('0x');
    }
  }, [activeTemplate, multisigAddress, timelockDelay]);

  const handlePreview = useCallback(async () => {
    if (!ethers.isAddress(target)) { setError('Invalid target address'); return; }
    setError(null);
    const deadline = Math.floor(Date.now() / 1000) + parseFloat(deadlineHours) * 3600;
    const result = await actions.previewIntentHash(
      target,
      ethers.parseEther(value || '0'),
      data || '0x',
      executorMode,
      Math.floor(deadline),
      parseInt(timelockOverride, 10) || 0,
    );
    if (result) {
      setPreviewHash(result.proposalId);
    }
  }, [target, value, data, executorMode, deadlineHours, timelockOverride, actions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ethers.isAddress(target)) { setError('Invalid target address'); return; }
    setError(null);

    const deadline = Math.floor(Date.now() / 1000) + parseFloat(deadlineHours) * 3600;
    const id = await actions.propose(
      target,
      ethers.parseEther(value || '0'),
      data || '0x',
      Math.floor(deadline),
      parseInt(timelockOverride, 10) || 0,
      executorMode,
    );

    if (id) {
      onSuccess(id);
    } else if (actions.error) {
      setError(actions.error);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 space-y-5 overflow-y-auto max-h-[90vh]"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            {t('multisig.propose.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-2 py-1 rounded-lg"
            style={{ color: 'var(--text-muted)', background: 'var(--card-mid)' }}
          >
            ✕
          </button>
        </div>

        {/* Templates */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
            Templates
          </p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.key}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={{ background: 'var(--card-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                {t(`multisig.propose.template.${tpl.key}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
        </div>

        {activeTemplate === 'lsp7' && (
          <div className="grid grid-cols-1 gap-3 rounded-xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                LSP7 token
              </label>
              <input
                className={`${inputClass} font-mono`}
                style={inputStyle}
                value={lsp7TokenAddress}
                onChange={(e) => setLsp7TokenAddress(e.target.value)}
                placeholder="0x…"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Recipient
              </label>
              <input
                className={`${inputClass} font-mono`}
                style={inputStyle}
                value={lsp7Recipient}
                onChange={(e) => setLsp7Recipient(e.target.value)}
                placeholder="0x…"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Amount
              </label>
              <input
                className={inputClass}
                style={inputStyle}
                type="number"
                min="0"
                step="0.0001"
                value={lsp7Amount}
                onChange={(e) => setLsp7Amount(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        )}

        {activeTemplate === 'timelock' && (
          <div className="rounded-xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
              New timelock delay (seconds)
            </label>
            <input
              className={inputClass}
              style={inputStyle}
              type="number"
              min="0"
              value={timelockDelay}
              onChange={(e) => setTimelockDelay(e.target.value)}
              placeholder="0"
            />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.propose.field.target')}
            </label>
            <input
              className={`${inputClass} font-mono`}
              style={inputStyle}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0x…"
              required
            />
          </div>

          {/* Value */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.propose.field.value')}
            </label>
            <input
              className={inputClass}
              style={inputStyle}
              type="number"
              min="0"
              step="0.0001"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>

          {/* Calldata — hidden by default, reveal with toggle */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                {t('multisig.propose.field.data')}
              </label>
              <button
                type="button"
                onClick={() => setShowRawCalldata((v) => !v)}
                className="text-xs font-medium transition-opacity hover:opacity-80"
                style={{ color: 'var(--accent)' }}
              >
                {showRawCalldata ? t('multisig.propose.calldata.hide') : t('multisig.propose.calldata.show')}
              </button>
            </div>

            {/* Human-readable summary */}
            {!showRawCalldata && (
              <div
                className="rounded-xl px-3 py-2.5 text-sm"
                style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                <CalldataSummary data={data} template={activeTemplate} />
              </div>
            )}

            {/* Raw hex input */}
            {showRawCalldata && (
              <input
                className={`${inputClass} font-mono`}
                style={inputStyle}
                value={data}
                onChange={(e) => setData(e.target.value)}
                placeholder="0x"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Deadline */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Deadline (hours from now)
              </label>
              <input
                className={inputClass}
                style={inputStyle}
                type="number"
                min="1"
                value={deadlineHours}
                onChange={(e) => setDeadlineHours(e.target.value)}
              />
            </div>

            {/* Timelock override */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                {t('multisig.propose.field.timelock_override')}
              </label>
              <input
                className={inputClass}
                style={inputStyle}
                type="number"
                min="0"
                value={timelockOverride}
                onChange={(e) => setTimelockOverride(e.target.value)}
                placeholder="0 = global"
              />
            </div>
          </div>

          {/* Executor mode */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('multisig.propose.field.executor_mode')}
            </label>
            <select
              className={inputClass}
              style={inputStyle}
              value={executorMode}
              onChange={(e) => setExecutorMode(Number(e.target.value))}
            >
              <option value={EXECUTOR_MODE.ANY_SIGNER}>{t('multisig.proposal.executor_any_signer')}</option>
              <option value={EXECUTOR_MODE.ONLY_OWNER}>{t('multisig.proposal.executor_owner')}</option>
            </select>
          </div>

          {/* Intent hash preview */}
          <div>
            <button
              type="button"
              onClick={handlePreview}
              className="text-xs font-medium transition-opacity hover:opacity-80"
              style={{ color: 'var(--accent)' }}
            >
              {t('multisig.propose.preview_hash')}
            </button>
            {previewHash && (
              <div
                className="mt-2 rounded-xl px-3 py-2 text-xs font-mono break-all"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                {previewHash}
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs" style={{ color: 'var(--blocked)' }}>{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'var(--card-mid)', color: 'var(--text-muted)' }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={actions.pending === 'propose'}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
            >
              {actions.pending === 'propose' ? '…' : t('multisig.propose.btn.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CalldataSummary({ data, template }: { data: string; template: string | null }) {
  if (!data || data === '0x') {
    return <span>No calldata — plain LYX transfer</span>;
  }

  if (template === 'lsp7') {
    return <span>LSP7 token transfer (auto-encoded)</span>;
  }
  if (template === 'timelock') {
    return <span>Update timelock delay (auto-encoded)</span>;
  }
  if (template === 'merchant') {
    return <span>Merchant whitelist update</span>;
  }
  if (template === 'limits') {
    return <span>Budget limits update</span>;
  }
  if (template === 'signers') {
    return <span>Signer rotation</span>;
  }

  // Custom calldata — show byte length only
  const byteLen = Math.floor((data.replace(/^0x/, '').length) / 2);
  return <span>Custom calldata · {byteLen} bytes</span>;
}
