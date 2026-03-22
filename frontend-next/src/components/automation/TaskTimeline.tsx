'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';
import { useI18n } from '@/context/I18nContext';

export interface TaskRecord {
  id: string;
  label: string;
  description: string;
  botEmoji: string;
  botName: string;
  vaultLabel: string;
  nextExecution: Date;
  intervalLabel: string;
  triggerType: 'timestamp' | 'block';
  enabled: boolean;
  amountLabel?: string;
  amount?: number;
  currency?: string;
}

function groupByDate(tasks: TaskRecord[], locale: string): { dateLabel: string; items: TaskRecord[] }[] {
  const groups: Record<string, TaskRecord[]> = {};
  const sorted = [...tasks].sort((a, b) => a.nextExecution.getTime() - b.nextExecution.getTime());

  sorted.forEach((t) => {
    const key = t.nextExecution.toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: t.nextExecution.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
    groups[key] = [...(groups[key] ?? []), t];
  });

  return Object.entries(groups).map(([dateLabel, items]) => ({ dateLabel, items }));
}

interface TaskTimelineProps {
  tasks: TaskRecord[];
  onToggle?: (taskId: string) => void;
  toggleDisabled?: boolean;
}

export function TaskTimeline({ tasks, onToggle, toggleDisabled = false }: TaskTimelineProps) {
  const { t, locale } = useI18n();

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-3xl">⏰</p>
        <p className="text-sm text-neutral-500">{t('automation.empty')}</p>
      </div>
    );
  }

  const groups = groupByDate(tasks, locale);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.dateLabel}>
          {/* Date pill */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-semibold text-neutral-500 bg-neutral-100 dark:bg-neutral-700 px-3 py-1 rounded-full">
              {group.dateLabel}
            </span>
            <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
          </div>

          {/* Tasks */}
          <div className="space-y-2">
            {group.items.map((task) => (
              <div
                key={task.id}
                className={cn(
                  'flex items-center gap-4 rounded-xl border p-4 transition-colors',
                  task.enabled
                    ? 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800'
                    : 'border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 opacity-60'
                )}
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-xl flex-shrink-0">
                  {task.botEmoji}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 truncate">
                      {task.label}
                    </p>
                    {task.amountLabel && (
                      <span className="text-sm font-bold text-neutral-800 dark:text-neutral-200 flex-shrink-0">
                        {task.amountLabel}
                      </span>
                    )}
                    {task.amount !== undefined && task.amount > 0 && (
                      <span className="text-sm font-bold text-neutral-800 dark:text-neutral-200 flex-shrink-0">
                        {task.currency ?? '$'}{task.amount.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-neutral-500">{task.botName}</span>
                    <span className="text-neutral-300 dark:text-neutral-600">·</span>
                    <span className="text-xs text-neutral-500">{task.vaultLabel}</span>
                    <span className="text-neutral-300 dark:text-neutral-600">·</span>
                    <span className="text-xs text-neutral-400">{task.intervalLabel}</span>
                    {task.triggerType === 'block' && (
                      <span className="text-xs bg-blue-50 text-blue-500 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">
                        {t('automation.task.on_chain')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <span className={cn(
                  'text-xs px-2 py-1 rounded-full flex-shrink-0',
                  task.enabled
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'
                )}>
                  {task.enabled ? t('automation.task.scheduled') : t('automation.task.disabled')}
                </span>

                {/* Toggle */}
                <button
                  onClick={() => onToggle?.(task.id)}
                  disabled={toggleDisabled}
                  className={cn(
                    'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    task.enabled
                      ? 'bg-red-50 text-red-400 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40'
                      : 'bg-green-50 text-green-500 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40'
                  )}
                  aria-label={task.enabled ? t('automation.task.disable') : t('automation.task.enable')}
                >
                  {task.enabled ? '⏸' : '▶'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
