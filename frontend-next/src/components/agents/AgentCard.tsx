'use client';

import React from 'react';
import Image from 'next/image';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { cn } from '@/lib/utils/cn';
import { useI18n } from '@/context/I18nContext';
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
  /** Cached UP contact name — shown instead of agent.name when present */
  contactName?: string;
  /** Cached UP avatar URL from contacts */
  contactAvatarUrl?: string;
  onEdit?: () => void;
  onToggle?: () => void;
}

export function AgentCard({ agent, contactName, contactAvatarUrl, onEdit, onToggle }: AgentCardProps) {
  const { t } = useI18n();
  const emoji = agent.roles.map((r) => ROLE_EMOJIS[r]).find(Boolean) ?? '🤖';
  const pct = spendPercent(agent.spentThisPeriod, agent.monthlyLimit);
  const isOverBudget = agent.spentThisPeriod > agent.monthlyLimit && agent.monthlyLimit > 0;
  const displayName = contactName || agent.name;
  const initial = displayName ? displayName[0].toUpperCase() : agent.address[2]?.toUpperCase() ?? '?';

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {/* Avatar: UP contact image > initials circle > role emoji */}
          {contactAvatarUrl ? (
            <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-primary-400 flex-shrink-0">
              <Image src={contactAvatarUrl} alt={displayName} width={36} height={36} className="w-full h-full object-cover" unoptimized />
            </div>
          ) : contactName ? (
            <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center text-sm font-bold flex-shrink-0">
              {initial}
            </div>
          ) : (
            <span className="text-2xl flex-shrink-0">{emoji}</span>
          )}
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 flex items-center gap-1.5">
              {displayName}
              {contactName && (
                <span className="text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 px-1.5 py-0.5 rounded-full font-normal">
                  {t('agents.card.up_contact')}
                </span>
              )}
            </h3>
            <p className="text-xs text-neutral-500 font-mono">{agent.address.slice(0, 8)}…{agent.address.slice(-6)}</p>
          </div>
        </div>
        <Badge variant={agent.active ? 'success' : 'neutral'}>
          {agent.active ? `✅ ${t('agents.card.active')}` : `⏸ ${t('agents.card.paused')}`}
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
          <span className="text-xs text-neutral-400">{t('agents.card.no_roles')}</span>
        )}
      </div>

      {/* Budget bar */}
      {agent.monthlyLimit > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-neutral-500">
            <span>{t('agents.card.monthly_spend')}</span>
            <span className={cn(isOverBudget && 'text-red-500 font-medium')}>
              {agent.spentThisPeriod.toLocaleString()} / {agent.monthlyLimit.toLocaleString()} LYX
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
          <span>{t('agents.card.per_tx_limit')}: <span className="font-medium text-neutral-700 dark:text-neutral-300">{agent.perTxLimit} LYX</span></span>
        )}
        <span>{t('agents.card.vaults')}: <span className="font-medium text-neutral-700 dark:text-neutral-300">{agent.vaultCount}</span></span>
        {agent.maxGasPerCall > 0 && (
          <span className="ml-auto text-neutral-400">gas: {agent.maxGasPerCall.toLocaleString()}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-neutral-100 dark:border-neutral-700">
        <Button variant="secondary" size="sm" onClick={onEdit} className="flex-1">
          {t('agents.card.edit_rules')}
        </Button>
        <Button
          variant={agent.active ? 'danger' : 'success'}
          size="sm"
          onClick={onToggle}
          className="flex-1"
        >
          {agent.active ? t('agents.card.pause') : t('agents.card.activate')}
        </Button>
      </div>
    </div>
  );
}
