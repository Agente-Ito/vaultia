'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { BudgetTreeView, type BudgetNode } from '@/components/dashboard/BudgetTreeView';
import { AgentCardScroll } from '@/components/dashboard/AgentCardScroll';
import { PaymentTimeline } from '@/components/dashboard/PaymentTimeline';
import { cn } from '@/lib/utils/cn';
import { useI18n } from '@/context/I18nContext';
import {
  DEMO_PERSONAS,
  useDemo,
  type DemoPersonaId,
  type DemoPeriod,
  type DemoSubVaultDef,
  type DemoMerchant,
} from '@/context/DemoContext';
import type { AgentMiniRecord } from '@/components/dashboard/AgentCardScroll';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SpendBar({ spent, total, className }: { spent: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.min((spent / total) * 100, 100) : 0;
  const over = spent > total;
  return (
    <div className={cn('w-full bg-neutral-100 dark:bg-neutral-700 rounded-full h-2 overflow-hidden', className)}>
      <div
        className={cn('h-2 rounded-full transition-all', over ? 'bg-red-500' : 'bg-primary')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function buildBudgetNodes(
  persona: (typeof DEMO_PERSONAS)[0],
  activeIds: string[],
  budget: number,
  period: DemoPeriod,
): BudgetNode[] {
  const children: BudgetNode[] = persona.subVaults
    .filter((sv) => activeIds.includes(sv.id))
    .map((sv) => ({
      id:     sv.id,
      label:  sv.label,
      emoji:  sv.emoji,
      spent:  sv.spent,
      total:  sv.total,
      period: sv.period,
    }));
  const totalSpent = children.reduce((s, c) => s + c.spent, 0);
  return [{
    id:       'root',
    label:    persona.vaultName,
    emoji:    persona.emoji,
    spent:    totalSpent,
    total:    budget,
    period,
    children: children.length > 0 ? children : undefined,
  }];
}

// ─── Sub-panel: Vault & Sub-vaults ────────────────────────────────────────────

function VaultPanel({
  persona,
  activeIds,
  budget,
  period,
  onToggle,
}: {
  persona: (typeof DEMO_PERSONAS)[0];
  activeIds: string[];
  budget: number;
  period: DemoPeriod;
  onToggle: (id: string) => void;
}) {
  const { t } = useI18n();
  const totalSpent = persona.subVaults
    .filter((sv) => activeIds.includes(sv.id))
    .reduce((s, sv) => s + sv.spent, 0);

  const active   = persona.subVaults.filter((sv) =>  activeIds.includes(sv.id));
  const inactive = persona.subVaults.filter((sv) => !activeIds.includes(sv.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span>{persona.emoji}</span>
          <span>{persona.vaultName}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall progress */}
        <div>
          <div className="flex justify-between text-xs text-neutral-500 mb-1">
            <span>{t('demo.workspace.vault.spending')}</span>
            <span className="font-medium text-neutral-700 dark:text-neutral-300">
              {totalSpent.toLocaleString()} / {budget.toLocaleString()} LYX
            </span>
          </div>
          <SpendBar spent={totalSpent} total={budget} />
          <p className="text-xs text-neutral-400 mt-1">
            {t(`onboarding.step3.period.${period}` as Parameters<typeof t>[0])}
          </p>
        </div>

        {/* Active sub-vaults */}
        <div>
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">
            {t('demo.workspace.vault.subvaults')}
          </p>
          <div className="space-y-1.5">
            {active.map((sv) => (
              <div
                key={sv.id}
                className="flex items-center gap-2.5 p-2 rounded-lg bg-neutral-50 dark:bg-neutral-700/50 border border-neutral-200 dark:border-neutral-600"
              >
                <button
                  onClick={() => onToggle(sv.id)}
                  className="w-4 h-4 rounded border-2 border-primary-500 bg-primary-500 flex-shrink-0 flex items-center justify-center hover:bg-primary-600 transition-colors"
                  title="Remove sub-vault"
                >
                  <span className="text-white text-xs leading-none">✓</span>
                </button>
                <span className="text-sm">{sv.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-neutral-800 dark:text-neutral-100">{sv.label}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <SpendBar spent={sv.spent} total={sv.total} className="flex-1 h-1" />
                    <span className="text-xs text-neutral-400 whitespace-nowrap">
                      {sv.spent.toLocaleString()}/{sv.total.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Available to add */}
        {inactive.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">
              {t('demo.workspace.vault.add_subvault')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {inactive.map((sv) => (
                <button
                  key={sv.id}
                  onClick={() => onToggle(sv.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border-2 border-dashed border-neutral-300 text-neutral-500 hover:border-primary-400 hover:text-primary-600 dark:border-neutral-600 dark:hover:border-primary-500 transition-colors"
                >
                  + {sv.emoji} {sv.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Sub-panel: Rules ─────────────────────────────────────────────────────────

type RulesTab = 'budget' | 'merchants' | 'agents';

function RulesPanel({
  persona,
  budget,
  period,
  activeMerchants,
  allAgents,
  onBudgetChange,
  onPeriodChange,
  onToggleMerchant,
  onToggleAgent,
}: {
  persona:          (typeof DEMO_PERSONAS)[0];
  budget:           number;
  period:           DemoPeriod;
  activeMerchants:  string[];
  allAgents:        AgentMiniRecord[];
  onBudgetChange:   (v: number) => void;
  onPeriodChange:   (p: DemoPeriod) => void;
  onToggleMerchant: (addr: string) => void;
  onToggleAgent:    (addr: string) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<RulesTab>('budget');

  const active   = persona.merchants.filter((m) =>  activeMerchants.includes(m.address));
  const available = persona.merchants.filter((m) => !activeMerchants.includes(m.address));

  const totalSpentForBudget = persona.subVaults.reduce((s, sv) => s + sv.spent, 0);

  const TABS: { id: RulesTab; label: string }[] = [
    { id: 'budget',    label: t('demo.workspace.rules.budget_tab') },
    { id: 'merchants', label: t('demo.workspace.rules.merchants_tab') },
    { id: 'agents',    label: t('demo.workspace.rules.agents_tab') },
  ];

  const PERIODS: DemoPeriod[] = ['daily', 'weekly', 'monthly'];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1 border-b border-neutral-100 dark:border-neutral-700 -mx-6 px-6 pb-3 -mt-1">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
                tab === tb.id
                  ? 'bg-primary-50 text-primary-700 dark:bg-neutral-700 dark:text-primary-300'
                  : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              )}
            >
              {tb.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">

        {/* ── Budget tab ─────────────────────────────────────────────────────── */}
        {tab === 'budget' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-widest block mb-1">
                {t('demo.workspace.rules.limit')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={budget}
                  onChange={(e) => onBudgetChange(Number(e.target.value) || budget)}
                  className="w-full h-9 rounded-lg border border-neutral-300 px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
                />
                <span className="text-sm text-neutral-400 whitespace-nowrap">LYX</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-widest block mb-2">
                {t('demo.workspace.rules.period')}
              </label>
              <div className="flex gap-2">
                {PERIODS.map((p) => (
                  <button
                    key={p}
                    onClick={() => onPeriodChange(p)}
                    className={cn(
                      'flex-1 py-1.5 rounded-lg border-2 text-xs font-medium transition-all',
                      period === p
                        ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-neutral-700 dark:text-primary-300'
                        : 'border-neutral-200 text-neutral-600 hover:border-primary-300 dark:border-neutral-700 dark:text-neutral-400'
                    )}
                  >
                    {t(`onboarding.step3.period.${p}` as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-neutral-500 mb-1">
                <span>
                  {totalSpentForBudget.toLocaleString()} LYX {t('demo.workspace.rules.spent_of')} {budget.toLocaleString()} LYX
                </span>
                <span>{Math.round((totalSpentForBudget / budget) * 100)}%</span>
              </div>
              <SpendBar spent={totalSpentForBudget} total={budget} />
            </div>
          </div>
        )}

        {/* ── Merchants tab ───────────────────────────────────────────────────── */}
        {tab === 'merchants' && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">
                {t('demo.workspace.rules.merchants_active')}
              </p>
              {active.length === 0 ? (
                <p className="text-xs text-neutral-400 italic">No merchants whitelisted — any address can receive funds.</p>
              ) : (
                <div className="space-y-1.5">
                  {active.map((m) => (
                    <div key={m.address} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-700/50 border border-neutral-200 dark:border-neutral-600">
                      <div className="flex items-center gap-2">
                        <span>{m.emoji}</span>
                        <div>
                          <p className="text-xs font-medium text-neutral-800 dark:text-neutral-100">{m.name}</p>
                          <p className="text-xs text-neutral-400">{m.category}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => onToggleMerchant(m.address)}
                        className="text-neutral-400 hover:text-red-500 transition-colors text-sm font-bold leading-none px-1"
                        title="Remove from whitelist"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {available.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">
                  {t('demo.workspace.rules.merchants_available')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {available.map((m) => (
                    <button
                      key={m.address}
                      onClick={() => onToggleMerchant(m.address)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border-2 border-dashed border-neutral-300 text-neutral-500 hover:border-primary-400 hover:text-primary-600 dark:border-neutral-600 dark:hover:border-primary-500 transition-colors"
                    >
                      + {m.emoji} {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Agents tab ──────────────────────────────────────────────────────── */}
        {tab === 'agents' && (
          <div>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-3">
              {t('demo.workspace.rules.agents_access')}
            </p>
            <div className="space-y-2">
              {allAgents.map((agent) => {
                const isActive = agent.active;
                return (
                  <div
                    key={agent.address}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{agent.emoji}</span>
                      <div>
                        <p className="text-xs font-medium text-neutral-800 dark:text-neutral-100">{agent.name}</p>
                        <p className="text-xs text-neutral-400">{agent.role}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => onToggleAgent(agent.address)}
                      className={cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500',
                        isActive ? 'bg-primary-500' : 'bg-neutral-300 dark:bg-neutral-600'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform',
                          isActive ? 'translate-x-4' : 'translate-x-0.5'
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main DemoWorkspace ───────────────────────────────────────────────────────

export function DemoWorkspace() {
  const { t } = useI18n();
  const { switchDemoPersona } = useDemo();

  const [personaId,        setPersonaId]        = useState<DemoPersonaId>('individual');
  const [activeSubVaultIds, setActiveSubVaultIds] = useState<string[]>([]);
  const [budget,            setBudget]            = useState(0);
  const [period,            setPeriod]            = useState<DemoPeriod>('monthly');
  const [activeMerchants,  setActiveMerchants]   = useState<string[]>([]);
  const [allAgents,        setAllAgents]          = useState<AgentMiniRecord[]>([]);
  const [selectedNodeId,   setSelectedNodeId]     = useState('root');

  // Initialise / reset state when persona changes
  useEffect(() => {
    const def = DEMO_PERSONAS.find((p) => p.id === personaId)!;
    setActiveSubVaultIds(def.subVaults.filter((sv) => sv.activeByDefault).map((sv) => sv.id));
    setBudget(def.totalBudget);
    setPeriod(def.period);
    setActiveMerchants(def.merchants.slice(0, 3).map((m) => m.address));
    setAllAgents(def.agents.map((a) => ({ ...a })));
    setSelectedNodeId('root');
    switchDemoPersona(personaId);
  }, [personaId, switchDemoPersona]);

  const persona = DEMO_PERSONAS.find((p) => p.id === personaId)!;

  const toggleSubVault = (id: string) => {
    setActiveSubVaultIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleMerchant = (addr: string) => {
    setActiveMerchants((prev) =>
      prev.includes(addr) ? prev.filter((x) => x !== addr) : [...prev, addr]
    );
  };

  const toggleAgent = (addr: string) => {
    setAllAgents((prev) =>
      prev.map((a) => a.address === addr ? { ...a, active: !a.active } : a)
    );
  };

  // Build dynamic budget nodes
  const budgetNodes = useMemo(
    () => buildBudgetNodes(persona, activeSubVaultIds, budget, period),
    [persona, activeSubVaultIds, budget, period]
  );

  const selectedNode = useMemo(() => {
    function find(nodes: BudgetNode[], id: string): BudgetNode | null {
      for (const n of nodes) {
        if (n.id === id) return n;
        if (n.children) { const f = find(n.children, id); if (f) return f; }
      }
      return null;
    }
    return find(budgetNodes, selectedNodeId);
  }, [budgetNodes, selectedNodeId]);

  const activeDisplayAgents = useMemo(
    () => allAgents.filter((a) => a.active),
    [allAgents]
  );

  return (
    <div className="space-y-6">

      {/* ── Demo hint bar ─── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-xs text-amber-800 dark:text-amber-300">
        <span>🎮</span>
        <span className="font-medium">{t('demo.label')}</span>
        <span className="text-amber-600 dark:text-amber-400">—</span>
        <span>{t('demo.workspace.hint')}</span>
      </div>

      {/* ── Persona tabs ─── */}
      <div className="flex gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1">
        {DEMO_PERSONAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPersonaId(p.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
              personaId === p.id
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-50 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            )}
          >
            <span>{p.emoji}</span>
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {/* ── Vault + Rules ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <VaultPanel
          persona={persona}
          activeIds={activeSubVaultIds}
          budget={budget}
          period={period}
          onToggle={toggleSubVault}
        />
        <RulesPanel
          persona={persona}
          budget={budget}
          period={period}
          activeMerchants={activeMerchants}
          allAgents={allAgents}
          onBudgetChange={setBudget}
          onPeriodChange={setPeriod}
          onToggleMerchant={toggleMerchant}
          onToggleAgent={toggleAgent}
        />
      </div>

      {/* ── Budget tree + detail ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.budget_tree')}</CardTitle>
            </CardHeader>
            <CardContent>
              <BudgetTreeView
                nodes={budgetNodes}
                selectedId={selectedNodeId}
                onSelect={(node) => setSelectedNodeId(node.id)}
                onAddCategory={() => {/* demo only */}}
              />
            </CardContent>
          </Card>
        </div>

        <div>
          {selectedNode ? (
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span>{selectedNode.emoji}</span>
                  <span>{selectedNode.label}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  {[
                    [t('dashboard.detail.spent'),     selectedNode.spent],
                    [t('dashboard.detail.limit'),      selectedNode.total],
                    [t('dashboard.detail.available'),  Math.max(0, selectedNode.total - selectedNode.spent)],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex justify-between text-sm">
                      <span className="text-neutral-500">{label}</span>
                      <span className="font-semibold text-neutral-900 dark:text-neutral-50">
                        {(val as number).toLocaleString()} LYX
                      </span>
                    </div>
                  ))}
                </div>
                <SpendBar spent={selectedNode.spent} total={selectedNode.total} />
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

      {/* ── Agents + Timeline ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardContent className="pt-4">
            <AgentCardScroll
              agents={activeDisplayAgents.length > 0 ? activeDisplayAgents : allAgents}
              onAgentClick={() => {}}
              onAddAgent={() => {}}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.upcoming_payments')}</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentTimeline events={persona.events} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
