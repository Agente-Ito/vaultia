'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { useVault } from '@/hooks/useVault';
import { useBaseVaults, BaseVaultSummary } from '@/hooks/useBaseVaults';
import { isBaseFactoryConfigured } from '@/lib/web3/baseContracts';
import { Skeleton, SkeletonCard } from '@/components/common/Skeleton';
import { Alert, AlertDescription } from '@/components/common/Alert';
import { useI18n } from '@/context/I18nContext';
import { AddAgentModal, VaultRef } from '@/components/agents/AddAgentModal';
import { AddressDisplay } from '@/components/common/AddressDisplay';
import { useManageVaultPolicy } from '@/hooks/useManageVaultPolicy';
import { VaultFundingActions } from '@/components/vaults/VaultFundingActions';
import { SendPaymentModal } from '@/components/vaults/SendPaymentModal';
import { LuksoIcon } from '@/components/common/LuksoIcon';
import { checkVaultOwnership, claimVaultOwnership } from '@/lib/web3/deployVault';
import { decodeRevertReason, localizeErrorMessage } from '@/lib/errorMap';
import { ethers } from 'ethers';

// ─── Animated counter ─────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target) return;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setValue(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ─── Spend bar ────────────────────────────────────────────────────────────────

function SpendBar({ spent, total }: { spent: number; total: number }) {
  const pct = total > 0 ? Math.min((spent / total) * 100, 100) : 0;
  const ratio = total > 0 ? spent / total : 0;
  const barColor = ratio >= 1 ? 'var(--blocked)' : ratio >= 0.85 ? 'var(--warning)' : 'var(--success)';
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--card-mid)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <div className="flex justify-between text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
        <span style={ratio >= 1 ? { color: 'var(--blocked)', fontWeight: 500 } : undefined}>
          {spent} LYX spent
        </span>
        <span>{total} LYX</span>
      </div>
    </div>
  );
}

// ─── Vault card ───────────────────────────────────────────────────────────────

