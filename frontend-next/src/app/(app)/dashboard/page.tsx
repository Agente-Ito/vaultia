'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ethers } from 'ethers';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Skeleton } from '@/components/common/Skeleton';
import { BudgetTreeView, type BudgetNode } from '@/components/dashboard/BudgetTreeView';
import { AgentCardScroll, type AgentMiniRecord } from '@/components/dashboard/AgentCardScroll';
import { PaymentTimeline, type PaymentEvent } from '@/components/dashboard/PaymentTimeline';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { getProvider } from '@/lib/web3/provider';
import { useI18n } from '@/context/I18nContext';

// ─── Mock data (replaced by real reads once Budget/Coordinator contracts deployed) ─

const MOCK_BUDGET_NODES: BudgetNode[] = [
  {
    id: 'root',
    label: 'Presupuesto Total',
    emoji: '💰',
    spent: 4872,
    total: 5000,
    period: 'monthly',
    children: [
      {
        id: 'living',
        label: 'Gastos del Hogar',
        emoji: '🏠',
        spent: 2950,
        total: 3500,
        period: 'monthly',
        children: [
          { id: 'food', label: 'Alimentos', emoji: '🛒', spent: 720, total: 800, period: 'monthly' },
          { id: 'housing', label: 'Vivienda', emoji: '🏡', spent: 2230, total: 2700, period: 'monthly' },
        ],
      },
      {
        id: 'investments',
        label: 'Inversiones',
        emoji: '📈',
        spent: 780,
        total: 1500,
        period: 'monthly',
      },
    ],
  },
];

const MOCK_AGENTS: AgentMiniRecord[] = [
  { address: '0x1', name: 'Grocery Bot', emoji: '🛒', role: 'GROCERY_AGENT', spentToday: 42, active: true },
  { address: '0x2', name: 'Rent Bot', emoji: '🏠', role: 'SUBSCRIPTION_AGENT', spentToday: 0, active: false, nextPayment: '1 abr' },
  { address: '0x3', name: 'DeFi Bot', emoji: '📈', role: 'TRADE_AGENT', spentToday: 0, active: false, nextPayment: '12 abr' },
];

const _now = new Date();
const MOCK_EVENTS: PaymentEvent[] = [
  {
    id: '1',
    date: new Date(_now.getFullYear(), _now.getMonth(), 28),
    label: 'Renta mensual',
    amount: 1200,
    currency: '$',
    botName: 'Rent Bot',
    botEmoji: '🏠',
    status: 'scheduled',
  },
  {
    id: '2',
    date: new Date(_now.getFullYear(), _now.getMonth() + 1, 5),
    label: 'Spotify Premium',
    amount: 11,
    currency: '$',
    botName: 'Subscription Bot',
    botEmoji: '🎵',
    status: 'scheduled',
  },
  {
    id: '3',
    date: new Date(_now.getFullYear(), _now.getMonth() + 1, 12),
    label: 'Rebalanceo 60/40',
    amount: 0,
    currency: '',
    botName: 'DeFi Bot',
    botEmoji: '📈',
    status: 'scheduled',
  },
];

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

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { registry, account, isConnected, connect } = useWeb3();
  const { vaults, loading: vaultsLoading } = useVaults(registry, account);
  const [totalBalance, setTotalBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('root');

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

  const loading = vaultsLoading || balanceLoading;
  const selectedNode = findNode(MOCK_BUDGET_NODES, selectedNodeId);

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
                {isConnected ? `${totalBalance ?? '0.0000'} LYX` : '—'}
              </h1>
              <span className="text-sm font-medium text-green-500 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                ↑ 3%
              </span>
            </div>
          )}
          <p className="text-xs text-neutral-400 mt-1">{t('dashboard.this_month')} · {vaults.length} {t('dashboard.active_vaults')}</p>
        </div>

        {isConnected ? (
          <Link href="/vaults/create">
            <Button size="sm">{t('dashboard.new_vault')}</Button>
          </Link>
        ) : (
          <Button size="sm" onClick={connect}>{t('dashboard.connect_wallet_btn')}</Button>
        )}
      </div>

      {/* ─── Main: Budget tree + detail panel ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Tree */}
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
              <BudgetTreeView
                nodes={MOCK_BUDGET_NODES}
                selectedId={selectedNodeId}
                onSelect={(node) => setSelectedNodeId(node.id)}
                onAddCategory={() => router.push('/budgets')}
              />
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
                {t('dashboard.click_category')}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ─── Bottom: Agents scroll + Payment timeline ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardContent className="pt-4">
            <AgentCardScroll
              agents={MOCK_AGENTS}
              onAgentClick={() => router.push('/agents')}
              onAddAgent={() => router.push('/agents')}
            />
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
            <PaymentTimeline events={MOCK_EVENTS} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
