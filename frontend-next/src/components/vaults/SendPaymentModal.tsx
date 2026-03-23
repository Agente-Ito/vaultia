'use client';

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/common/Button';
import { getSafeContract, getPolicyEngineContract, getMerchantPolicyContract, getKeyManagerContract } from '@/lib/web3/contracts';
import { decodeRevertReason, isUserRejection } from '@/lib/errorMap';
import { getReadOnlyProvider } from '@/lib/web3/provider';
import { appendLocalActivityLog } from '@/lib/activityLocalLog';

const EXPLORER_BASE = 'https://explorer.execution.testnet.lukso.network/tx/';
const short = (addr: string) => `${addr.slice(0, 8)}…${addr.slice(-6)}`;

interface VaultOption {
  safe: string;
  label: string;
}

interface SendPaymentModalProps {
  open: boolean;
  onClose: () => void;
  signer: ethers.Signer | null;
  /** Pre-selected single vault (used from VaultCard). */
  vaultSafe?: string;
  vaultLabel?: string;
  /** List of vaults to pick from (used from Dashboard). */
  vaults?: VaultOption[];
}

export function SendPaymentModal({
  open,
  onClose,
  signer,
  vaultSafe,
  vaultLabel,
  vaults,
}: SendPaymentModalProps) {
  const [selectedSafe, setSelectedSafe] = useState(vaultSafe ?? '');
  const [merchants, setMerchants] = useState<string[]>([]);
  const [merchantsLoading, setMerchantsLoading] = useState(false);

  // Recipient mode: 'merchant' (pick from list) or 'manual' (type address)
  const [recipientMode, setRecipientMode] = useState<'merchant' | 'manual'>('merchant');
  const [selectedMerchant, setSelectedMerchant] = useState('');
  const [manualRecipient, setManualRecipient] = useState('');

  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync selectedSafe when props change or modal opens
  useEffect(() => {
    if (vaultSafe) setSelectedSafe(vaultSafe);
    else if (vaults?.length) setSelectedSafe(vaults[0].safe);
  }, [vaultSafe, vaults, open]);

  // Load merchants for the currently selected vault
  const loadMerchants = useCallback(async (safeAddress: string) => {
    if (!safeAddress) return;
    setMerchantsLoading(true);
    setMerchants([]);
    setSelectedMerchant('');
    try {
      const provider = signer?.provider ?? getReadOnlyProvider();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const safe = getSafeContract(safeAddress, provider) as any;
      const policyEngineAddr: string = await safe.policyEngine();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pe = getPolicyEngineContract(policyEngineAddr, provider) as any;
      const policyAddrs: string[] = await pe.getPolicies();

      let found: string[] = [];
      for (const p of policyAddrs) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mp = getMerchantPolicyContract(p, provider) as any;
          found = await mp.getMerchants();
          break; // stop at first merchant policy
        } catch {
          // not a merchant policy, continue
        }
      }
      setMerchants(found);
      // Auto-switch to manual if no merchants are configured
      if (found.length === 0) setRecipientMode('manual');
      else { setRecipientMode('merchant'); setSelectedMerchant(found[0]); }
    } catch {
      // silently fall back to manual entry
      setRecipientMode('manual');
    } finally {
      setMerchantsLoading(false);
    }
  }, [signer]);

  useEffect(() => {
    if (open && selectedSafe) loadMerchants(selectedSafe);
  }, [open, selectedSafe, loadMerchants]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setManualRecipient('');
      setSelectedMerchant('');
      setAmount('');
      setTxHash(null);
      setError(null);
      setSending(false);
    }
  }, [open]);

  const recipient = recipientMode === 'merchant' ? selectedMerchant : manualRecipient.trim();
  const recipientValid = ethers.isAddress(recipient);
  const recipientWhitelisted = merchants.length === 0 || recipientMode === 'merchant' || merchants.some((addr) => addr.toLowerCase() === recipient.toLowerCase());
  const amountNum = parseFloat(amount);
  const amountValid = !isNaN(amountNum) && amountNum > 0;
  const canSend = !!signer && !!selectedSafe && recipientValid && recipientWhitelisted && amountValid && !sending;

  const handleSend = async () => {
    if (!canSend || !signer) return;
    setSending(true);
    setError(null);
    setTxHash(null);
    try {
      const safe = getSafeContract(selectedSafe, signer);
      const amountWei = ethers.parseEther(amount.trim());

      // Route through the vault KeyManager so AgentSafe sees msg.sender == vaultKeyManager
      // and enforces PolicyEngine validation (whitelists, budgets, etc.). Direct owner
      // calls to safe.execute() bypass policy checks by design in AgentSafe.
      const keyManagerAddress = await safe.vaultKeyManager();
      const keyManager = getKeyManagerContract(keyManagerAddress, signer);
      const executeCalldata = safe.interface.encodeFunctionData('execute', [
        0,
        recipient,
        amountWei,
        '0x',
      ]);
      const tx = await keyManager.execute(executeCalldata);
      await tx.wait();
      setTxHash(tx.hash as string);
      setAmount('');
      if (recipientMode === 'manual') setManualRecipient('');
    } catch (err: unknown) {
      const decodedError = decodeRevertReason(err);
      setError(decodedError);

      if (!isUserRejection(err)) {
        appendLocalActivityLog({
          id: `blocked-${selectedSafe}-${recipient}-${amount.trim()}-${Date.now()}`,
          vaultSafe: selectedSafe,
          vaultLabel: selectedLabel,
          status: 'blocked',
          type: 'LYX',
          to: recipient,
          amount: amount.trim(),
          reason: decodedError,
          createdAt: Date.now(),
        });
      }
    } finally {
      setSending(false);
    }
  };

  const showVaultSelector = !vaultSafe && vaults && vaults.length > 1;
  const selectedLabel =
    vaultLabel ??
    vaults?.find((v) => v.safe === selectedSafe)?.label ??
    (selectedSafe ? short(selectedSafe) : '');

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Send Payment</SheetTitle>
          <button
            onClick={onClose}
            className="ml-auto text-lg leading-none opacity-60 hover:opacity-100"
            style={{ color: 'var(--text)' }}
            aria-label="Close"
          >
            ✕
          </button>
        </SheetHeader>

        <SheetBody className="space-y-5">
          {/* ── Vault selector ─────────────────────────────────── */}
          {showVaultSelector ? (
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                From vault
              </label>
              <select
                value={selectedSafe}
                onChange={(e) => setSelectedSafe(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                {vaults!.map((v) => (
                  <option key={v.safe} value={v.safe}>
                    {v.label || short(v.safe)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--card-mid)', border: '1px solid var(--border)' }}>
              <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-muted)' }}>From vault</p>
              <p className="font-medium" style={{ color: 'var(--text)' }}>{selectedLabel}</p>
              {selectedSafe && (
                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {selectedSafe.slice(0, 10)}…{selectedSafe.slice(-6)}
                </p>
              )}
            </div>
          )}

          {/* ── Recipient ──────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Recipient
              </label>
              {/* Mode toggle — only shown when merchants exist */}
              {merchants.length > 0 && (
                <div className="flex rounded-lg overflow-hidden text-xs" style={{ border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setRecipientMode('merchant')}
                    className="px-3 py-1 transition-colors"
                    style={{
                      background: recipientMode === 'merchant' ? 'var(--text)' : 'var(--card-mid)',
                      color: recipientMode === 'merchant' ? 'var(--bg)' : 'var(--text-muted)',
                    }}
                  >
                    Authorized
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientMode('manual')}
                    className="px-3 py-1 transition-colors"
                    style={{
                      background: recipientMode === 'manual' ? 'var(--text)' : 'var(--card-mid)',
                      color: recipientMode === 'manual' ? 'var(--bg)' : 'var(--text-muted)',
                    }}
                  >
                    Manual
                  </button>
                </div>
              )}
            </div>

            {merchantsLoading && (
              <p className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>Loading authorized recipients…</p>
            )}

            {/* Merchant picker */}
            {!merchantsLoading && recipientMode === 'merchant' && merchants.length > 0 && (
              <div className="space-y-2">
                {merchants.map((addr) => (
                  <button
                    key={addr}
                    type="button"
                    onClick={() => setSelectedMerchant(addr)}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all"
                    style={{
                      background: selectedMerchant === addr ? 'var(--card-mid)' : 'transparent',
                      border: `1px solid ${selectedMerchant === addr ? 'var(--primary)' : 'var(--border)'}`,
                      color: 'var(--text)',
                    }}
                  >
                    <span
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ background: selectedMerchant === addr ? 'var(--primary)' : 'var(--border)' }}
                    />
                    <span className="font-mono text-xs truncate">{addr}</span>
                  </button>
                ))}
              </div>
            )}

            {/* No merchants configured */}
            {!merchantsLoading && recipientMode === 'merchant' && merchants.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                No authorized merchants found for this vault. Enter an address manually.
              </p>
            )}

            {/* Manual input */}
            {(!merchantsLoading && recipientMode === 'manual') && (
              <div className="space-y-1">
                <input
                  type="text"
                  value={manualRecipient}
                  onChange={(e) => setManualRecipient(e.target.value)}
                  placeholder="0x…"
                  className="w-full rounded-xl px-3 py-2 text-sm font-mono focus:outline-none"
                  style={{
                    background: 'var(--card-mid)',
                    border: `1px solid ${manualRecipient && !ethers.isAddress(manualRecipient.trim()) ? 'var(--blocked)' : 'var(--border)'}`,
                    color: 'var(--text)',
                  }}
                />
                {manualRecipient && !ethers.isAddress(manualRecipient.trim()) && (
                  <p className="text-xs" style={{ color: 'var(--blocked)' }}>Invalid address</p>
                )}
                {manualRecipient && ethers.isAddress(manualRecipient.trim()) && merchants.length > 0 && !recipientWhitelisted && (
                  <p className="text-xs" style={{ color: 'var(--blocked)' }}>
                    This address is not in the authorized recipient list for this vault.
                  </p>
                )}
                {merchants.length > 0 && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    This vault has an authorized-recipient policy. Payments must go through the key manager and match that list.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Amount ─────────────────────────────────────────── */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Amount (LYX)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                min="0"
                step="0.01"
                className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>LYX</span>
            </div>
          </div>

          {/* ── Success ────────────────────────────────────────── */}
          {txHash && (
            <div className="rounded-xl px-4 py-3 space-y-1" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--success)' }}>Payment sent ✓</p>
              <a
                href={`${EXPLORER_BASE}${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                {txHash.slice(0, 14)}…{txHash.slice(-8)} ↗
              </a>
            </div>
          )}

          {/* ── Error ──────────────────────────────────────────── */}
          {error && (
            <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <p className="text-xs break-words leading-relaxed" style={{ color: 'var(--blocked)' }}>{error}</p>
            </div>
          )}

          {!signer && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Connect your wallet to send a payment.</p>
          )}
        </SheetBody>

        <SheetFooter>
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSend} disabled={!canSend}>
            {sending ? 'Sending…' : 'Send Payment'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
