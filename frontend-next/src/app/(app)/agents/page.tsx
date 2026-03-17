'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { AgentCard } from '@/components/agents/AgentCard';
import { AgentRulesDrawer } from '@/components/agents/AgentRulesDrawer';
import type { AgentRecord } from '@/components/agents/types';
import { useI18n } from '@/context/I18nContext';

// ─── Mock data — replace with AgentCoordinator contract reads ─────────────────

const MOCK_AGENTS: AgentRecord[] = [
  {
    address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
    name: 'Groceries Bot',
    roles: ['GROCERY_AGENT'],
    active: true,
    perTxLimit: 50,
    monthlyLimit: 300,
    spentThisPeriod: 127,
    vaultCount: 2,
    maxGasPerCall: 0,
    allowedAutomation: false,
    merchantWhitelist: ['Walmart', 'Costco'],
  },
  {
    address: '0x1111111111111111111111111111111111111111',
    name: 'Rent Bot',
    roles: ['SUBSCRIPTION_AGENT'],
    active: false,
    perTxLimit: 1500,
    monthlyLimit: 1500,
    spentThisPeriod: 0,
    vaultCount: 1,
    maxGasPerCall: 0,
    allowedAutomation: true,
    merchantWhitelist: [],
  },
  {
    address: '0x2222222222222222222222222222222222222222',
    name: 'DeFi Strategy Bot',
    roles: ['TRADE_AGENT'],
    active: true,
    perTxLimit: 0,
    monthlyLimit: 1500,
    spentThisPeriod: 780,
    vaultCount: 1,
    maxGasPerCall: 500000,
    allowedAutomation: true,
    merchantWhitelist: [],
  },
];

const FILTER_OPTIONS = ['Todos', 'Activos', 'Pausados'];

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRecord[]>(MOCK_AGENTS);
  const [filter, setFilter] = useState('Todos');
  const [editingAgent, setEditingAgent] = useState<AgentRecord | null>(null);
  const { t } = useI18n();

  const filtered = agents.filter((a) => {
    if (filter === 'Activos') return a.active;
    if (filter === 'Pausados') return !a.active;
    return true;
  });

  const handleToggle = (address: string) => {
    setAgents((prev) =>
      prev.map((a) => (a.address === address ? { ...a, active: !a.active } : a))
    );
  };

  const handleSave = (updated: AgentRecord) => {
    setAgents((prev) => prev.map((a) => (a.address === updated.address ? updated : a)));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">{t('agents.title')}</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1 text-sm">
            {agents.length} {t('agents.list.count')}
          </p>
        </div>
        <Button size="sm">+ Agregar agente</Button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => setFilter(opt)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === opt
                ? 'bg-primary-500 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-600'
            }`}
          >
            {opt}
          </button>
        ))}
        <span className="ml-auto text-xs text-neutral-400">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-3xl">🤖</p>
          <p className="text-sm text-neutral-500">{t('agents.list.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((agent) => (
            <AgentCard
              key={agent.address}
              agent={agent}
              onEdit={() => setEditingAgent(agent)}
              onToggle={() => handleToggle(agent.address)}
            />
          ))}
        </div>
      )}

      {/* Rules drawer */}
      <AgentRulesDrawer
        agent={editingAgent}
        open={editingAgent !== null}
        onClose={() => setEditingAgent(null)}
        onSave={handleSave}
      />
    </div>
  );
}
