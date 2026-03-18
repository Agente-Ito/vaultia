'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ethers } from 'ethers';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Skeleton } from '@/components/common/Skeleton';
import { BudgetTreeView, type BudgetNode } from '@/components/dashboard/BudgetTreeView';
import { AgentCardScroll } from '@/components/dashboard/AgentCardScroll';
import { PaymentTimeline } from '@/components/dashboard/PaymentTimeline';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { useOnboarding } from '@/context/OnboardingContext';
import { useDemo } from '@/context/DemoContext';
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

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { registry, account, isConnected, connect } = useWeb3();
  const { vaults, loading: vaultsLoading } = useVaults(registry, account);
  const { open: openOnboarding, completed: onboardingCompleted } = useOnboarding();
  const { isDemo, enableDemo, demoBudgetNodes, demoAgents, demoEvents } = useDemo();

  const [totalBalance, setTotalBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('root');

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

  // ── Derive display data ────────────────────────────────────────────────────
  const budgetNodes    = isDemo ? demoBudgetNodes    : [];
  const agents         = isDemo ? demoAgents         : [];
  const events         = isDemo ? demoEvents         : [];
  const vaultCount     = isDemo ? 2 : vaults.length;
  const selectedNode   = findNode(budgetNodes, selectedNodeId);

  const balanceDisplay = isDemo
    ? '13,247.00 LYX'
    : isConnected
      ? `${totalBalance ?? '0.0000'} LYX`
      : '—';

  return (
    <div className="space-y-6">

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
