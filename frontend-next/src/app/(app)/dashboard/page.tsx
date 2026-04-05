'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Interface, ethers } from 'ethers';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Alert, AlertDescription } from '@/components/common/Alert';
import { Skeleton } from '@/components/common/Skeleton';
import { AgentCardScroll, type AgentMiniRecord } from '@/components/dashboard/AgentCardScroll';
import { PaymentTimeline, type PaymentEvent } from '@/components/dashboard/PaymentTimeline';
import { PermissionGraph } from '@/components/dashboard/PermissionGraph';
import { VerifiedRunsPanel } from '@/components/dashboard/VerifiedRunsPanel';
import CompactMultisigSummary from '@/components/multisig/CompactMultisigSummary';
import { SendPaymentModal } from '@/components/vaults/SendPaymentModal';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { useVault } from '@/hooks/useVault';
import { useOnboarding } from '@/context/OnboardingContext';
import { useMode } from '@/context/ModeContext';
import { localizeErrorMessage } from '@/lib/errorMap';
import { listPendingMultisigSetups, removePendingMultisigSetup, type PendingMultisigSetup } from '@/lib/pendingMultisigSetup';
import { getReadOnlyProvider } from '@/lib/web3/provider';
import { getSchedulerContract } from '@/lib/web3/contracts';
import { checkVaultOwnership, claimVaultOwnership, enableVaultMultisig } from '@/lib/web3/deployVault';
import { useI18n } from '@/context/I18nContext';

// ─── Scheduler helpers ────────────────────────────────────────────────────────

const SCHEDULER_ADDRESS = process.env.NEXT_PUBLIC_TASK_SCHEDULER_ADDRESS ?? '';
const _kmIface = new Interface(['function execute(bytes _data)']);
const _safeIface = new Interface(['function execute(uint256 operation, address to, uint256 value, bytes data)']);
const _safePermissionsIface = new Interface(['function getData(bytes32 dataKey) view returns (bytes memory)']);
const AP_PERMS_PREFIX = '4b80742de2bf82acb363';

function schedulerPermissionKey(address: string) {
  return `0x${AP_PERMS_PREFIX}0000${address.toLowerCase().replace(/^0x/, '')}`;
}

function hasNonZeroPermission(value: string) {
  const normalized = value.toLowerCase().replace(/^0x/, '');
  return normalized.length > 0 && /[1-9a-f]/.test(normalized);
}

function taskToPaymentEvent(
  taskId: string,
  task: [string, string, string, number, bigint, bigint, boolean, bigint],
): PaymentEvent {
  const [vault, , executeCalldata, triggerTypeValue, nextExecution, interval, enabled] = task;
  const isTimestamp = triggerTypeValue !== 1;
  let label = `${vault.slice(0, 6)}…${vault.slice(-4)}`;
  let amount = 0;
  try {
    const km = _kmIface.decodeFunctionData('execute', executeCalldata);
    const safe = _safeIface.decodeFunctionData('execute', km[0] as string);
    const recipient = safe[1] as string;
    label = `${recipient.slice(0, 6)}…${recipient.slice(-4)}`;
    amount = parseFloat(ethers.formatEther(safe[2] as bigint));
  } catch { /* keep defaults */ }
  const date = isTimestamp
    ? new Date(Number(nextExecution) * 1000)
    : new Date(Date.now() + Number(interval) * 12 * 1000);
  return { id: taskId, date, label, amount, currency: '', botName: 'TaskScheduler', botEmoji: '💸', status: enabled ? 'scheduled' : 'completed' };
}

// ─── Empty-state helpers ──────────────────────────────────────────────────────

function EmptyAgents({ actionLabel, onAction }: { actionLabel: string; onAction: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <span className="text-4xl">🤖</span>
      <p className="text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
        {t('dashboard.empty.agents')}
      </p>
      <Button size="sm" variant="secondary" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}

function EmptyTimeline({ actionLabel, onAction }: { actionLabel: string; onAction: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <span className="text-4xl">📅</span>
      <p className="text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
        {t('dashboard.empty.timeline')}
      </p>
      <Button size="sm" variant="secondary" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}

function StatusChip({ label, value, tone }: { label: string; value: string; tone: 'primary' | 'success' | 'warning' }) {
  const colorMap = {
    primary: 'var(--text)',
    success: 'var(--success)',
    warning: 'var(--warning)',
  } as const;

  return (
    <div
      className="rounded-xl px-4 py-4 space-y-1"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-2xl font-semibold" style={{ color: colorMap[tone] }}>{value}</p>
    </div>
  );
}

function QuickActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl px-4 py-3 text-left text-sm font-medium transition-opacity hover:opacity-85"
      style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)' }}
    >
      {label}
    </button>
  );
}

