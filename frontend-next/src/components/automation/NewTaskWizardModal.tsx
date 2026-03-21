'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/common/Button';
import { cn } from '@/lib/utils/cn';
import type { VaultRecord } from '@/hooks/useVaults';
import type { TaskRecord } from './TaskTimeline';
import { useI18n } from '@/context/I18nContext';

// ─── Step configs ─────────────────────────────────────────────────────────────

type ActionType = 'fixed-payment' | 'rebalance' | 'recurring-purchase' | null;

type Frequency = 'five-minutes' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom-blocks';

const TOTAL_STEPS = 3;

function StepIndicator({ step, t }: { step: number; t: (key: string) => string }) {
  return (
    <div className="px-6 pt-4">
      <Progress value={((step + 1) / TOTAL_STEPS) * 100} className="h-1" />
      <div className="flex justify-between mt-2 text-xs text-neutral-400">
        <span className={step >= 0 ? 'text-primary-500 font-medium' : ''}>{t('task_wizard.step.action')}</span>
        <span className={step >= 1 ? 'text-primary-500 font-medium' : ''}>{t('task_wizard.step.vault')}</span>
        <span className={step >= 2 ? 'text-primary-500 font-medium' : ''}>{t('task_wizard.step.frequency')}</span>
      </div>
    </div>
  );
}

