'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ethers } from 'ethers';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Skeleton } from '@/components/common/Skeleton';
import { BudgetTreeView, type BudgetNode } from '@/components/dashboard/BudgetTreeView';
import { AgentCardScroll } from '@/components/dashboard/AgentCardScroll';
import { PaymentTimeline } from '@/components/dashboard/PaymentTimeline';
import { PermissionGraph } from '@/components/dashboard/PermissionGraph';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { useOnboarding } from '@/context/OnboardingContext';
import { useDemo } from '@/context/DemoContext';
import { useMode } from '@/context/ModeContext';
import { DemoWorkspace } from '@/components/demo/DemoWorkspace';
import { getProvider } from '@/lib/web3/provider';
import { useI18n } from '@/context/I18nContext';

function findNode(nodes: BudgetNode[], id: string): BudgetNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

// ─── Empty-state helpers ──────────────────────────────────────────────────────

function EmptyAgents({ onEnable }: { onEnable: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <span className="text-4xl">🤖</span>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
        {t('dashboard.empty.agents')}
      </p>
      <Button size="sm" variant="secondary" onClick={onEnable}>
        {t('demo.try_demo')}
      </Button>
    </div>
  );
}

function EmptyTimeline({ onEnable }: { onEnable: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <span className="text-4xl">📅</span>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
        {t('dashboard.empty.timeline')}
      </p>
      <Button size="sm" variant="secondary" onClick={onEnable}>
        {t('demo.try_demo')}
      </Button>
    </div>
  );
}

function EmptyBudgetTree({ onEnable }: { onEnable: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <span className="text-4xl">💰</span>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
        {t('dashboard.empty.budget')}
      </p>
      <Button size="sm" variant="secondary" onClick={onEnable}>
        {t('demo.try_demo')}
      </Button>
    </div>
  );
}

function StatusChip({ label, value, tone }: { label: string; value: string; tone: 'primary' | 'success' | 'warning' }) {
  const colorMap = {
    primary: 'var(--primary)',
    success: 'var(--success)',
    warning: 'var(--warning)',
  } as const;

  return (
    <div
      className="rounded-2xl px-4 py-4 space-y-1"
      style={{ background: 'var(--card-mid)', border: '1px solid var(--border)' }}
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
      style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
    >
      {label}
    </button>
  );
}

