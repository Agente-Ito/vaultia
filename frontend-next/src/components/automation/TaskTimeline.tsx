'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';
import { useI18n } from '@/context/I18nContext';

export interface TaskRecord {
  id: string;
  label: string;
  description: string;
  botName: string;
  vaultLabel: string;
  vaultSafe?: string;
  nextExecution: Date;
  nextExecutionValue: number;
  intervalValue: number;
  intervalLabel: string;
  triggerType: 'timestamp' | 'block';
  enabled: boolean;
  amountLabel?: string;
  amount?: number;
  currency?: string;
  limitActive?: boolean;
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
  onEdit?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
  toggleDisabled?: boolean;
}

export function TaskTimeline({ tasks, onToggle, onEdit, onDelete, toggleDisabled = false }: TaskTimelineProps) {
  const { t, locale } = useI18n();

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <span
              key={index}
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background: index === 2 ? 'var(--accent)' : 'var(--border)',
                opacity: index === 2 ? 1 : 0.7,
              }}
            />
          ))}
        </div>
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
                {/* Dot marker */}
                <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: task.enabled ? 'var(--success)' : 'var(--border)' }}
                  />
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
                    {task.limitActive && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,200,87,0.12)', color: 'var(--warning)' }}>
                        {t('automation.task.vault_limited')}
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

                {/* Delete */}
                {onEdit && (
                  <button
                    onClick={() => onEdit(task.id)}
                    disabled={toggleDisabled}
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600"
                    aria-label={t('automation.task.edit')}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm2.92 2.33H5v-.92l8.06-8.06.92.92L5.92 19.58ZM20.71 7.04a1.003 1.003 0 0 0 0-1.42L18.37 3.29a1.003 1.003 0 0 0-1.42 0l-1.13 1.13 3.75 3.75 1.14-1.13Z" />
                    </svg>
                  </button>
                )}

                {/* Delete */}
                {onDelete && (
                  <button
                    onClick={() => {
                      if (window.confirm(t('automation.task.delete_confirm'))) {
                        onDelete(task.id);
                      }
                    }}
                    disabled={toggleDisabled}
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 bg-red-50 text-red-400 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40"
                    aria-label={t('automation.task.delete')}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}

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
                  {task.enabled ? (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8 6.5v11l9-5.5-9-5.5Z" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