function AdvancedControlsTabs({ pathname, onNavigate }: { pathname: string; onNavigate: (href: string) => void }) {
  const { t } = useI18n();
  const tabs = [
    { href: '/dashboard', label: t('nav.dashboard') },
    { href: '/vaults', label: t('nav.vaults') },
    { href: '/rules', label: t('nav.rules') },
    { href: '/automation', label: t('nav.automation') },
    { href: '/agents', label: t('nav.agents') },
    { href: '/budgets', label: t('nav.budgets') },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <button
            key={tab.href}
            onClick={() => onNavigate(tab.href)}
            className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition-all"
            style={{
              background: active ? 'var(--text)' : 'var(--card)',
              color: active ? 'var(--bg)' : 'var(--text)',
              border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function OwnershipRecoveryPanel({
  vaults,
  registry,
  signer,
  account,
  onClaimed,
}: {
  vaults: Array<{ safe: string; label: string; multisigController?: string }>;
  registry: ReturnType<typeof useWeb3>['registry'];
  signer: ethers.Signer | null;
  account: string | null;
  onClaimed: () => void;
}) {
  const { t } = useI18n();
  const [pendingVaults, setPendingVaults] = useState<Array<{ safe: string; label: string }>>([]);
  const [pendingMultisigSetups, setPendingMultisigSetups] = useState<Record<string, PendingMultisigSetup>>({});
  const [loading, setLoading] = useState(false);
  const [claimingVault, setClaimingVault] = useState<string | null>(null);
  const [retryingVault, setRetryingVault] = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (!signer || !account || vaults.length === 0) {
      setPendingVaults([]);
      return;
    }

    let cancelled = false;

    const loadOwnershipState = async () => {
      const provider = signer.provider;
      if (!provider) return;

      setLoading(true);
      try {
        const statuses = await Promise.all(
          vaults.map(async (vault) => ({
            vault,
            status: await checkVaultOwnership(vault.safe, account, provider),
          }))
        );

        if (!cancelled) {
          const setupMap = Object.fromEntries(
            listPendingMultisigSetups()
              .filter((entry) => vaults.some((vault) => vault.safe.toLowerCase() === entry.safeAddress.toLowerCase()))
              .filter((entry) => {
                const vault = vaults.find((item) => item.safe.toLowerCase() === entry.safeAddress.toLowerCase());
                return !vault?.multisigController || vault.multisigController === ethers.ZeroAddress;
              })
              .map((entry) => [entry.safeAddress.toLowerCase(), entry] as const)
          );
          setPendingVaults(
            statuses
              .filter((entry) => entry.status === 'pending')
              .map((entry) => entry.vault)
          );
          setPendingMultisigSetups(setupMap);
        }
      } catch {
        if (!cancelled) {
          setPendingVaults([]);
          setPendingMultisigSetups({});
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadOwnershipState();

    return () => {
      cancelled = true;
    };
  }, [account, signer, vaults]);

  const handleClaim = useCallback(async (safeAddress: string) => {
    if (!signer) return;

    setClaimingVault(safeAddress);
    setError(null);
    setWarnings([]);

    try {
      const result = await claimVaultOwnership(safeAddress, signer);
      if (result.warnings.length > 0) {
        setWarnings(result.warnings);
      }
      onClaimed();
      setPendingVaults((current) => current.filter((vault) => vault.safe.toLowerCase() !== safeAddress.toLowerCase()));
    } catch (claimError: unknown) {
      setError(claimError instanceof Error ? claimError.message : String(claimError));
    } finally {
      setClaimingVault(null);
    }
  }, [onClaimed, signer]);

  const handleRetryMultisig = useCallback(async (safeAddress: string) => {
    if (!registry) return;

    const stagedSetup = pendingMultisigSetups[safeAddress.toLowerCase()];
    if (!stagedSetup) return;

    setRetryingVault(safeAddress);
    setError(null);
    setWarnings([]);

    try {
      await enableVaultMultisig({
        registry,
        safeAddress: stagedSetup.safeAddress,
        signers: stagedSetup.signers,
        threshold: stagedSetup.threshold,
        timeLock: stagedSetup.timeLock,
      });
      removePendingMultisigSetup(safeAddress);
      setPendingMultisigSetups((current) => {
        const next = { ...current };
        delete next[safeAddress.toLowerCase()];
        return next;
      });
      setWarnings([t('deploy_result.warning.multisig_retry_success')]);
      onClaimed();
    } catch (retryError: unknown) {
      setError(retryError instanceof Error ? retryError.message : String(retryError));
    } finally {
      setRetryingVault(null);
    }
  }, [onClaimed, pendingMultisigSetups, registry, t]);

  const handleClaimAll = useCallback(async () => {
    if (!signer || pendingVaults.length === 0) return;

    setClaimingAll(true);
    setClaimingVault(null);
    setError(null);
    setWarnings([]);

    const nextWarnings: string[] = [];

    try {
      for (const vault of pendingVaults) {
        const result = await claimVaultOwnership(vault.safe, signer);
        nextWarnings.push(...result.warnings);
      }
      setWarnings(nextWarnings);
      setPendingVaults([]);
      onClaimed();
    } catch (claimError: unknown) {
      setError(claimError instanceof Error ? claimError.message : String(claimError));
    } finally {
      setClaimingAll(false);
    }
  }, [onClaimed, pendingVaults, signer]);

  if (!signer || pendingVaults.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard.ownership.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {loading ? t('dashboard.ownership.checking') : t('dashboard.ownership.desc')}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleClaimAll()}
            disabled={claimingAll || claimingVault !== null || pendingVaults.length === 0}
          >
            {claimingAll ? t('dashboard.ownership.claiming_all') : t('dashboard.ownership.claim_all')}
          </Button>
        </div>

        <div className="space-y-2">
          {pendingVaults.map((vault) => (
            <div
              key={vault.safe}
              className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
              style={{ background: 'var(--card-mid)', border: '1px solid var(--border)' }}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                  {vault.label || t('dashboard.ownership.unnamed')}
                </p>
                <p className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                  {vault.safe}
                </p>
                {pendingMultisigSetups[vault.safe.toLowerCase()] ? (
                  <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>
                    {t('dashboard.ownership.multisig_retry_note')}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {pendingMultisigSetups[vault.safe.toLowerCase()] ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleRetryMultisig(vault.safe)}
                    disabled={claimingAll || claimingVault !== null || retryingVault !== null}
                  >
                    {retryingVault === vault.safe ? t('dashboard.ownership.retrying_multisig') : t('dashboard.ownership.retry_multisig')}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => void handleClaim(vault.safe)}
                  disabled={claimingAll || claimingVault !== null || retryingVault !== null}
                >
                  {claimingVault === vault.safe ? t('dashboard.ownership.claiming') : t('dashboard.ownership.cta')}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {warnings.length > 0 && (
          <Alert variant="warning">
            <AlertDescription>
              {warnings.map((warning, index) => (
                <span key={`${warning}-${index}`} className="block">{localizeErrorMessage(warning, t)}</span>
              ))}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="warning">
            <AlertDescription>{localizeErrorMessage(error, t)}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function VaultActionCardItem({
  vault,
  signer,
  account,
  ownership,
  claiming,
  onClaim,
  onOpenPayment,
  onOpenRules,
  onOpenVaults,
  onOpenAutomation,
  onOpenMultisig,
}: {
  vault: { safe: string; label: string; multisigController: string };
  signer: ethers.Signer | null;
  account: string | null;
  ownership: 'owner' | 'pending' | 'none';
  claiming: boolean;
  onClaim: () => void;
  onOpenPayment: () => void;
  onOpenRules: () => void;
  onOpenVaults: () => void;
  onOpenAutomation: () => void;
  onOpenMultisig: () => void;
}) {
  const { t } = useI18n();
  const { detail } = useVault(vault.safe);
  const [schedulerAuthorized, setSchedulerAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (!signer || !account || !SCHEDULER_ADDRESS) {
      setSchedulerAuthorized(null);
      return;
    }

    let cancelled = false;

    const loadSchedulerAuthorization = async () => {
      try {
        const safe = new ethers.Contract(vault.safe, _safePermissionsIface.fragments, signer);
        const value: string = await safe.getData(schedulerPermissionKey(SCHEDULER_ADDRESS));
        if (!cancelled) {
          setSchedulerAuthorized(hasNonZeroPermission(value));
        }
      } catch {
        if (!cancelled) {
          setSchedulerAuthorized(false);
        }
      }
    };

    void loadSchedulerAuthorization();

    return () => {
      cancelled = true;
    };
  }, [account, signer, vault.safe]);

  const statusPills = [
    ownership === 'pending'
      ? { label: t('dashboard.vault_actions.badge_pending'), color: 'var(--warning)', bg: 'rgba(255,176,0,0.12)' }
      : { label: t('dashboard.vault_actions.badge_ready'), color: 'var(--success)', bg: 'rgba(16,185,129,0.12)' },
    detail?.policyEnginePaused
      ? { label: t('dashboard.status.paused'), color: 'var(--warning)', bg: 'rgba(255,176,0,0.12)' }
      : { label: t('dashboard.vault_actions.status_live'), color: 'var(--success)', bg: 'rgba(16,185,129,0.12)' },
    detail?.policySummary.merchants?.length
      ? { label: t('dashboard.vault_actions.status_restricted'), color: 'var(--text)', bg: 'var(--card-mid)' }
      : { label: t('dashboard.vault_actions.status_open'), color: 'var(--text-muted)', bg: 'var(--card-mid)' },
    schedulerAuthorized === null
      ? { label: t('dashboard.vault_actions.status_scheduler_unknown'), color: 'var(--text-muted)', bg: 'var(--card-mid)' }
      : schedulerAuthorized
        ? { label: t('dashboard.vault_actions.status_scheduler_ready'), color: 'var(--success)', bg: 'rgba(16,185,129,0.12)' }
        : { label: t('dashboard.vault_actions.status_scheduler_missing'), color: 'var(--warning)', bg: 'rgba(255,176,0,0.12)' },
  ];

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
            {vault.label || t('dashboard.ownership.unnamed')}
          </p>
          <p className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>
            {vault.safe}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {statusPills.map((pill) => (
          <span
            key={pill.label}
            className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: pill.bg, color: pill.color }}
          >
            {pill.label}
          </span>
        ))}
      </div>

      <CompactMultisigSummary safeAddress={vault.safe} multisigAddress={vault.multisigController} />

      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" onClick={onOpenPayment}>
          {t('dashboard.vault_actions.send')}
        </Button>
        <Button size="sm" variant="secondary" onClick={onOpenRules}>
          {t('dashboard.vault_actions.rules')}
        </Button>
        <Button size="sm" variant="secondary" onClick={onOpenAutomation}>
          {t('dashboard.vault_actions.automation')}
        </Button>
        <Button size="sm" variant="secondary" onClick={onOpenVaults}>
          {t('dashboard.vault_actions.manage')}
        </Button>
        {vault.multisigController && vault.multisigController !== ethers.ZeroAddress && (
          <Button size="sm" variant="secondary" onClick={onOpenMultisig} className="col-span-2">
            {t('dashboard.vault_actions.multisig')}
          </Button>
        )}
      </div>

      {ownership === 'pending' && signer && (
        <Button
          size="sm"
          variant="secondary"
          onClick={onClaim}
          disabled={claiming}
          className="w-full"
        >
          {claiming ? t('dashboard.ownership.claiming') : t('dashboard.vault_actions.finalize')}
        </Button>
      )}
    </div>
  );
}

function VaultActionCards({
  vaults,
  signer,
  account,
  onOpenPayment,
  onOwnershipClaimed,
  onOpenRules,
  onOpenVaults,
  onOpenAutomation,
  onOpenMultisig,
}: {
  vaults: Array<{ safe: string; label: string; multisigController: string }>;
  signer: ethers.Signer | null;
  account: string | null;
  onOpenPayment: (vault: { safe: string; label: string }) => void;
  onOwnershipClaimed: () => void;
  onOpenRules: (safe: string) => void;
  onOpenVaults: () => void;
  onOpenAutomation: (safe: string) => void;
  onOpenMultisig: (vault: { safe: string; multisigController: string }) => void;
}) {
  const { t } = useI18n();
  const [ownershipMap, setOwnershipMap] = useState<Record<string, 'owner' | 'pending' | 'none'>>({});
  const [claimingVault, setClaimingVault] = useState<string | null>(null);

  useEffect(() => {
    if (!signer || !account || vaults.length === 0) {
      setOwnershipMap({});
      return;
    }

    let cancelled = false;

    const loadStatuses = async () => {
      const provider = signer.provider;
      if (!provider) return;

      const statuses = await Promise.all(
        vaults.map(async (vault) => ([vault.safe.toLowerCase(), await checkVaultOwnership(vault.safe, account, provider)] as const))
      );

      if (!cancelled) {
        setOwnershipMap(Object.fromEntries(statuses));
      }
    };

    void loadStatuses();

    return () => {
      cancelled = true;
    };
  }, [account, signer, vaults]);

  const handleClaimVault = useCallback(async (vault: { safe: string; label: string }) => {
    if (!signer) return;
    setClaimingVault(vault.safe);
    try {
      await claimVaultOwnership(vault.safe, signer);
      setOwnershipMap((current) => ({ ...current, [vault.safe.toLowerCase()]: 'owner' }));
      onOwnershipClaimed();
    } finally {
      setClaimingVault(null);
    }
  }, [onOwnershipClaimed, signer]);

  if (vaults.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard.vault_actions.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('dashboard.vault_actions.desc')}</p>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {vaults.map((vault) => {
            const ownership = ownershipMap[vault.safe.toLowerCase()] ?? 'none';
            return (
              <VaultActionCardItem
                key={vault.safe}
                vault={vault}
                signer={signer}
                account={account}
                ownership={ownership}
                claiming={claimingVault === vault.safe}
                onClaim={() => { void handleClaimVault(vault); }}
                onOpenPayment={() => onOpenPayment(vault)}
                onOpenRules={() => onOpenRules(vault.safe)}
                onOpenVaults={onOpenVaults}
                onOpenAutomation={() => onOpenAutomation(vault.safe)}
                onOpenMultisig={() => onOpenMultisig(vault)}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const { isAdvanced } = useMode();
  const { registry, account, isConnected, connect, signer } = useWeb3();
  const { vaults, loading: vaultsLoading, refresh: refreshVaults } = useVaults(registry, account);
  const { completed: onboardingCompleted, setWizardMode } = useOnboarding();

  const [totalBalance, setTotalBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [sendPaymentOpen, setSendPaymentOpen] = useState(false);
  const [selectedVaultForPayment, setSelectedVaultForPayment] = useState<{ safe: string; label: string } | null>(null);
  const [keeperActivity, setKeeperActivity] = useState<{ amount: string; createdAt: number }[]>([]);
  const [volumeLoading, setVolumeLoading] = useState(false);
  const [volumePeriod, setVolumePeriod] = useState<'7d' | '30d'>('7d');

  const createHref = isAdvanced ? '/vaults/create' : '/setup';
  const emptyActionLabel = isConnected ? t('dashboard.new_vault') : t('dashboard.connect_wallet_btn');
  const handleEmptyAction = () => {
    if (isConnected) {
      router.push(createHref);
      return;
    }
    connect();
  };

  const openRulesForVault = useCallback((safe: string) => {
    router.push(`/rules?safe=${encodeURIComponent(safe)}`);
  }, [router]);

  // ── Auto-open onboarding when connected with no vaults ─────────────────────
  const onboardingTriggered = useRef(false);
  useEffect(() => {
    if (
      isConnected &&
      !vaultsLoading &&
      vaults.length === 0 &&
      !onboardingCompleted &&
      !onboardingTriggered.current
    ) {
      onboardingTriggered.current = true;
      if (isAdvanced) {
        setWizardMode('expert');
        router.push('/vaults/create');
      } else {
        setWizardMode('simple');
        router.push('/setup');
      }
    }
    // Reset so it can trigger again if user disconnects and reconnects
    if (!isConnected) onboardingTriggered.current = false;
  }, [isConnected, vaultsLoading, vaults.length, onboardingCompleted, isAdvanced, router, setWizardMode]);

  // ── Load vault balances ────────────────────────────────────────────────────
  const loadBalances = useCallback(async () => {
    if (!vaults.length) { setTotalBalance('0.0000'); return; }
    setBalanceLoading(true);
    try {
      const provider = getReadOnlyProvider();
      const balances = await Promise.all(
        vaults.map((v) => provider.getBalance(v.safe).catch(() => BigInt(0)))
      );
      const total = balances.reduce((sum, b) => sum + BigInt(b), BigInt(0));
      setTotalBalance(parseFloat(ethers.formatEther(total)).toFixed(4));
    } catch {
      setTotalBalance('—');
    } finally {
      setBalanceLoading(false);
    }
  }, [vaults]);

  useEffect(() => { loadBalances(); }, [loadBalances]);

  // ── Scheduler: load upcoming payments ────────────────────────────────────
  const scheduler = useMemo(() => {
    if (!SCHEDULER_ADDRESS) return null;
    return getSchedulerContract(SCHEDULER_ADDRESS, signer ?? getReadOnlyProvider());
  }, [signer]);

  const loadScheduledPayments = useCallback(async () => {
    if (!scheduler || !account || vaults.length === 0) { setEvents([]); return; }
    try {
      const taskIdGroups = await Promise.all(vaults.map((v) => scheduler.getTasksForVault(v.safe)));
      const uniqueIds = [...new Set(taskIdGroups.flat())];
      if (uniqueIds.length === 0) { setEvents([]); return; }
      const records = await Promise.all(uniqueIds.map(async (id) => {
        const task = await scheduler.getTask(id);
        return taskToPaymentEvent(id, task);
      }));
      setEvents(records.sort((a, b) => a.date.getTime() - b.date.getTime()));
    } catch {
      setEvents([]);
    }
  }, [scheduler, account, vaults]);

  useEffect(() => { void loadScheduledPayments(); }, [loadScheduledPayments]);

  // ── Load transfer volume from keeper activity ─────────────────────────────
  const loadVolume = useCallback(async () => {
    if (!vaults.length) { setKeeperActivity([]); return; }
    setVolumeLoading(true);
    try {
      const params = new URLSearchParams();
      vaults.forEach((v) => params.append('vault', v.safe));
      const res = await fetch(`/api/keeper-activity?${params.toString()}`);
      if (!res.ok) throw new Error('fetch failed');
      const { activity } = await res.json() as { activity: Array<{ status: string; amount: string; createdAt: number }> };
      setKeeperActivity(activity.filter((e) => e.status === 'approved').map((e) => ({ amount: e.amount, createdAt: e.createdAt })));
    } catch {
      setKeeperActivity([]);
    } finally {
      setVolumeLoading(false);
    }
  }, [vaults]);

  useEffect(() => { void loadVolume(); }, [loadVolume]);

  const loading = vaultsLoading || balanceLoading;

  const transferVolume = useMemo(() => {
    const cutoff = Date.now() - (volumePeriod === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000;
    const total = keeperActivity
      .filter((e) => e.createdAt >= cutoff)
      .reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0);
    return total.toFixed(4);
  }, [keeperActivity, volumePeriod]);

  // ── Derive display data ────────────────────────────────────────────────────
  const agents: AgentMiniRecord[] = [];
  const vaultCount = vaults.length;
  const graphSpaces = vaults.slice(0, 4).map((vault, index) => ({
    label: vault.label || vault.safe.slice(0, 8),
      status: index === 1 ? ('pending' as const) : ('active' as const),
    }));

  const balanceDisplay = isConnected
    ? `${totalBalance ?? '0.0000'} LYX`
    : '—';

  if (!isAdvanced) {
    return (
      <div className="space-y-6">
        <section
          className="rounded-[28px] p-6 md:p-8"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid #10B981',
          }}
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
                Vault overview
              </p>
              <h1
                style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 300, letterSpacing: '0.05em', color: 'var(--text)' }}
              >
                {balanceDisplay}
              </h1>
              <p className="text-sm md:text-base" style={{ color: 'var(--text-muted)' }}>
                {t('dashboard.trust')}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {isConnected ? (
                <Link href={createHref}>
                  <Button size="sm">{t('dashboard.new_vault')}</Button>
                </Link>
              ) : (
                <Button size="sm" onClick={connect}>{t('dashboard.connect_wallet_btn')}</Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
            <StatusChip label={t('dashboard.status.active')} value={String(vaultCount)} tone="success" />
            <StatusChip label={t('dashboard.graph.title')} value={graphSpaces.length ? `${graphSpaces.length}` : '0'} tone="primary" />
            <StatusChip label={t('dashboard.quick.title')} value={events.length ? `${events.length}` : '0'} tone="warning" />
          </div>

          <div
            className="mt-3 rounded-xl px-4 py-3 flex items-center justify-between"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div>
              <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t('dashboard.volume.title')}</p>
              <p className="text-2xl font-semibold" style={{ color: 'var(--accent)' }}>
                {volumeLoading ? '—' : `${transferVolume} LYX`}
              </p>
            </div>
            <div className="flex gap-1">
              {(['7d', '30d'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setVolumePeriod(p)}
                  className="px-3 py-1 text-xs rounded-full transition-all"
                  style={{
                    background: volumePeriod === p ? 'var(--text)' : 'transparent',
                    color: volumePeriod === p ? 'var(--bg)' : 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {p === '7d' ? t('dashboard.volume.7d') : t('dashboard.volume.30d')}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.9fr] gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.graph.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <PermissionGraph spaces={graphSpaces} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.quick.title')}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
              <QuickActionButton label={t('dashboard.quick.pause')} onClick={() => router.push('/automation')} />
              <QuickActionButton label={t('dashboard.quick.add_recipient')} onClick={() => router.push('/rules')} />
              <QuickActionButton label={t('dashboard.quick.update_limit')} onClick={() => router.push('/budgets')} />
              <QuickActionButton label={t('dashboard.quick.run_now')} onClick={() => router.push('/automation')} />
              {isConnected && vaults.length > 0 && (
                <QuickActionButton label="Send payment now" onClick={() => setSendPaymentOpen(true)} />
              )}
            </CardContent>
          </Card>
        </div>

        <VerifiedRunsPanel />

        <OwnershipRecoveryPanel
          vaults={vaults.map((vault) => ({ safe: vault.safe, label: vault.label, multisigController: vault.multisigController }))}
          registry={registry}
          signer={signer}
          account={account}
          onClaimed={refreshVaults}
        />

        <VaultActionCards
          vaults={vaults.map((vault) => ({ safe: vault.safe, label: vault.label, multisigController: vault.multisigController }))}
          signer={signer}
          account={account}
          onOpenPayment={(vault) => {
            setSelectedVaultForPayment(vault);
            setSendPaymentOpen(true);
          }}
          onOwnershipClaimed={refreshVaults}
          onOpenRules={openRulesForVault}
          onOpenVaults={() => router.push('/vaults')}
          onOpenAutomation={(safe) => router.push(`/automation?safe=${encodeURIComponent(safe)}`)}
          onOpenMultisig={(vault) => router.push(`/vaults/${vault.safe}/multisig?ms=${encodeURIComponent(vault.multisigController)}`)}
        />

        <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t('dashboard.upcoming_payments')}</CardTitle>
                <Link href="/automation">
                  <span className="text-xs hover:underline cursor-pointer" style={{ color: 'var(--accent)' }}>{t('common.view_all')}</span>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {events.length > 0 ? <PaymentTimeline events={events} /> : <EmptyTimeline actionLabel={t('dashboard.quick.run_now')} onAction={() => router.push('/automation')} />}
            </CardContent>
          </Card>

        {/* ─── Expert Mode entry point ───────────────────────────────────── */}
        <div
          className="rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          style={{
            background: 'rgba(255,176,0,0.05)',
            border: '1px solid rgba(255,176,0,0.2)',
          }}
        >
          <div className="space-y-0.5">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {t('dashboard.expert_banner.title')}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('dashboard.expert_banner.desc')}
            </p>
          </div>
          <button
            onClick={() => router.push('/settings')}
            className="whitespace-nowrap text-sm font-semibold px-4 py-2 rounded-xl transition-opacity hover:opacity-85 flex-shrink-0"
            style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
          >
            {t('dashboard.expert_banner.cta')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.advanced_controls')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdvancedControlsTabs pathname={pathname} onNavigate={(href) => router.push(href)} />
        </CardContent>
      </Card>

      {/* ─── Header: Balance total ─── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>{t('dashboard.total_balance')}</p>
          {loading ? (
            <Skeleton className="h-9 w-40" />
          ) : (
            <div className="flex items-baseline gap-3">
              <h1 className="text-4xl font-bold" style={{ color: 'var(--text)' }}>
                {balanceDisplay}
              </h1>
              {isConnected && !volumeLoading && (
                <span
                  className="text-sm font-medium px-2 py-0.5 rounded-full"
                  style={{ color: 'var(--accent)', background: 'rgba(34,255,178,0.1)' }}
                >
                  {transferVolume} LYX
                </span>
              )}
            </div>
          )}
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {t('dashboard.this_month')} · {vaultCount} {t('dashboard.active_vaults')}
          </p>
        </div>

        {isConnected ? (
          <Link href={createHref}>
            <Button size="sm">{t('dashboard.new_vault')}</Button>
          </Link>
        ) : (
          <Button size="sm" onClick={connect}>{t('dashboard.connect_wallet_btn')}</Button>
        )}
      </div>

      {/* ─── Permission Map ─── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.graph.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <PermissionGraph
            spaces={vaults.map((v) => ({
              label: (v as { label?: string }).label ?? v.safe.slice(0, 8),
              status: 'active' as const,
            }))}
          />
        </CardContent>
      </Card>

      <VerifiedRunsPanel />

      <OwnershipRecoveryPanel
        vaults={vaults.map((vault) => ({ safe: vault.safe, label: vault.label, multisigController: vault.multisigController }))}
        registry={registry}
        signer={signer}
        account={account}
        onClaimed={refreshVaults}
      />

      <VaultActionCards
          vaults={vaults.map((vault) => ({ safe: vault.safe, label: vault.label, multisigController: vault.multisigController }))}
        signer={signer}
        account={account}
        onOpenPayment={(vault) => {
          setSelectedVaultForPayment(vault);
          setSendPaymentOpen(true);
        }}
        onOwnershipClaimed={refreshVaults}
        onOpenRules={openRulesForVault}
        onOpenVaults={() => router.push('/vaults')}
        onOpenAutomation={(safe) => router.push(`/automation?safe=${encodeURIComponent(safe)}`)}
          onOpenMultisig={(vault) => router.push(`/vaults/${vault.safe}/multisig?ms=${encodeURIComponent(vault.multisigController)}`)}
      />

      {/* ─── Bottom: Agents scroll + Payment timeline ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card>
          <CardContent className="pt-4">
            {agents.length > 0 ? (
              <AgentCardScroll
                agents={agents}
                onAgentClick={() => router.push('/agents')}
                onAddAgent={() => router.push('/agents')}
              />
            ) : (
              <EmptyAgents actionLabel={emptyActionLabel} onAction={handleEmptyAction} />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t('dashboard.upcoming_payments')}</CardTitle>
              <Link href="/automation">
                <span className="text-xs hover:underline cursor-pointer" style={{ color: 'var(--accent)' }}>{t('common.view_all')}</span>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {events.length > 0 ? (
              <PaymentTimeline events={events} />
            ) : (
              <EmptyTimeline actionLabel={t('dashboard.quick.run_now')} onAction={() => router.push('/automation')} />
            )}
          </CardContent>
        </Card>
      </div>

      <SendPaymentModal
        open={sendPaymentOpen}
        onClose={() => {
          setSendPaymentOpen(false);
          setSelectedVaultForPayment(null);
        }}
        signer={signer}
        vaultSafe={selectedVaultForPayment?.safe}
        vaultLabel={selectedVaultForPayment?.label}
        vaults={selectedVaultForPayment ? undefined : vaults.map((v) => ({ safe: v.safe, label: v.label }))}
      />
    </div>
  );
}
