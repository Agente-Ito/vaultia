'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { TaskTimeline, type TaskRecord } from '@/components/automation/TaskTimeline';
import { NewTaskWizardModal } from '@/components/automation/NewTaskWizardModal';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { useMode } from '@/context/ModeContext';
import { useI18n } from '@/context/I18nContext';

// ─── Mock tasks ───────────────────────────────────────────────────────────────

const _now = new Date();
const INITIAL_TASKS: TaskRecord[] = [
  {
    id: '1',
    label: 'Monthly Rent',
    description: 'Fixed payment to landlord',
    botEmoji: '🏠',
    botName: 'Rent Bot',
    vaultLabel: 'Housing',
    nextExecution: new Date(_now.getFullYear(), _now.getMonth(), 28),
    intervalLabel: 'Every month',
    triggerType: 'timestamp',
    enabled: true,
    amount: 1200,
    currency: '$',
  },
  {
    id: '2',
    label: 'Spotify Premium',
    description: 'Music subscription',
    botEmoji: '🎵',
    botName: 'Subscription Bot',
    vaultLabel: 'Entertainment',
    nextExecution: new Date(_now.getFullYear(), _now.getMonth() + 1, 5),
    intervalLabel: 'Every month',
    triggerType: 'timestamp',
    enabled: true,
    amount: 11,
    currency: '$',
  },
  {
    id: '3',
    label: '60/40 Rebalance',
    description: 'DeFi portfolio adjustment',
    botEmoji: '📈',
    botName: 'DeFi Bot',
    vaultLabel: 'Investments',
    nextExecution: new Date(_now.getFullYear(), _now.getMonth() + 1, 12),
    intervalLabel: 'Every 7200 blocks (~1h)',
    triggerType: 'block',
    enabled: true,
  },
];

export default function AutomationPage() {
  const { registry, account } = useWeb3();
  const { vaults } = useVaults(registry, account);
  const { isAdvanced } = useMode();
  const { t } = useI18n();

  const [tasks, setTasks] = useState<TaskRecord[]>(INITIAL_TASKS);
  const [showWizard, setShowWizard] = useState(false);

  const enabledCount = tasks.filter((t) => t.enabled).length;

  const handleToggle = (taskId: string) => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, enabled: !t.enabled } : t));
  };

  const handleNewTask = (task: TaskRecord) => {
    setTasks((prev) => [...prev, task]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">{t('automation.title')}</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1 text-sm">
            {`${tasks.length} ${t('automation.subtitle_tasks')} · ${enabledCount} ${t('automation.subtitle_active')}`}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowWizard(true)}>
          {t('automation.new_task')}
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { emoji: '✅', label: t('automation.summary.active'), value: enabledCount },
          { emoji: '🕐', label: t('automation.summary.timestamp'), value: tasks.filter((tk) => tk.triggerType === 'timestamp').length },
          { emoji: '⛓️', label: t('automation.summary.block'),     value: tasks.filter((tk) => tk.triggerType === 'block').length },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 flex items-center gap-3"
          >
            <span className="text-2xl">{s.emoji}</span>
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{s.label}</p>
              <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>{t('automation.calendar.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskTimeline tasks={tasks} onToggle={handleToggle} />
        </CardContent>
      </Card>

      {/* Wizard */}
      <NewTaskWizardModal
        open={showWizard}
        onClose={() => setShowWizard(false)}
        vaults={vaults}
        isAdvanced={isAdvanced}
        onSave={handleNewTask}
      />
    </div>
  );
}
