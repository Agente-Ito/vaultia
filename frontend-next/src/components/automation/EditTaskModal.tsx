'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/common/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/context/I18nContext';
import type { TaskRecord } from '@/components/automation/TaskTimeline';

function toLocalDateTimeInput(unixSeconds: number) {
  const date = new Date(unixSeconds * 1000);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromLocalDateTimeInput(value: string) {
  return Math.floor(new Date(value).getTime() / 1000);
}

interface EditTaskModalProps {
  open: boolean;
  task: TaskRecord | null;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (values: { nextExecution: number; interval: number }) => Promise<void> | void;
}

export function EditTaskModal({ open, task, saving = false, error = null, onClose, onSave }: EditTaskModalProps) {
  const { t } = useI18n();
  const [nextExecution, setNextExecution] = useState('');
  const [interval, setInterval] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    setLocalError(null);
    if (task.triggerType === 'timestamp') {
      setNextExecution(toLocalDateTimeInput(task.nextExecutionValue));
    } else {
      setNextExecution(String(task.nextExecutionValue));
    }
    setInterval(String(task.intervalValue));
  }, [task]);

  const handleSave = async () => {
    if (!task) return;

    const parsedInterval = Number(interval);
    const parsedNextExecution = task.triggerType === 'timestamp'
      ? fromLocalDateTimeInput(nextExecution)
      : Number(nextExecution);

    if (!Number.isFinite(parsedNextExecution) || parsedNextExecution <= 0 || !Number.isFinite(parsedInterval) || parsedInterval <= 0) {
      setLocalError(t('automation.task.edit_invalid_values'));
      return;
    }

    setLocalError(null);
    await onSave({ nextExecution: parsedNextExecution, interval: parsedInterval });
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('automation.task.edit_title')}</DialogTitle>
          <DialogDescription>
            {task?.triggerType === 'timestamp'
              ? t('automation.task.edit_timestamp_desc')
              : t('automation.task.edit_block_desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              {task?.triggerType === 'timestamp'
                ? t('automation.task.edit_next_timestamp_label')
                : t('automation.task.edit_next_block_label')}
            </label>
            <input
              type={task?.triggerType === 'timestamp' ? 'datetime-local' : 'number'}
              min={task?.triggerType === 'timestamp' ? undefined : '0'}
              value={nextExecution}
              onChange={(event) => setNextExecution(event.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              {task?.triggerType === 'timestamp'
                ? t('automation.task.edit_interval_seconds_label')
                : t('automation.task.edit_interval_blocks_label')}
            </label>
            <input
              type="number"
              min="1"
              value={interval}
              onChange={(event) => setInterval(event.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          {(localError || error) && (
            <p className="text-xs" style={{ color: 'var(--blocked)' }}>{localError || error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => { void handleSave(); }} disabled={saving || !task}>
            {saving ? t('automation.task.edit_saving') : t('automation.task.edit_save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}