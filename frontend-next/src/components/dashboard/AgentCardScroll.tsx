'use client';

import React from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils/cn';
import { useI18n } from '@/context/I18nContext';

export interface AgentMiniRecord {
  address: string;
  name: string;
  emoji: string;
  role: string;
  spentToday: number;
  active: boolean;
  nextPayment?: string;
}

interface AgentMiniCardProps {
  agent: AgentMiniRecord;
  onClick?: () => void;
}

function AgentMiniCard({ agent, onClick }: AgentMiniCardProps) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-52 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-3 text-left hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 transition-all"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{agent.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 truncate">{agent.name}</p>
          <p className="text-xs text-neutral-500 truncate">{agent.role}</p>
        </div>
        <span className={cn(
          'w-2 h-2 rounded-full flex-shrink-0',
          agent.active ? 'bg-green-500' : 'bg-neutral-300'
        )} />
      </div>
      {agent.active ? (
        <p className="text-xs text-neutral-500">
          <span className="font-medium text-neutral-800 dark:text-neutral-200">${agent.spentToday}</span> {t('agent_scroll.spent_today')}
        </p>
      ) : agent.nextPayment ? (
        <p className="text-xs text-neutral-500">{t('agent_scroll.next_payment')}: <span className="font-medium">{agent.nextPayment}</span></p>
      ) : (
        <p className="text-xs text-neutral-400">{t('agent_scroll.no_activity')}</p>
      )}
    </button>
  );
}

interface AgentCardScrollProps {
  agents: AgentMiniRecord[];
  onAgentClick?: (agent: AgentMiniRecord) => void;
  onAddAgent?: () => void;
}

export function AgentCardScroll({ agents, onAgentClick, onAddAgent }: AgentCardScrollProps) {
  const { t } = useI18n();
  return (
    <div>
      <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
        {t('agent_scroll.title')}
      </h3>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-3 pb-3">
          {agents.map((agent) => (
            <AgentMiniCard
              key={agent.address}
              agent={agent}
              onClick={() => onAgentClick?.(agent)}
            />
          ))}
          {onAddAgent && (
            <button
              onClick={onAddAgent}
              className="flex-shrink-0 w-44 rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-600 p-3 text-sm text-neutral-400 hover:border-primary-300 hover:text-primary-500 transition-all flex items-center justify-center gap-1.5"
            >
              <span>+</span>
              <span>{t('agent_scroll.new_agent')}</span>
            </button>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