function VaultCard({
  vault,
  signer,
  onAddAgent,
}: {
  vault: { safe: string; keyManager: string; policyEngine: string; label: string };
  signer: ethers.Signer | null;
  onAddAgent: (ref: VaultRef) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { detail, loading } = useVault(expanded ? vault.safe : null);
  const { t } = useI18n();
  const { updating, error: policyError, updateBudget, addMerchants, removeMerchant, updateExpiration } = useManageVaultPolicy();
  const { account } = useWeb3();

  // ── Ownership status ──────────────────────────────────────────────────────
  const [ownershipStatus, setOwnershipStatus] = useState<'owner' | 'pending' | 'none' | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);

  useEffect(() => {
    if (!expanded || !signer || !account) return;
    setOwnershipStatus(null);
    const provider = signer.provider;
    if (!provider) return;
    checkVaultOwnership(vault.safe, account, provider).then(setOwnershipStatus).catch(() => setOwnershipStatus(null));
  }, [expanded, signer, account, vault.safe]);

  const handleClaimOwnership = async () => {
    if (!signer) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const { claimed, warnings } = await claimVaultOwnership(vault.safe, signer);
      if (claimed > 0) {
        setOwnershipStatus('owner');
        setClaimSuccess(true);
      }
      if (warnings.length) setClaimError(warnings.join(' | '));
    } catch (e: unknown) {
      setClaimError(decodeRevertReason(e));
    } finally {
      setClaiming(false);
    }
  };

  const [newBudget, setNewBudget] = useState('');
  const [newMerchant, setNewMerchant] = useState('');
  const [newExpiration, setNewExpiration] = useState('');
  const [policySuccess, setPolicySuccess] = useState<string | null>(null);
  const [sendPaymentOpen, setSendPaymentOpen] = useState(false);

  const short = (addr: string) => `${addr.slice(0, 8)}…${addr.slice(-6)}`;
  const spent  = detail ? parseFloat(detail.policySummary.spent ?? '0') : 0;
  const budget = detail?.policySummary.budget ? parseFloat(detail.policySummary.budget) : 0;
  const balanceNum = detail ? parseFloat(detail.balance) : 0;
  const animatedBalance = useCountUp(balanceNum);
  const parsedNewBudget = Number(newBudget);
  const budgetInputValid = newBudget.trim() !== '' && Number.isFinite(parsedNewBudget) && parsedNewBudget > 0;

  const handleUpdateBudget = async () => {
    if (!signer || !detail?.policySummary.budgetPolicyAddress || !budgetInputValid) return;
    const ok = await updateBudget(detail.policySummary.budgetPolicyAddress, ethers.parseEther(newBudget), signer);
    if (ok) { setPolicySuccess('Budget updated.'); setNewBudget(''); }
  };

  const handleAddMerchant = async () => {
    if (!signer || !detail?.policySummary.merchantPolicyAddress || !ethers.isAddress(newMerchant)) return;
    const ok = await addMerchants(detail.policySummary.merchantPolicyAddress, [newMerchant], signer);
    if (ok) { setPolicySuccess('Merchant added.'); setNewMerchant(''); }
  };

  const handleRemoveMerchant = async (addr: string) => {
    if (!signer || !detail?.policySummary.merchantPolicyAddress) return;
    const ok = await removeMerchant(detail.policySummary.merchantPolicyAddress, addr, signer);
    if (ok) setPolicySuccess('Merchant removed.');
  };

  const handleUpdateExpiration = async () => {
    if (!signer || !detail?.policySummary.expirationPolicyAddress || !newExpiration) return;
    const ts = BigInt(Math.floor(new Date(newExpiration).getTime() / 1000));
    const ok = await updateExpiration(detail.policySummary.expirationPolicyAddress, ts, signer);
    if (ok) { setPolicySuccess('Expiration updated.'); setNewExpiration(''); }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{vault.label || 'Unnamed Vault'}</CardTitle>
            <CardDescription className="font-mono text-xs mt-xs">{short(vault.safe)}</CardDescription>
          </div>
          <Badge variant="success" pulse>{t('common.active')}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-md">
        {loading && (
          <div className="space-y-sm">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}

        {detail && (
          <>
            <div className="flex items-end justify-between gap-sm">
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  {t('vaults.card.balance')}
                </p>
                {detail.policySummary.budgetToken && detail.policySummary.budgetToken !== ethers.ZeroAddress ? (
                  <p className="text-2xl font-bold leading-tight" style={{ color: 'var(--text)' }}>
                    {detail.policySummary.tokenBalance ?? '—'}
                    <span className="text-sm font-medium ml-1" style={{ color: 'var(--text-muted)' }}>AVT</span>
                  </p>
                ) : (
                  <p className="text-2xl font-bold leading-tight" style={{ color: 'var(--text)' }}>
                    {animatedBalance.toFixed(4)}
                    <span className="text-sm font-medium ml-1" style={{ color: 'var(--text-muted)' }}>LYX</span>
                  </p>
                )}
                {!detail.policySummary.budgetToken || detail.policySummary.budgetToken === ethers.ZeroAddress ? (
                  parseFloat(detail.balance) === 0 && (
                    <a
                      href="https://faucet.testnet.lukso.network"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs hover:underline"
                      style={{ color: 'var(--primary)' }}
                    >
                      {t('vaults.card.fund_faucet')}
                    </a>
                  )
                ) : null}
              </div>
              {detail.policySummary.expiration && detail.policySummary.expiration !== '0' && (
                <div className="text-right">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('vaults.card.expires')}</p>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                    {new Date(Number(detail.policySummary.expiration) * 1000).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
            {detail.policySummary.budget && <SpendBar spent={spent} total={budget} />}
            {(parseFloat(detail.balance) === 0 || Boolean(detail.policySummary.budgetToken)) && (
              <VaultFundingActions
                vaultAddress={vault.safe}
                budgetToken={detail.policySummary.budgetToken}
                signer={signer}
                compact
              />
            )}
          </>
        )}

        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`vault-details-${vault.safe}`}
          className="text-xs text-left hover:underline"
          style={{ color: 'var(--primary)' }}
        >
          {expanded ? t('vaults.card.hide_details') : t('vaults.card.show_details')}
        </button>

        {expanded && detail && (
          <div
            id={`vault-details-${vault.safe}`}
            className="space-y-xs text-xs font-mono pt-md"
            style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}
          >
            <p><span className="font-sans font-medium">{t('vaults.card.key_manager')}:</span> {short(detail.keyManager)}</p>
            <p><span className="font-sans font-medium">{t('vaults.card.policy_engine')}:</span> {short(detail.policyEngine)}</p>
            {detail.policySummary.merchants?.length ? (
              <p><span className="font-sans font-medium">{t('vaults.card.merchants')}:</span> {detail.policySummary.merchants.length} {t('vaults.card.whitelisted')}</p>
            ) : (
              <p><span className="font-sans font-medium">{t('vaults.card.merchants')}:</span> {t('vaults.card.no_restriction')}</p>
            )}
            {detail.policySummary.recipientLimits?.length ? (
              <p><span className="font-sans font-medium">{t('vaults.card.recipient_limits')}:</span> {detail.policySummary.recipientLimits.length} recipients</p>
            ) : null}
            {!!detail.policySummary.warnings?.length && (
              <Alert variant="warning" className="mt-sm font-sans">
                <AlertDescription>{detail.policySummary.warnings.join(' ')}</AlertDescription>
              </Alert>
            )}
            {signer && (
              <>
                <div className="flex gap-2 mt-sm flex-wrap">
                  <Button
                    variant="primary"
                    size="sm"
                    className="font-sans"
                    onClick={() => setSendPaymentOpen(true)}
                  >
                    Send Payment
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="font-sans"
                    onClick={() =>
                      onAddAgent({
                        chain: 'lukso',
                        vaultSafe: vault.safe,
                        keyManager: vault.keyManager,
                        label: vault.label,
                        signer,
                      })
                    }
                  >
                    {t('vaults.card.manage_agents')}
                  </Button>
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  {t('vaults.agent_delegation.coming_soon_note')}
                </p>
                <SendPaymentModal
                  open={sendPaymentOpen}
                  onClose={() => setSendPaymentOpen(false)}
                  signer={signer}
                  vaultSafe={vault.safe}
                  vaultLabel={vault.label}
                />
              </>
            )}

            {/* ── Ownership claim banner ───────────────────────────────────── */}
            {signer && ownershipStatus === 'pending' && !claimSuccess && (
              <div className="rounded-lg px-3 py-2.5 space-y-2 font-sans text-xs" style={{ background: 'color-mix(in srgb, var(--warning) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)' }}>
                <p className="font-medium" style={{ color: 'var(--warning)' }}>
                  Ownership not yet accepted
                </p>
                <p style={{ color: 'var(--text-muted)' }}>
                  This vault was deployed for your account but you haven&apos;t accepted ownership yet. You must claim it before managing policies or sending payments.
                </p>
                <Button variant="primary" size="sm" onClick={handleClaimOwnership} disabled={claiming}>
                  {claiming ? 'Claiming…' : 'Claim Ownership'}
                </Button>
                {claimError && (
                  <p className="break-words leading-relaxed" style={{ color: 'var(--blocked)' }}>
                    {localizeErrorMessage(claimError, t)}
                  </p>
                )}
              </div>
            )}
            {signer && claimSuccess && (
              <div className="rounded-lg px-3 py-2 text-xs font-sans" style={{ background: 'color-mix(in srgb, var(--success) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 40%, transparent)', color: 'var(--success)' }}>
                ✓ Ownership claimed — you can now manage this vault.
              </div>
            )}

            {/* ── Policy management (owner only) ───────────────────────────── */}
            {signer && (ownershipStatus === 'owner' || ownershipStatus === null) && (
              <div className="space-y-sm font-sans pt-xs" style={{ borderTop: '1px solid var(--border)' }}>
                {/* Budget */}
                {detail.policySummary.budgetPolicyAddress && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                      {t('vaults.manage.budget_limit_label')}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={newBudget}
                        onChange={(e) => setNewBudget(e.target.value)}
                        placeholder={t('vaults.manage.new_budget_placeholder')}
                        min="0.000000000000000001"
                        step="any"
                        className="flex-1 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none"
                        style={{
                          background: 'var(--card-mid)',
                          border: `1px solid ${newBudget && !budgetInputValid ? 'var(--blocked)' : 'var(--border)'}`,
                          color: 'var(--text)',
                        }}
                      />
                      <Button variant="secondary" size="sm" onClick={handleUpdateBudget} disabled={updating || !budgetInputValid}>
                        {updating ? '…' : t('vaults.manage.update_btn')}
                      </Button>
                    </div>
                    {newBudget && !budgetInputValid && (
                      <p className="text-xs" style={{ color: 'var(--blocked)' }}>
                        Budget must be greater than 0.
                      </p>
                    )}
                  </div>
                )}

                {/* Merchants */}
                {detail.policySummary.merchantPolicyAddress && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                      {t('vaults.manage.merchants_label')}
                    </p>
                    {detail.policySummary.merchants?.map((m) => (
                      <div key={m} className="flex items-center justify-between gap-2">
                        <AddressDisplay address={m} className="text-xs truncate" />
                        <button
                          onClick={() => handleRemoveMerchant(m)}
                          disabled={updating}
                          className="text-xs px-2 py-0.5 rounded transition-all"
                          style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--blocked)' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMerchant}
                        onChange={(e) => setNewMerchant(e.target.value)}
                        placeholder={t('vaults.manage.add_merchant_placeholder')}
                        className="flex-1 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none"
                        style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      />
                      <Button variant="secondary" size="sm" onClick={handleAddMerchant} disabled={updating || !ethers.isAddress(newMerchant)}>
                        {updating ? '…' : t('vaults.manage.add_btn')}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Recipient limits */}
                {detail.policySummary.recipientLimits?.length ? (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                      {t('vaults.card.recipient_limits')}
                    </p>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-xs">
                      <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>{t('vaults.manage.recipient_col')}</span>
                      <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>{t('vaults.manage.remaining_limit_col')}</span>
                      <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>{t('vaults.manage.period_col')}</span>
                      {detail.policySummary.recipientLimits.map((rl) => (
                        <div key={rl.recipient} className="contents">
                          <span key={`${rl.recipient}-addr`} style={{ color: 'var(--text)' }}>
                            <AddressDisplay address={rl.recipient} className="truncate" />
                          </span>
                          <span key={`${rl.recipient}-amt`} style={{ color: 'var(--text)' }}>
                            {rl.limit === '∞' ? '∞' : `${rl.remaining} / ${rl.limit}`}
                          </span>
                          <span key={`${rl.recipient}-period`} style={{ color: 'var(--text-muted)' }}>{rl.period}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Expiration */}
                {detail.policySummary.expirationPolicyAddress && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                      {t('vaults.manage.expiration_label')}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={newExpiration}
                        onChange={(e) => setNewExpiration(e.target.value)}
                        className="flex-1 rounded-lg px-2 py-1 text-xs focus:outline-none"
                        style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      />
                      <Button variant="secondary" size="sm" onClick={handleUpdateExpiration} disabled={updating || !newExpiration}>
                        {updating ? '…' : t('vaults.manage.update_btn')}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Feedback */}
                {policySuccess && (
                  <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--success)' }}><span className="h-2 w-2 rounded-full" style={{ background: 'var(--success)' }} />{policySuccess}</p>
                )}
                {policyError && (
                  <p className="text-xs break-words leading-relaxed" style={{ color: 'var(--blocked)' }}>{localizeErrorMessage(policyError, t)}</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Base vault card ──────────────────────────────────────────────────────────

function BaseVaultCard({
  vault,
  onAddAgent,
}: {
  vault: BaseVaultSummary;
  onAddAgent: (ref: VaultRef) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();
  const short = (addr: string) => `${addr.slice(0, 8)}…${addr.slice(-6)}`;

  return (
    <Card className="flex flex-col" style={{ border: '1px solid var(--border)' }}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{vault.label || 'Unnamed Vault'}</CardTitle>
            <CardDescription className="font-mono text-xs mt-xs">{short(vault.vault)}</CardDescription>
          </div>
          <div className="flex gap-xs">
            <Badge variant="primary">{t('vaults.base.chain_badge')}</Badge>
            <Badge variant="success">{t('common.active')}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-md">
        <div className="flex items-center gap-sm">
          <span className="text-xl">{vault.tokenEmoji}</span>
          <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{vault.tokenSymbol}</span>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{short(vault.token)}</span>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="text-xs hover:underline text-left"
          style={{ color: 'var(--primary)' }}
        >
          {expanded ? t('vaults.card.hide_details') : t('vaults.card.show_details')}
        </button>

        {expanded && (
          <div
            className="space-y-xs text-xs font-mono pt-md"
            style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}
          >
            <p><span className="font-sans font-medium">{t('vaults.card.policy_engine')}:</span> {short(vault.policyEngine)}</p>
            <p><span className="font-sans font-medium">Vault:</span> {vault.vault}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-sm font-sans"
              onClick={() =>
                onAddAgent({
                  chain: 'base',
                  vaultAddress: vault.vault,
                  label: vault.label,
                })
              }
            >
              {t('vaults.card.manage_agents')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VaultsPage() {
  const { registry, account, isConnected, signer, hasUPExtension } = useWeb3();
  const { vaults, loading, error, refresh: refreshVaults } = useVaults(registry, account);
  const { vaults: baseVaults, loading: baseLoading, error: baseError, refresh: refreshBase } = useBaseVaults(account);
  const { t } = useI18n();
  const [agentModalVault, setAgentModalVault] = useState<VaultRef | null>(null);

  const handleRefreshAll = () => { refreshVaults(); refreshBase(); };

  return (
    <div className="space-y-lg">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{t('vaults.title')}</h1>
          <p className="mt-xs" style={{ color: 'var(--text-muted)' }}>{t('vaults.subtitle')}</p>
        </div>
        <div className="flex gap-sm">
          <Button variant="secondary" size="sm" onClick={handleRefreshAll} disabled={loading || baseLoading}>
            {(loading || baseLoading) ? '…' : t('common.refresh')}
          </Button>
          <Link href="/vaults/create">
            <Button>{t('vaults.create')}</Button>
          </Link>
        </div>
      </div>

      {isConnected && !loading && vaults.length > 0 && (
        <div className="grid grid-cols-3 gap-md">
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
              {t('vaults.stats.total')}
            </p>
            <p
              className="mt-2"
              style={{
                color: 'var(--text)',
                fontSize: 'clamp(2rem, 3.2vw, 2.8rem)',
                fontWeight: 500,
                letterSpacing: '-0.03em',
                lineHeight: 1,
              }}
            >
              {vaults.length}
            </p>
          </div>

          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
              {t('vaults.stats.active')}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span
                className="animate-active-status-dot inline-flex h-3 w-3 rounded-full"
                style={{ background: 'var(--success)' }}
                aria-hidden="true"
              />
              <div>
                <p className="text-base font-medium" style={{ color: 'var(--text)' }}>
                  {t('common.active')}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Live
                </p>
              </div>
            </div>
          </div>

          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
              {t('vaults.stats.network')}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <LuksoIcon size={22} />
              <p className="text-lg font-medium" style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}>
                LUKSO
              </p>
            </div>
          </div>
        </div>
      )}

      {!isConnected && !hasUPExtension && (
        <Card>
          <CardContent className="space-y-sm py-md">
            <p className="font-semibold" style={{ color: 'var(--text)' }}>{t('vaults.no_extension.title')}</p>
            <div className="flex flex-col gap-xs">
              <a
                href="https://chromewebstore.google.com/detail/universal-profiles/abpickdkkbnbcoepogfhkhennhfhehfn"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                ↗ {t('vaults.no_extension.install_ext')}
              </a>
              <a
                href="https://universalprofile.cloud"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                ↗ {t('vaults.no_extension.create_profile')}
              </a>
              <a
                href="https://faucet.testnet.lukso.network"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                ↗ {t('vaults.no_extension.faucet')}
              </a>
            </div>
          </CardContent>
        </Card>
      )}
      {!isConnected && hasUPExtension && (
        <Alert variant="info">
          <AlertDescription>{t('vaults.has_extension.connect_prompt')}</AlertDescription>
        </Alert>
      )}

      {isConnected && loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <SkeletonCard /><SkeletonCard />
        </div>
      )}

      {isConnected && error && (
        <Card><CardContent><p className="text-sm" style={{ color: 'var(--blocked)' }}>Error: {error}</p></CardContent></Card>
      )}

      {isConnected && !loading && !error && vaults.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('vaults.empty.title')}</CardTitle>
            <CardDescription>{t('vaults.empty.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-md" style={{ color: 'var(--text-muted)' }}>{t('vaults.empty.description')}</p>
            <Link href="/vaults/create">
              <Button variant="primary">{t('vaults.empty.cta')}</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {vaults.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          {vaults.map((vault, i) => (
            <div key={vault.safe} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <VaultCard
                vault={vault}
                signer={signer}
                onAddAgent={setAgentModalVault}
              />
            </div>
          ))}
        </div>
      )}

      {isConnected && isBaseFactoryConfigured() && (
        <div className="space-y-md">
          <div className="pt-lg" style={{ borderTop: '1px solid var(--border)' }}>
            <h2 className="text-xl font-bold flex items-center gap-sm" style={{ color: 'var(--text)' }}>
              <span className="text-2xl">🔵</span>
              {t('vaults.base.section_title')}
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {t('vaults.base.coming_soon_badge')}
              </span>
            </h2>
            <p className="text-sm mt-xs" style={{ color: 'var(--text-muted)' }}>{t('vaults.base.section_subtitle')}</p>
          </div>

          {baseLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <SkeletonCard /><SkeletonCard />
            </div>
          )}
          {baseError && (
            <Card><CardContent><p className="text-sm" style={{ color: 'var(--blocked)' }}>Error: {baseError}</p></CardContent></Card>
          )}
          {!baseLoading && !baseError && baseVaults.length === 0 && (
            <Card>
              <CardContent>
                <p className="text-sm py-sm" style={{ color: 'var(--text-muted)' }}>{t('vaults.base.coming_soon_desc')}</p>
                <a href="/vaults/create" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                  {t('vaults.base.create_lukso_cta')}
                </a>
              </CardContent>
            </Card>
          )}
          {baseVaults.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              {baseVaults.map((vault) => (
                <BaseVaultCard
                  key={vault.vault}
                  vault={vault}
                  onAddAgent={setAgentModalVault}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <AddAgentModal
        vault={agentModalVault}
        open={agentModalVault !== null}
        onClose={() => setAgentModalVault(null)}
        onSuccess={() => { handleRefreshAll(); setAgentModalVault(null); }}
      />
    </div>
  );
}
