'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Interface, ethers } from 'ethers';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Skeleton } from '@/components/common/Skeleton';
import { AgentCardScroll, type AgentMiniRecord } from '@/components/dashboard/AgentCardScroll';
import { PaymentTimeline, type PaymentEvent } from '@/components/dashboard/PaymentTimeline';
import { PermissionGraph } from '@/components/dashboard/PermissionGraph';
import { VerifiedRunsPanel } from '@/components/dashboard/VerifiedRunsPanel';
import { SendPaymentModal } from '@/components/vaults/SendPaymentModal';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { useOnboarding } from '@/context/OnboardingContext';
import { useMode } from '@/context/ModeContext';
import { getProvider, getReadOnlyProvider } from '@/lib/web3/provider';
import { getSchedulerContract } from '@/lib/web3/contracts';
import { useI18n } from '@/context/I18nContext';

// ─── Scheduler helpers ────────────────────────────────────────────────────────

const SCHEDULER_ADDRESS = process.env.NEXT_PUBLIC_TASK_SCHEDULER_ADDRESS ?? '';
const _kmIface = new Interface(['function execute(bytes _data)']);
const _safeIface = new Interface(['function execute(uint256 operation, address to, uint256 value, bytes data)']);

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

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const { isAdvanced } = useMode();
  const { registry, account, isConnected, connect, signer } = useWeb3();
  const { vaults, loading: vaultsLoading } = useVaults(registry, account);
  const { completed: onboardingCompleted, setWizardMode } = useOnboarding();

  const [totalBalance, setTotalBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [sendPaymentOpen, setSendPaymentOpen] = useState(false);

  const createHref = isAdvanced ? '/vaults/create' : '/setup';
  const emptyActionLabel = isConnected ? t('dashboard.new_vault') : t('dashboard.connect_wallet_btn');
  const handleEmptyAction = () => {
    if (isConnected) {
      router.push(createHref);
      return;
    }
    connect();
  };

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
      const provider = getProvider();
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

  const loading = vaultsLoading || balanceLoading;

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
            style={{ background: 'var(--primary)', color: '#fff' }}
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
              {isConnected && (
                <span
                  className="text-sm font-medium px-2 py-0.5 rounded-full"
                  style={{ color: 'var(--success)', background: 'rgba(34,255,178,0.1)' }}
                >
                  ↑ 3%
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
        onClose={() => setSendPaymentOpen(false)}
        signer={signer}
        vaults={vaults.map((v) => ({ safe: v.safe, label: v.label }))}
      />
    </div>
  );
}
