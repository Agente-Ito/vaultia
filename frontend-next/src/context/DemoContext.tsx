'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { BudgetNode } from '@/components/dashboard/BudgetTreeView';
import type { AgentMiniRecord } from '@/components/dashboard/AgentCardScroll';
import type { PaymentEvent } from '@/components/dashboard/PaymentTimeline';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DemoMerchant {
  address: string;
  name: string;
  emoji: string;
  category: string;
}

export type DemoPersonaId = 'individual' | 'business' | 'dao';
export type DemoPeriod   = 'daily' | 'weekly' | 'monthly';

export interface DemoSubVaultDef {
  id: string;
  label: string;
  emoji: string;
  spent: number;
  total: number;
  period: DemoPeriod;
  activeByDefault: boolean;
}

export interface DemoPersonaDef {
  id: DemoPersonaId;
  label: string;
  emoji: string;
  vaultName: string;
  totalSpent: number;
  totalBudget: number;
  period: DemoPeriod;
  subVaults: DemoSubVaultDef[];
  merchants: DemoMerchant[];
  agents: AgentMiniRecord[];
  events: PaymentEvent[];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const _now = new Date();
const daysFromNow = (n: number) => new Date(_now.getTime() + n * 24 * 3600 * 1000);
const daysAgo     = (n: number) => new Date(_now.getTime() - n * 24 * 3600 * 1000);

// ─── Demo persona definitions ─────────────────────────────────────────────────

export const DEMO_PERSONAS: DemoPersonaDef[] = [
  // ── Individual ───────────────────────────────────────────────────────────────
  {
    id: 'individual',
    label: 'Individual',
    emoji: '🧑',
    vaultName: 'Family Vault',
    totalSpent: 4872,
    totalBudget: 5000,
    period: 'monthly',
    subVaults: [
      { id: 'daily',      label: 'Daily Expenses', emoji: '🛒', spent: 720,  total: 800,  period: 'monthly', activeByDefault: true  },
      { id: 'bills',      label: 'Bills',           emoji: '🏡', spent: 1200, total: 1500, period: 'monthly', activeByDefault: true  },
      { id: 'savings',    label: 'Savings',         emoji: '💎', spent: 500,  total: 1000, period: 'monthly', activeByDefault: true  },
      { id: 'emergency',  label: 'Emergency Fund',  emoji: '🚨', spent: 0,    total: 500,  period: 'monthly', activeByDefault: false },
      { id: 'healthcare', label: 'Healthcare',      emoji: '🏥', spent: 452,  total: 600,  period: 'monthly', activeByDefault: true  },
    ],
    merchants: [
      { address: '0xmerch1', name: 'Whole Foods',  emoji: '🛒', category: 'Groceries'    },
      { address: '0xmerch2', name: 'Netflix',       emoji: '🎬', category: 'Entertainment'},
      { address: '0xmerch3', name: 'Spotify',       emoji: '🎵', category: 'Entertainment'},
      { address: '0xmerch4', name: 'Landlord',      emoji: '🏡', category: 'Housing'      },
      { address: '0xmerch5', name: 'Pharmacy',      emoji: '💊', category: 'Healthcare'   },
    ],
    agents: [
      { address: '0xindv1', name: 'Grocery Bot',     emoji: '🛒', role: 'GROCERY_AGENT',      spentToday: 42,  active: true                       },
      { address: '0xindv2', name: 'Rent Bot',         emoji: '🏠', role: 'SUBSCRIPTION_AGENT', spentToday: 0,   active: true,  nextPayment: 'Apr 1' },
      { address: '0xindv3', name: 'Subscription Bot', emoji: '🎵', role: 'SUBSCRIPTION_AGENT', spentToday: 11,  active: false, nextPayment: 'Apr 5' },
      { address: '0xindv4', name: 'DeFi Bot',         emoji: '📈', role: 'TRADE_AGENT',         spentToday: 0,   active: false, nextPayment: 'Apr 12'},
    ],
    events: [
      { id: 'ie1', date: daysFromNow(3),  label: 'Monthly rent',     amount: 1200, currency: 'LYX', botName: 'Rent Bot',         botEmoji: '🏠', status: 'scheduled' },
      { id: 'ie2', date: daysFromNow(8),  label: 'Netflix Premium',  amount: 15,   currency: 'LYX', botName: 'Subscription Bot', botEmoji: '🎵', status: 'scheduled' },
      { id: 'ie3', date: daysFromNow(14), label: 'Spotify Monthly',  amount: 11,   currency: 'LYX', botName: 'Subscription Bot', botEmoji: '🎵', status: 'scheduled' },
      { id: 'ie4', date: daysAgo(5),      label: 'Weekly groceries', amount: 87,   currency: 'LYX', botName: 'Grocery Bot',      botEmoji: '🛒', status: 'completed' },
      { id: 'ie5', date: daysAgo(12),     label: 'Pharmacy visit',   amount: 45,   currency: 'LYX', botName: 'Grocery Bot',      botEmoji: '🛒', status: 'completed' },
    ],
  },

  // ── Business ─────────────────────────────────────────────────────────────────
  {
    id: 'business',
    label: 'Business',
    emoji: '🏢',
    vaultName: 'Startup Treasury',
    totalSpent: 28500,
    totalBudget: 50000,
    period: 'monthly',
    subVaults: [
      { id: 'operations', label: 'Operations', emoji: '⚙️', spent: 8200,  total: 12000, period: 'monthly', activeByDefault: true  },
      { id: 'payroll',    label: 'Payroll',    emoji: '👷', spent: 15000, total: 25000, period: 'monthly', activeByDefault: true  },
      { id: 'marketing',  label: 'Marketing',  emoji: '📣', spent: 3200,  total: 8000,  period: 'monthly', activeByDefault: true  },
      { id: 'rnd',        label: 'R&D',        emoji: '🔬', spent: 2100,  total: 8000,  period: 'monthly', activeByDefault: false },
      { id: 'reserve',    label: 'Reserve',    emoji: '🏦', spent: 0,     total: 5000,  period: 'monthly', activeByDefault: false },
    ],
    merchants: [
      { address: '0xbiz1', name: 'AWS',           emoji: '☁️', category: 'Infrastructure' },
      { address: '0xbiz2', name: 'GitHub',         emoji: '🐙', category: 'DevTools'       },
      { address: '0xbiz3', name: 'Figma',          emoji: '🎨', category: 'Design'         },
      { address: '0xbiz4', name: 'Payroll Co',     emoji: '💳', category: 'Finance'        },
      { address: '0xbiz5', name: 'Ad Network',     emoji: '📢', category: 'Marketing'      },
    ],
    agents: [
      { address: '0xbiz_a1', name: 'Payroll Bot',   emoji: '👷', role: 'PAYROLL_AGENT',   spentToday: 15000, active: true                        },
      { address: '0xbiz_a2', name: 'Ops Bot',        emoji: '⚙️', role: 'OPS_AGENT',       spentToday: 420,   active: true                        },
      { address: '0xbiz_a3', name: 'Marketing Bot',  emoji: '📣', role: 'MARKETING_AGENT', spentToday: 0,     active: false, nextPayment: 'Apr 15' },
      { address: '0xbiz_a4', name: 'R&D Bot',        emoji: '🔬', role: 'RND_AGENT',        spentToday: 0,     active: false, nextPayment: 'Apr 20' },
    ],
    events: [
      { id: 'be1', date: daysFromNow(2),  label: 'Monthly payroll',    amount: 15000, currency: 'LYX', botName: 'Payroll Bot',  botEmoji: '👷', status: 'scheduled' },
      { id: 'be2', date: daysFromNow(5),  label: 'AWS cloud bill',     amount: 2400,  currency: 'LYX', botName: 'Ops Bot',      botEmoji: '⚙️', status: 'scheduled' },
      { id: 'be3', date: daysFromNow(10), label: 'Marketing campaign', amount: 3200,  currency: 'LYX', botName: 'Marketing Bot',botEmoji: '📣', status: 'scheduled' },
      { id: 'be4', date: daysAgo(8),      label: 'GitHub Team plan',   amount: 399,   currency: 'LYX', botName: 'Ops Bot',      botEmoji: '⚙️', status: 'completed' },
      { id: 'be5', date: daysAgo(15),     label: 'Figma seats',        amount: 144,   currency: 'LYX', botName: 'Ops Bot',      botEmoji: '⚙️', status: 'completed' },
    ],
  },

  // ── DAO ──────────────────────────────────────────────────────────────────────
  {
    id: 'dao',
    label: 'DAO',
    emoji: '🏛️',
    vaultName: 'Grants Treasury',
    totalSpent: 85000,
    totalBudget: 200000,
    period: 'monthly',
    subVaults: [
      { id: 'grants',     label: 'Grants',     emoji: '🤝', spent: 60000, total: 120000, period: 'monthly', activeByDefault: true  },
      { id: 'community',  label: 'Community',  emoji: '🌱', spent: 15000, total: 30000,  period: 'monthly', activeByDefault: true  },
      { id: 'operations', label: 'Operations', emoji: '⚙️', spent: 8000,  total: 20000,  period: 'monthly', activeByDefault: true  },
      { id: 'reserve',    label: 'Reserve',    emoji: '🏦', spent: 0,     total: 20000,  period: 'monthly', activeByDefault: false },
      { id: 'security',   label: 'Security',   emoji: '🛡️', spent: 2000,  total: 10000,  period: 'monthly', activeByDefault: true  },
    ],
    merchants: [
      { address: '0xdao1', name: 'Gitcoin',      emoji: '🌱', category: 'Grants'      },
      { address: '0xdao2', name: 'Safe Multisig', emoji: '🔐', category: 'Treasury'    },
      { address: '0xdao3', name: 'Snapshot',      emoji: '📸', category: 'Governance'  },
      { address: '0xdao4', name: 'Mirror',        emoji: '✍️', category: 'Publishing'  },
      { address: '0xdao5', name: 'Security Firm', emoji: '🛡️', category: 'Security'    },
    ],
    agents: [
      { address: '0xdao_a1', name: 'Grant Distributor', emoji: '🤝', role: 'GRANTS_AGENT',    spentToday: 5000, active: true                       },
      { address: '0xdao_a2', name: 'Community Bot',      emoji: '🌱', role: 'COMMUNITY_AGENT', spentToday: 1200, active: true                       },
      { address: '0xdao_a3', name: 'Ops Bot',            emoji: '⚙️', role: 'OPS_AGENT',       spentToday: 0,    active: false, nextPayment: 'Apr 1' },
      { address: '0xdao_a4', name: 'Security Monitor',   emoji: '🛡️', role: 'SECURITY_AGENT',  spentToday: 0,    active: false, nextPayment: 'Apr 5' },
    ],
    events: [
      { id: 'de1', date: daysFromNow(4),  label: 'Q2 Grant Batch',    amount: 25000, currency: 'LYX', botName: 'Grant Distributor', botEmoji: '🤝', status: 'scheduled' },
      { id: 'de2', date: daysFromNow(9),  label: 'Community events',  amount: 3000,  currency: 'LYX', botName: 'Community Bot',     botEmoji: '🌱', status: 'scheduled' },
      { id: 'de3', date: daysFromNow(18), label: 'Security audit',    amount: 2000,  currency: 'LYX', botName: 'Security Monitor',  botEmoji: '🛡️', status: 'scheduled' },
      { id: 'de4', date: daysAgo(3),      label: 'Protocol grant',    amount: 8000,  currency: 'LYX', botName: 'Grant Distributor', botEmoji: '🤝', status: 'completed' },
      { id: 'de5', date: daysAgo(10),     label: 'Community sprint',  amount: 2400,  currency: 'LYX', botName: 'Community Bot',     botEmoji: '🌱', status: 'completed' },
    ],
  },
];

// ─── Backward-compat helpers (used by existing dashboard page) ────────────────

function buildBudgetNodes(persona: DemoPersonaDef): BudgetNode[] {
  const children: BudgetNode[] = persona.subVaults
    .filter((sv) => sv.activeByDefault)
    .map((sv) => ({
      id:     sv.id,
      label:  sv.label,
      emoji:  sv.emoji,
      spent:  sv.spent,
      total:  sv.total,
      period: sv.period,
    }));
  return [{
    id:       'root',
    label:    persona.vaultName,
    emoji:    persona.emoji,
    spent:    persona.totalSpent,
    total:    persona.totalBudget,
    period:   persona.period,
    children,
  }];
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface DemoContextType {
  isDemo: boolean;
  enableDemo: () => void;
  disableDemo: () => void;
  // Active persona
  demoPersonaId: DemoPersonaId;
  switchDemoPersona: (id: DemoPersonaId) => void;
  // Backward-compat data (auto-derived from active persona)
  demoBudgetNodes: BudgetNode[];
  demoAgents: AgentMiniRecord[];
  demoEvents: PaymentEvent[];
  demoMerchants: DemoMerchant[];
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

const STORAGE_KEY         = 'demo-mode';
const STORAGE_PERSONA_KEY = 'demo-persona';

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [isDemo, setIsDemo]                 = useState(false);
  const [hydrated, setHydrated]             = useState(false);
  const [demoPersonaId, setDemoPersonaId]   = useState<DemoPersonaId>('individual');

  useEffect(() => {
    setIsDemo(localStorage.getItem(STORAGE_KEY) === 'true');
    const saved = localStorage.getItem(STORAGE_PERSONA_KEY) as DemoPersonaId | null;
    if (saved && DEMO_PERSONAS.some((p) => p.id === saved)) setDemoPersonaId(saved);
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

  const switchDemoPersona = useCallback((id: DemoPersonaId) => {
    setDemoPersonaId(id);
    localStorage.setItem(STORAGE_PERSONA_KEY, id);
  }, []);

  const activePersona = DEMO_PERSONAS.find((p) => p.id === demoPersonaId) ?? DEMO_PERSONAS[0];

  return (
    <DemoContext.Provider
      value={{
        isDemo:           hydrated && isDemo,
        enableDemo,
        disableDemo,
        demoPersonaId,
        switchDemoPersona,
        demoBudgetNodes:  buildBudgetNodes(activePersona),
        demoAgents:       activePersona.agents,
        demoEvents:       activePersona.events,
        demoMerchants:    activePersona.merchants,
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
