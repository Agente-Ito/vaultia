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

// ─── Mock tasks ───────────────────────────────────────────────────────────────

const _now = new Date();
const INITIAL_TASKS: TaskRecord[] = [
  {
    id: '1',
    label: 'Renta mensual',
    description: 'Pago fijo al arrendador',
    botEmoji: '🏠',
    botName: 'Rent Bot',
    vaultLabel: 'Vivienda',
    nextExecution: new Date(_now.getFullYear(), _now.getMonth(), 28),
    intervalLabel: 'Cada mes',
    triggerType: 'timestamp',
    enabled: true,
    amount: 1200,
    currency: '$',
  },
  {
    id: '2',
    label: 'Spotify Premium',
    description: 'Suscripción de música',
    botEmoji: '🎵',
    botName: 'Subscription Bot',
    vaultLabel: 'Entretenimiento',
    nextExecution: new Date(_now.getFullYear(), _now.getMonth() + 1, 5),
    intervalLabel: 'Cada mes',
    triggerType: 'timestamp',
    enabled: true,
    amount: 11,
    currency: '$',
  },
  {
    id: '3',
    label: 'Rebalanceo 60/40',
    description: 'Ajuste portfolio DeFi',
    botEmoji: '📈',
    botName: 'DeFi Bot',
    vaultLabel: 'Inversiones',
    nextExecution: new Date(_now.getFullYear(), _now.getMonth() + 1, 12),
    intervalLabel: 'Cada 7200 bloques (~1h)',
    triggerType: 'block',
    enabled: true,
  },
];

export default function AutomationPage() {
  const { registry, account } = useWeb3();
  const { vaults } = useVaults(registry, account);
  const { isAdvanced } = useMode();

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
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">Automatizaciones</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1 text-sm">
            {tasks.length} tarea{tasks.length !== 1 ? 's' : ''} · {enabledCount} activa{enabledCount !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowWizard(true)}>
          + Nueva tarea
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-neutral-500 mb-1">Tareas activas</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">{enabledCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-neutral-500 mb-1">Timestamp</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
              {tasks.filter((t) => t.triggerType === 'timestamp').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-neutral-500 mb-1">On-chain (bloques)</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
              {tasks.filter((t) => t.triggerType === 'block').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Calendario de automatizaciones</CardTitle>
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