function AdvancedControlsTabs({ pathname, onNavigate }: { pathname: string; onNavigate: (href: string) => void }) {
  const { t } = useI18n();
  const tabs = [
    { href: '/dashboard', label: t('nav.dashboard') },
    { href: '/vaults', label: t('nav.spaces') },
    { href: '/rules', label: t('nav.spending_rules') },
    { href: '/automation', label: t('nav.automation') },
    { href: '/agents', label: t('nav.automations') },
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
              background: active ? 'var(--primary)' : 'var(--card-mid)',
              color: active ? '#fff' : 'var(--text)',
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
  const { registry, account, isConnected, connect } = useWeb3();
  const { vaults, loading: vaultsLoading } = useVaults(registry, account);
  const { open: openOnboarding, completed: onboardingCompleted } = useOnboarding();
  const { isDemo, enableDemo, demoBudgetNodes, demoAgents, demoEvents } = useDemo();

  const [totalBalance, setTotalBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('root');

  // ── Demo mode: render the interactive sandbox ──────────────────────────────
  // (hooks must all be called before any conditional return)
  const shouldShowDemo = isDemo;

  // ── Auto-open onboarding when connected with no vaults ─────────────────────
  const onboardingTriggered = useRef(false);
  useEffect(() => {
    if (
      isConnected &&
      !vaultsLoading &&
      !isDemo &&
      vaults.length === 0 &&
      !onboardingCompleted &&
      !onboardingTriggered.current
    ) {
      onboardingTriggered.current = true;
      openOnboarding();
    }
    // Reset so it can trigger again if user disconnects and reconnects
    if (!isConnected) onboardingTriggered.current = false;
  }, [isConnected, vaultsLoading, vaults.length, isDemo, onboardingCompleted, openOnboarding]);

  // ── Load vault balances ────────────────────────────────────────────────────
  const loadBalances = useCallback(async () => {
    if (isDemo) { setTotalBalance('13,247.00'); return; }
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
  }, [vaults, isDemo]);

  useEffect(() => { loadBalances(); }, [loadBalances]);

  const loading = vaultsLoading || balanceLoading;

  if (shouldShowDemo) return <DemoWorkspace />;

  // ── Derive display data ────────────────────────────────────────────────────
  const budgetNodes    = isDemo ? demoBudgetNodes    : [];
  const agents         = isDemo ? demoAgents         : [];
  const events         = isDemo ? demoEvents         : [];
  const vaultCount     = isDemo ? 2 : vaults.length;
  const selectedNode   = findNode(budgetNodes, selectedNodeId);
  const graphSpaces = (isDemo
    ? [
        { label: 'Payments', status: 'active' as const, recipients: ['Alice', 'Bob'], agentLabel: 'Vaultia' },
        { label: 'Subscriptions', status: 'active' as const, recipients: ['Services'], agentLabel: 'Scheduler' },
        { label: 'Savings', status: 'pending' as const, recipients: ['Pool'] },
      ]
    : vaults.slice(0, 4).map((vault, index) => ({
        label: vault.label || vault.safe.slice(0, 8),
      status: index === 1 ? ('pending' as const) : ('active' as const),
      }))
  );

  const balanceDisplay = isDemo
    ? '13,247.00 LYX'
    : isConnected
      ? `${totalBalance ?? '0.0000'} LYX`
      : '—';

  if (!isAdvanced) {
    return (
      <div className="space-y-6">
        <section
          className="rounded-[28px] p-6 md:p-8"
          style={{
            background: 'linear-gradient(135deg, rgba(123,97,255,0.16) 0%, rgba(60,242,255,0.08) 55%, rgba(18,26,47,0.95) 100%)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
                Smart Money Space
              </p>
              <h1 className="text-3xl md:text-4xl font-semibold" style={{ color: 'var(--text)' }}>
                {balanceDisplay}
              </h1>
              <p className="text-sm md:text-base" style={{ color: 'var(--text-muted)' }}>
                {t('dashboard.trust')}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {isConnected || isDemo ? (
                <Link href="/vaults/create">
                  <Button size="sm">{t('dashboard.new_vault')}</Button>
                </Link>
              ) : (
                <Button size="sm" onClick={connect}>{t('dashboard.connect_wallet_btn')}</Button>
              )}
              <Button variant="secondary" size="sm" onClick={openOnboarding}>
                {t('nav.setup_cta')}
              </Button>
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
              <QuickActionButton label={t('dashboard.quick.run_now')} onClick={() => router.push('/missions/create')} />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.upcoming_payments')}</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length > 0 ? <PaymentTimeline events={events} /> : <EmptyTimeline onEnable={enableDemo} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.budget_tree')}</CardTitle>
            </CardHeader>
            <CardContent>
              {budgetNodes.length > 0 ? (
                <BudgetTreeView
                  nodes={budgetNodes}
                  selectedId={selectedNodeId}
                  onSelect={(node) => setSelectedNodeId(node.id)}
                  onAddCategory={() => router.push('/budgets')}
                />
              ) : (
                <EmptyBudgetTree onEnable={enableDemo} />
              )}
            </CardContent>
          </Card>
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
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-1">{t('dashboard.total_balance')}</p>
          {loading ? (
            <Skeleton className="h-9 w-40" />
          ) : (
            <div className="flex items-baseline gap-3">
              <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-50">
                {balanceDisplay}
              </h1>
              {isDemo && (
                <span className="text-sm font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                  {t('demo.label')}
                </span>
              )}
              {!isDemo && isConnected && (
                <span className="text-sm font-medium text-green-500 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                  ↑ 3%
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-neutral-400 mt-1">
            {t('dashboard.this_month')} · {vaultCount} {t('dashboard.active_vaults')}
          </p>
        </div>

        {isConnected || isDemo ? (
          <Link href="/vaults/create">
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

      {/* ─── Main: Budget tree + detail panel ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t('dashboard.budget_tree')}</CardTitle>
                <Link href="/budgets">
                  <span className="text-xs text-primary-500 hover:underline cursor-pointer">{t('common.view_all')}</span>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {budgetNodes.length > 0 ? (
                <BudgetTreeView
                  nodes={budgetNodes}
                  selectedId={selectedNodeId}
                  onSelect={(node) => setSelectedNodeId(node.id)}
                  onAddCategory={() => router.push('/budgets')}
                />
              ) : (
                <EmptyBudgetTree onEnable={enableDemo} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail panel */}
        <div>
          {selectedNode ? (
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span>{selectedNode.emoji}</span>
                  <span>{selectedNode.label}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-500">{t('dashboard.detail.spent')}</span>
                    <span className="font-semibold text-neutral-900 dark:text-neutral-50">${selectedNode.spent.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-500">{t('dashboard.detail.limit')}</span>
                    <span className="font-semibold text-neutral-900 dark:text-neutral-50">${selectedNode.total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-500">{t('dashboard.detail.available')}</span>
                    <span className={`font-semibold ${selectedNode.total - selectedNode.spent >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      ${Math.max(0, selectedNode.total - selectedNode.spent).toLocaleString()}
                    </span>
                  </div>
                </div>
                <Link href="/budgets">
                  <Button variant="secondary" size="sm" fullWidth>
                    {t('dashboard.manage_budget')}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8 text-neutral-400 text-sm">
                {budgetNodes.length > 0 ? t('dashboard.click_category') : t('dashboard.empty.no_selection')}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ─── Bottom: Agents scroll + Payment timeline ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardContent className="pt-4">
            {agents.length > 0 ? (
              <AgentCardScroll
                agents={agents}
                onAgentClick={() => router.push('/agents')}
                onAddAgent={() => router.push('/agents')}
              />
            ) : (
              <EmptyAgents onEnable={enableDemo} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t('dashboard.upcoming_payments')}</CardTitle>
              <Link href="/automation">
                <span className="text-xs text-primary-500 hover:underline cursor-pointer">{t('common.view_all')}</span>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {events.length > 0 ? (
              <PaymentTimeline events={events} />
            ) : (
              <EmptyTimeline onEnable={enableDemo} />
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
