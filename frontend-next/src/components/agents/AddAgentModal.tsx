'use client';

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/common/Button';
import { Alert, AlertDescription } from '@/components/common/Alert';
import { useAgents } from '@/hooks/useAgents';
import { useAddAgentToVault, AgentMode } from '@/hooks/useAddAgentToVault';
import { AddressDisplay } from '@/components/common/AddressDisplay';
import { useRemoveAgentFromVault } from '@/hooks/useRemoveAgentFromVault';
import { useI18n } from '@/context/I18nContext';
import type { AgentRecord } from './types';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type VaultChain = 'lukso' | 'base';

interface LuksoVaultRef {
  chain: 'lukso';
  vaultSafe: string;
  keyManager: string;
  label: string;
  signer: ethers.Signer;
}

interface BaseVaultRef {
  chain: 'base';
  vaultAddress: string;
  label: string;
}

export type VaultRef = LuksoVaultRef | BaseVaultRef;

interface AddAgentModalProps {
  vault: VaultRef | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// ─── Curated agent catalog ────────────────────────────────────────────────────

function AgentCatalog({
  selectedAddress,
  onSelect,
}: {
  selectedAddress: string;
  onSelect: (addr: string) => void;
}) {
  const { data: agents = [], isLoading } = useAgents();

  const { t } = useI18n();

  if (isLoading) {
    return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('create.agents.catalog_loading')}</p>;
  }
  if (agents.length === 0) return null;