// Step 1
function Step1({ selected, onSelect, t }: { selected: ActionType; onSelect: (a: ActionType) => void; t: (key: string) => string }) {
  const ACTION_TYPES = [
    { id: 'fixed-payment' as ActionType, emoji: '💸', title: t('task_wizard.action.fixed_payment.title'), desc: t('task_wizard.action.fixed_payment.desc') },
    { id: 'rebalance' as ActionType, emoji: '⚖️', title: t('task_wizard.action.rebalance.title'), desc: t('task_wizard.action.rebalance.desc') },
    { id: 'recurring-purchase' as ActionType, emoji: '🛒', title: t('task_wizard.action.recurring_purchase.title'), desc: t('task_wizard.action.recurring_purchase.desc') },
  ];
  return (
    <div className="p-6 space-y-4">
      <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">{t('task_wizard.step1.title')}</h3>
      <div className="space-y-2">
        {ACTION_TYPES.map((a) => (
          <button
            key={a.id as string}
            onClick={() => onSelect(a.id)}
            className={cn(
              'w-full flex items-start gap-3 rounded-xl border-2 p-3.5 text-left transition-all',
              selected === a.id
                ? 'border-primary-500 bg-primary-50 dark:bg-neutral-700'
                : 'border-neutral-200 hover:border-primary-300 dark:border-neutral-700'
            )}
          >
            <span className="text-2xl flex-shrink-0">{a.emoji}</span>
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{a.title}</p>
              <p className="text-xs text-neutral-500 mt-0.5">{a.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Step 2
function Step2({ vaults, selectedVault, onSelect, t }: {
  vaults: VaultRecord[];
  selectedVault: string;
  onSelect: (v: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="p-6 space-y-4">
      <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">{t('task_wizard.step2.title')}</h3>
      {vaults.length === 0 ? (
        <p className="text-sm text-neutral-500">{t('task_wizard.step2.no_vaults')}</p>
      ) : (
        <Select value={selectedVault} onValueChange={onSelect}>
          <SelectTrigger>
            <SelectValue placeholder={t('task_wizard.step2.select_placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {vaults.map((v) => (
              <SelectItem key={v.safe} value={v.safe}>
                {v.label || 'Sin nombre'} — {v.safe.slice(0, 8)}…
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {selectedVault && (
        <p className="text-xs text-neutral-400 font-mono">{selectedVault}</p>
      )}
    </div>
  );
}

// Step 3
function Step3({ freq, setFreq, customBlocks, setCustomBlocks, isAdvanced, t }: {
  freq: Frequency;
  setFreq: (f: Frequency) => void;
  customBlocks: string;
  setCustomBlocks: (s: string) => void;
  isAdvanced: boolean;
  t: (key: string) => string;
}) {
  const FREQUENCIES = [
    { value: 'five-minutes' as Frequency, label: t('task_wizard.freq.five_minutes'), seconds: 300 },
    { value: 'hourly'       as Frequency, label: t('task_wizard.freq.hourly'),       seconds: 3600 },
    { value: 'daily'        as Frequency, label: t('task_wizard.freq.daily'),        seconds: 86400 },
    { value: 'weekly'       as Frequency, label: t('task_wizard.freq.weekly'),       seconds: 604800 },
    { value: 'monthly'      as Frequency, label: t('task_wizard.freq.monthly'),      seconds: 2592000 },
  ];
  return (
    <div className="p-6 space-y-4">
      <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">{t('task_wizard.step3.title')}</h3>
      <div className="space-y-2">
        {FREQUENCIES.map((f) => (
          <button
            key={f.value}
            onClick={() => setFreq(f.value)}
            className={cn(
              'w-full flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all',
              freq === f.value
                ? 'border-primary-500 bg-primary-50 dark:bg-neutral-700 text-primary-700 dark:text-primary-300'
                : 'border-neutral-200 hover:border-primary-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'
            )}
          >
            <span className="text-sm font-medium">{f.label}</span>
            {freq === f.value && (
              <svg className="w-4 h-4 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}

        {isAdvanced && (
          <div>
            <button
              onClick={() => setFreq('custom-blocks')}
              className={cn(
                'w-full flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all',
                freq === 'custom-blocks'
                  ? 'border-primary-500 bg-primary-50 dark:bg-neutral-700 text-primary-700 dark:text-primary-300'
                  : 'border-neutral-200 hover:border-primary-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'
              )}
            >
              <span className="text-sm font-medium">{t('task_wizard.freq.custom_blocks')}</span>
              <span className="text-xs text-neutral-400">{t('task_wizard.freq.advanced_mode')}</span>
            </button>
            {freq === 'custom-blocks' && (
              <input
                type="number"
                value={customBlocks}
                onChange={(e) => setCustomBlocks(e.target.value)}
                placeholder={t('task_wizard.freq.custom_blocks_placeholder')}
                className="mt-2 w-full h-9 rounded-md border border-neutral-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

interface NewTaskWizardModalProps {
  open: boolean;
  onClose: () => void;
  vaults: VaultRecord[];
  isAdvanced: boolean;
  onSave: (task: TaskRecord) => void;
}

export function NewTaskWizardModal({ open, onClose, vaults, isAdvanced, onSave }: NewTaskWizardModalProps) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [selectedVault, setSelectedVault] = useState('');
  const [freq, setFreq] = useState<Frequency>('monthly');
  const [customBlocks, setCustomBlocks] = useState('7200');

  const FREQ_LABELS: Record<Frequency, string> = {
    'five-minutes': t('task_wizard.freq.five_minutes'),
    'hourly': t('task_wizard.freq.hourly'),
    'daily': t('task_wizard.freq.daily'),
    'weekly': t('task_wizard.freq.weekly'),
    'monthly': t('task_wizard.freq.monthly'),
    'custom-blocks': t('task_wizard.freq.custom_blocks'),
  };

  const ACTION_TITLES: Record<string, string> = {
    'fixed-payment': t('task_wizard.action.fixed_payment.title'),
    'rebalance': t('task_wizard.action.rebalance.title'),
    'recurring-purchase': t('task_wizard.action.recurring_purchase.title'),
  };
  const ACTION_DESCS: Record<string, string> = {
    'fixed-payment': t('task_wizard.action.fixed_payment.desc'),
    'rebalance': t('task_wizard.action.rebalance.desc'),
    'recurring-purchase': t('task_wizard.action.recurring_purchase.desc'),
  };
  const ACTION_EMOJIS: Record<string, string> = {
    'fixed-payment': '💸',
    'rebalance': '⚖️',
    'recurring-purchase': '🛒',
  };

  const handleClose = () => {
    setStep(0); setActionType(null); setSelectedVault(''); setFreq('monthly');
    onClose();
  };

  const canNext = () => {
    if (step === 0) return actionType !== null;
    if (step === 1) return selectedVault !== '';
    return true;
  };

  const handleFinish = () => {
    const vaultDef = vaults.find((v) => v.safe === selectedVault);
    const task: TaskRecord = {
      id: `task-${Date.now()}`,
      label: actionType ? (ACTION_TITLES[actionType] ?? actionType) : t('task_wizard.title'),
      description: actionType ? (ACTION_DESCS[actionType] ?? '') : '',
      botEmoji: actionType ? (ACTION_EMOJIS[actionType] ?? '⚙️') : '⚙️',
      botName: 'Bot',
      vaultLabel: vaultDef?.label || selectedVault.slice(0, 8) + '…',
      nextExecution: new Date(Date.now() + 86400 * 1000),
      intervalLabel: freq === 'custom-blocks' ? `${t('task_wizard.freq.custom_blocks')} ${customBlocks}` : (FREQ_LABELS[freq] ?? ''),
      triggerType: freq === 'custom-blocks' ? 'block' : 'timestamp',
      enabled: true,
    };

    onSave(task);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md w-full p-0">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="flex items-center justify-between">
            {t('task_wizard.title')}
            <span className="text-xs font-normal text-neutral-400">{step + 1}/{TOTAL_STEPS}</span>
          </DialogTitle>
        </DialogHeader>

        <StepIndicator step={step} t={t} />

        <div className="min-h-[260px]">
          {step === 0 && <Step1 selected={actionType} onSelect={(a) => { setActionType(a); }} t={t} />}
          {step === 1 && <Step2 vaults={vaults} selectedVault={selectedVault} onSelect={setSelectedVault} t={t} />}
          {step === 2 && (
            <Step3
              freq={freq}
              setFreq={setFreq}
              customBlocks={customBlocks}
              setCustomBlocks={setCustomBlocks}
              isAdvanced={isAdvanced}
              t={t}
            />
          )}
        </div>

        <DialogFooter className="px-6 pb-5">
          <Button variant="secondary" size="sm" onClick={() => step > 0 ? setStep(s => s - 1) : handleClose()}>
            {step > 0 ? t('task_wizard.btn.back') : t('task_wizard.btn.cancel')}
          </Button>
          <div className="flex gap-2">
            {step < TOTAL_STEPS - 1 ? (
              <Button size="sm" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
                {t('task_wizard.btn.next')}
              </Button>
            ) : (
              <Button size="sm" onClick={handleFinish} disabled={!canNext()}>
                {t('task_wizard.btn.create')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
