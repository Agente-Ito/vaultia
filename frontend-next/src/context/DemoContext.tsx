'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { BudgetNode } from '@/components/dashboard/BudgetTreeView';
import type { AgentMiniRecord } from '@/components/dashboard/AgentCardScroll';
import type { PaymentEvent } from '@/components/dashboard/PaymentTimeline';

// ─── Demo data ────────────────────────────────────────────────────────────────

export interface DemoMerchant {
  address: string;
  name: string;
  emoji: string;
  category: string;
}

const _now = new Date();

export const DEMO_BUDGET_NODES: BudgetNode[] = [
  {
    id: 'root',
    label: 'Total Budget',
    emoji: '💰',
    spent: 4872,
    total: 5000,
    period: 'monthly',
    children: [
      {
        id: 'living',
        label: 'Household',
        emoji: '🏠',
        spent: 2950,
        total: 3500,
        period: 'monthly',
        children: [
          { id: 'food',    label: 'Groceries', emoji: '🛒', spent: 720,  total: 800,  period: 'monthly' },
          { id: 'housing', label: 'Housing',   emoji: '🏡', spent: 2230, total: 2700, period: 'monthly' },
        ],
      },
      {
        id: 'investments',
        label: 'Investments',
        emoji: '📈',
        spent: 780,
        total: 1500,
        period: 'monthly',
      },
    ],
  },
];

export const DEMO_AGENTS: AgentMiniRecord[] = [
  { address: '0xdemo1', name: 'Grocery Bot',      emoji: '🛒', role: 'GROCERY_AGENT',      spentToday: 42, active: true },
  { address: '0xdemo2', name: 'Rent Bot',          emoji: '🏠', role: 'SUBSCRIPTION_AGENT', spentToday: 0,  active: false, nextPayment: 'Apr 1' },
  { address: '0xdemo3', name: 'DeFi Bot',          emoji: '📈', role: 'TRADE_AGENT',         spentToday: 0,  active: false, nextPayment: 'Apr 12' },
  { address: '0xdemo4', name: 'Subscription Bot',  emoji: '🎵', role: 'SUBSCRIPTION_AGENT', spentToday: 11, active: true },
];

export const DEMO_EVENTS: PaymentEvent[] = [
  {
    id: 'd1',
    date: new Date(_now.getFullYear(), _now.getMonth(), 28),
    label: 'Monthly rent',
    amount: 1200,
    currency: '$',
    botName: 'Rent Bot',
    botEmoji: '🏠',
    status: 'scheduled',
  },
  {
    id: 'd2',
    date: new Date(_now.getFullYear(), _now.getMonth() + 1, 5),
    label: 'Spotify Premium',
    amount: 11,
    currency: '$',
    botName: 'Subscription Bot',
    botEmoji: '🎵',
    status: 'scheduled',
  },
  {
    id: 'd3',
    date: new Date(_now.getFullYear(), _now.getMonth() - 1, 15),
    label: 'Weekly groceries',
    amount: 87,
    currency: '$',
    botName: 'Grocery Bot',
    botEmoji: '🛒',
    status: 'completed',
  },
  {
    id: 'd4',
    date: new Date(_now.getFullYear(), _now.getMonth() + 1, 12),
    label: '60/40 Rebalance',
    amount: 0,
    currency: '',
    botName: 'DeFi Bot',
    botEmoji: '📈',
    status: 'scheduled',
  },
];

export const DEMO_MERCHANTS: DemoMerchant[] = [
  { address: '0xmerch1', name: 'Whole Foods',    emoji: '🛒', category: 'Groceries' },
  { address: '0xmerch2', name: 'Netflix',        emoji: '🎬', category: 'Subscriptions' },
  { address: '0xmerch3', name: 'Spotify',        emoji: '🎵', category: 'Subscriptions' },
  { address: '0xmerch4', name: 'Landlord',       emoji: '🏡', category: 'Housing' },
  { address: '0xmerch5', name: 'Uniswap Router', emoji: '🔄', category: 'DeFi' },
];

// ─── Context ──────────────────────────────────────────────────────────────────

interface DemoContextType {
  isDemo: boolean;
  enableDemo: () => void;
  disableDemo: () => void;
  demoBudgetNodes: BudgetNode[];
  demoAgents: AgentMiniRecord[];
  demoEvents: PaymentEvent[];
  demoMerchants: DemoMerchant[];
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

const STORAGE_KEY = 'demo-mode';

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [isDemo, setIsDemo] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setIsDemo(localStorage.getItem(STORAGE_KEY) === 'true');
    setHydrated(true);
  }, []);

  const enableDemo = useCallback(() => {
    setIsDemo(true);
    localStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  const disableDemo = useCallback(() => {
    setIsDemo(false);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <DemoContext.Provider
      value={{
        isDemo: hydrated && isDemo,
        enableDemo,
        disableDemo,
        demoBudgetNodes: DEMO_BUDGET_NODES,
        demoAgents:      DEMO_AGENTS,
        demoEvents:      DEMO_EVENTS,
        demoMerchants:   DEMO_MERCHANTS,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo(): DemoContextType {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo must be used within DemoProvider');
  return ctx;
}