  return (
    <div className="space-y-2">
      {agents.map((ag: AgentRecord) => {
        const selected = ag.address.toLowerCase() === selectedAddress.toLowerCase();
        return (
          <button
            key={ag.address}
            type="button"
            onClick={() => onSelect(ag.address)}
            className="w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-all"
            style={{
              borderColor: selected ? 'var(--accent)' : 'var(--border)',
              background: selected ? 'rgba(34,255,178,0.07)' : 'var(--bg)',
              color: 'var(--text)',
            }}
          >
            <span
              className="w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-xs"
              style={{
                borderColor: selected ? 'var(--accent)' : 'var(--border)',
                background: selected ? 'var(--accent)' : 'transparent',
                color: 'var(--bg)',
              }}
            >
              {selected && '✓'}
            </span>
            <AddressDisplay address={ag.address} />
            {ag.roles.map((r) => (
              <span
                key={r}
                className="rounded-full px-2 py-0.5"
                style={{ background: 'var(--card-mid)', color: 'var(--text-muted)' }}
              >
                {r}
              </span>
            ))}
            {ag.allowedAutomation && (
              <span
                className="ml-auto rounded-full px-2 py-0.5"
                style={{ background: 'rgba(34,255,178,0.15)', color: 'var(--accent)' }}
              >
                {t('create.agents.auto_badge')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Mode selector (LUKSO only) ───────────────────────────────────────────────

const AGENT_MODES: { key: AgentMode; labelKey: string; descKey: string }[] = [
  { key: 'pay_people',  labelKey: 'add_agent.mode.pay',        descKey: 'add_agent.mode.pay_desc' },
  { key: 'pay_vendors', labelKey: 'add_agent.mode.subscribe',  descKey: 'add_agent.mode.subscribe_desc' },
  { key: 'save_funds',  labelKey: 'add_agent.mode.treasury',   descKey: 'add_agent.mode.treasury_desc' },
];

// ─── Modal ─────────────────────────────────────────────────────────────────────

export function AddAgentModal({ vault, open, onClose, onSuccess }: AddAgentModalProps) {
  const { t } = useI18n();
  const { adding, success, error, addAgent, reset } = useAddAgentToVault();
  const { removing, success: removeSuccess, error: removeError, removeAgent, reset: resetRemove } = useRemoveAgentFromVault();

  const [agentAddress, setAgentAddress] = useState('');
  const [mode, setMode] = useState<AgentMode>('pay_people');
  const [removeAddress, setRemoveAddress] = useState('');

  // Reset form when vault changes or modal closes
  useEffect(() => {
    if (!open) {
      setAgentAddress('');
      setMode('pay_people');
      setRemoveAddress('');
      reset();
      resetRemove();
    }
  }, [open, reset, resetRemove]);

  if (!vault) return null;

  const isLukso = vault.chain === 'lukso';
  const addressValid = ethers.isAddress(agentAddress);

  const handleSubmit = async () => {
    if (!addressValid) return;

    let ok: boolean;

    if (vault.chain === 'lukso') {
      ok = await addAgent({
        chain: 'lukso',
        vaultSafe: vault.vaultSafe,
        keyManager: vault.keyManager,
        agentAddress,
        mode,
        signer: vault.signer,
      });
    } else {
      ok = await addAgent({
        chain: 'base',
        vaultAddress: vault.vaultAddress,
        agentAddress,
      });
    }

    if (ok) {
      onSuccess?.();
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} direction="right">
      <SheetContent side="right">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-neutral-200 dark:border-neutral-700">
          <SheetTitle>{t('add_agent.title')}</SheetTitle>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity focus:outline-none"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {/* Vault info */}
          <div className="rounded-xl px-4 py-3" style={{ background: 'var(--card-mid)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              {t('add_agent.vault_label')}
            </p>
            <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>
              {vault.label || t('add_agent.unnamed_vault')}
            </p>
          </div>

          {/* Chain-specific note */}
          <div
            className="rounded-xl px-4 py-3 space-y-1"
            style={{
              background: isLukso ? 'rgba(34,255,178,0.06)' : 'rgba(60,242,255,0.06)',
              border: `1px solid ${isLukso ? 'rgba(34,255,178,0.2)' : 'rgba(60,242,255,0.2)'}`,
            }}
          >
            <p className="text-xs font-semibold" style={{ color: isLukso ? 'var(--success)' : 'var(--accent)' }}>
              {isLukso ? t('add_agent.chain_note.lukso_title') : t('add_agent.chain_note.base_title')}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {isLukso ? t('add_agent.chain_note.lukso_desc') : t('add_agent.chain_note.base_desc')}
            </p>
          </div>

          {/* Curated agent catalog */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              {t('add_agent.catalog_title')}
            </p>
            <AgentCatalog
              selectedAddress={agentAddress}
              onSelect={setAgentAddress}
            />
            <p className="text-xs" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {t('add_agent.catalog_future_note')}
            </p>
          </div>

          {/* Manual address input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              {t('add_agent.address_label')}
            </label>
            <input
              type="text"
              value={agentAddress}
              onChange={(e) => setAgentAddress(e.target.value)}
              placeholder={t('add_agent.address_placeholder')}
              className="w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
              style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          {/* LUKSO permission mode */}
          {isLukso && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                {t('add_agent.mode_title')}
              </p>
              <div className="space-y-2">
                {AGENT_MODES.map((m) => {
                  const selected = mode === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMode(m.key)}
                      className="w-full rounded-xl px-4 py-3 text-left transition-all"
                      style={{
                        background: selected ? 'var(--card-mid)' : 'var(--bg)',
                        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      }}
                    >
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                        {t(m.labelKey as Parameters<typeof t>[0])}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {t(m.descKey as Parameters<typeof t>[0])}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add feedback */}
          {success && (
            <Alert variant="success">
              <AlertDescription>{t('add_agent.success')}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="warning">
              <AlertDescription>{t('add_agent.error')}: {error}</AlertDescription>
            </Alert>
          )}

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '8px', paddingTop: '8px' }} />

          {/* Remove agent section */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              {t('add_agent.remove_title')}
            </p>
            <input
              type="text"
              value={removeAddress}
              onChange={(e) => setRemoveAddress(e.target.value)}
              placeholder={t('add_agent.remove_placeholder')}
              className="w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
              style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <Button
              variant="secondary"
              onClick={async () => {
                if (!ethers.isAddress(removeAddress) || !vault) return;
                let ok: boolean;
                if (vault.chain === 'lukso') {
                  ok = await removeAgent({ chain: 'lukso', keyManager: vault.keyManager, agentAddress: removeAddress, signer: vault.signer });
                } else {
                  ok = await removeAgent({ chain: 'base', vaultAddress: vault.vaultAddress, agentAddress: removeAddress });
                }
                if (ok) onSuccess?.();
              }}
              disabled={removing || !ethers.isAddress(removeAddress) || removeSuccess}
            >
              {removing ? t('add_agent.remove_loading') : t('add_agent.remove_btn')}
            </Button>
            {removeSuccess && (
              <Alert variant="success">
                <AlertDescription>{t('add_agent.remove_success')}</AlertDescription>
              </Alert>
            )}
            {removeError && (
              <Alert variant="warning">
                <AlertDescription>{t('add_agent.remove_error_prefix')} {removeError}</AlertDescription>
              </Alert>
            )}
          </div>
        </SheetBody>

        {/* Footer */}
        <SheetFooter className="px-6 pb-6 pt-4 flex gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="secondary" onClick={onClose} disabled={adding}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={adding || !addressValid || success}
          >
            {adding ? t('add_agent.btn_loading') : t('add_agent.btn')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
