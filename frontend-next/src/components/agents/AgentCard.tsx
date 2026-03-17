'use client';

import React from 'react';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { cn } from '@/lib/utils/cn';
import type { AgentRecord } from './types';

const ROLE_EMOJIS: Record<string, string> = {
  GROCERY_AGENT: '🛒',
  SUBSCRIPTION_AGENT: '🔔',
  TRADE_AGENT: '📈',
  RENT_AGENT: '🏠',
  UTILITY_AGENT: '⚡',
};

function spendPercent(spent: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min(Math.round((spent / limit) * 100), 100);
}

interface AgentCardProps {
  agent: AgentRecord;
  onEdit?: () => void;
  onToggle?: () => void;
}

export function AgentCard({ agent, onEdit, onToggle }: AgentCardProps) {
  const emoji = agent.roles.map((r) => ROLE_EMOJIS[r]).find(Boolean) ?? '🤖';
  const pct = spendPercent(agent.spentThisPeriod, agent.monthlyLimit);
  const isOverBudget = agent.spentThisPeriod > agent.monthlyLimit && agent.monthlyLimit > 0;

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{emoji}</span>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              {agent.name}
            </h3>
            <p className="text-xs text-neutral-500 font-mono">{agent.address.slice(0, 8)}…{agent.address.slice(-6)}</p>
          </div>
        </div>
        <Badge variant={agent.active ? 'success' : 'neutral'}>
          {agent.active ? '✅ Activo' : '⏸ Pausado'}
        </Badge>
      </div>

      {/* Roles */}
      <div className="flex flex-wrap gap-1">
        {agent.roles.map((r) => (
          <span
            key={r}
            className="text-xs bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 px-2 py-0.5 rounded-full"
          >
            {r}
          </span>
        ))}
        {agent.roles.length === 0 && (
          <span className="text-xs text-neutral-400">Sin roles asignados</span>
        )}
      </div>

      {/* Budget bar */}
      {agent.monthlyLimit > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Gasto mensual</span>
            <span className={cn(isOverBudget && 'text-red-500 font-medium')}>
              ${agent.spentThisPeriod.toLocaleString()} / ${agent.monthlyLimit.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                isOverBudget ? 'bg-red-500' : pct >= 85 ? 'bg-yellow-400' : 'bg-green-500'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-neutral-500">
        {agent.perTxLimit > 0 && (
          <span>Límite/tx: <span className="font-medium text-neutral-700 dark:text-neutral-300">${agent.perTxLimit}</span></span>
        )}
        <span>Bóvedas: <span className="font-medium text-neutral-700 dark:text-neutral-300">{agent.vaultCount}</span></span>
        {agent.maxGasPerCall > 0 && (
          <span className="ml-auto text-neutral-400">gas: {agent.maxGasPerCall.toLocaleString()}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-neutral-100 dark:border-neutral-700">
        <Button variant="secondary" size="sm" onClick={onEdit} className="flex-1">
          Editar reglas
        </Button>
        <Button
          variant={agent.active ? 'danger' : 'success'}
          size="sm"
          onClick={onToggle}
          className="flex-1"
        >
          {agent.active ? 'Pausar' : 'Activar'}
        </Button>
      </div>
    </div>
  );
}
