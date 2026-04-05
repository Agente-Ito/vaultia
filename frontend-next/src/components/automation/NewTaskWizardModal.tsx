'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
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
import { useI18n } from '@/context/I18nContext';
import { getLocalizedErrorMessage, localizeErrorMessage } from '@/lib/errorMap';
import {
  AuthorizedRecipientOption,
  FREQUENCY_SECONDS,
  VaultAutomationConstraints,
  formatLyxAmount,
  loadVaultAutomationConstraints,
  minBigInt,
  minNumber,
} from '@/lib/automation/vaultConstraints';

// ─── Step configs ─────────────────────────────────────────────────────────────

type ActionType = 'fixed-payment' | 'rebalance' | 'recurring-purchase' | null;

type Frequency = 'five-minutes' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom-blocks';

export interface NewTaskDraft {
  actionType: 'fixed-payment';
  vaultSafe: string;
  recipient: string;
  amount: string;
  triggerType: 'timestamp' | 'block';
  interval: number;
  intervalLabel: string;
}

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
    { id: 'fixed-payment' as ActionType, tone: 'var(--success)', title: t('task_wizard.action.fixed_payment.title'), desc: t('task_wizard.action.fixed_payment.desc'), enabled: true },
    { id: 'rebalance' as ActionType, tone: 'var(--border)', title: t('task_wizard.action.rebalance.title'), desc: t('task_wizard.action.rebalance.desc'), enabled: false },
    { id: 'recurring-purchase' as ActionType, tone: 'var(--border)', title: t('task_wizard.action.recurring_purchase.title'), desc: t('task_wizard.action.recurring_purchase.desc'), enabled: false },
  ];
  return (
    <div className="p-6 space-y-4">
      <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">{t('task_wizard.step1.title')}</h3>
      <div className="space-y-2">
        {ACTION_TYPES.map((a) => (
          <button
            key={a.id as string}
            disabled={!a.enabled}
            onClick={() => onSelect(a.id)}
            className={cn(
              'w-full flex items-start gap-3 rounded-xl border-2 p-3.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60',
              selected === a.id
                ? 'border-primary-500 bg-primary-50 dark:bg-neutral-700'
                : 'border-neutral-200 hover:border-primary-300 dark:border-neutral-700'
            )}
          >
            <span className="mt-1 h-3 w-3 rounded-full flex-shrink-0" style={{ background: a.tone }} />
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                {a.title}
                {!a.enabled && (
                  <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300">
                    {t('task_wizard.action.coming_soon')}
                  </span>
                )}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">{a.desc}</p>
            </div>
          </button>
        ))}
      </div>
      <p className="text-xs text-neutral-500">{t('task_wizard.action.fixed_only_note')}</p>
    </div>
  );
}

// Step 2
function Step2({
  vaults,
  selectedVault,
  onSelect,
  recipient,
  onRecipientChange,
  amount,
  onAmountChange,
  recipientOptions,
  hasRecipientRestrictions,
  constraintsLoading,
  constraintsError,
  availableAmountLabel,
  amountExceedsLimit,
  t,
}: {
  vaults: VaultRecord[];
  selectedVault: string;
  onSelect: (v: string) => void;
  recipient: string;
  onRecipientChange: (value: string) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  recipientOptions: AuthorizedRecipientOption[];
  hasRecipientRestrictions: boolean;
  constraintsLoading: boolean;
  constraintsError: string | null;
  availableAmountLabel: string | null;
  amountExceedsLimit: boolean;
  t: (key: string) => string;
}) {
  const recipientValid = recipient.length === 0 || ethers.isAddress(recipient);
  const amountValue = Number(amount);
  const amountValid = amount.length === 0 || (Number.isFinite(amountValue) && amountValue > 0 && !amountExceedsLimit);
  const selectedRecipient = recipientOptions.find((option) => option.address.toLowerCase() === recipient.toLowerCase()) ?? null;

  const getRecipientSecondaryLabel = (option: AuthorizedRecipientOption) => {
    const parts: string[] = [];
    if (option.remainingWei !== null) {
      parts.push(`${formatLyxAmount(option.remainingWei)} LYX`);
    } else {
      parts.push(t('task_wizard.step2.unlimited_amount'));
    }
    if (option.periodSeconds !== null) {
      parts.push(t('task_wizard.step2.period_cap').replace('{period}',
        option.periodSeconds === 300 ? t('task_wizard.freq.five_minutes') :
        option.periodSeconds === 3600 ? t('task_wizard.freq.hourly') :
        option.periodSeconds === 86400 ? t('task_wizard.freq.daily') :
        option.periodSeconds === 604800 ? t('task_wizard.freq.weekly') :
        option.periodSeconds === 2592000 ? t('task_wizard.freq.monthly') :
        `${option.periodSeconds}s`
      ));
    }
    return parts.join(' · ');
  };

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

      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          {t('task_wizard.step2.recipient_label')}
        </label>
        {constraintsLoading ? (
          <p className="text-xs text-neutral-500">{t('task_wizard.step2.loading_recipients')}</p>
        ) : hasRecipientRestrictions ? (
          recipientOptions.length > 0 ? (
            <>
              <Select value={recipient} onValueChange={onRecipientChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('task_wizard.step2.authorized_placeholder')}>
                    {selectedRecipient ? (
                      <span className="truncate">
                        {selectedRecipient.address.slice(0, 8)}…{selectedRecipient.address.slice(-4)}
                      </span>
                    ) : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {recipientOptions.map((option) => (
                    <SelectItem key={option.address} value={option.address}>
                      <div className="flex w-full items-center justify-between gap-3">
                        <span>{option.address.slice(0, 8)}…{option.address.slice(-4)}</span>
                        <span className="text-xs text-neutral-500">{getRecipientSecondaryLabel(option)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-neutral-500">{t('task_wizard.step2.authorized_help')}</p>
              {selectedRecipient && (
                <p className="text-xs text-neutral-500">{getRecipientSecondaryLabel(selectedRecipient)}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-red-500">{t('task_wizard.step2.no_authorized_recipients')}</p>
          )
        ) : (
          <>
            <input
              type="text"
              value={recipient}
              onChange={(e) => onRecipientChange(e.target.value.trim())}
              placeholder={t('task_wizard.step2.recipient_placeholder')}
              className="w-full h-10 rounded-md border border-neutral-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
            />
            <p className="text-xs text-neutral-500">{t('task_wizard.step2.manual_fallback')}</p>
          </>
        )}
        {constraintsError && (
          <p className="text-xs text-red-500 break-words leading-relaxed">{constraintsError}</p>
        )}
        {!recipientValid && !constraintsLoading && (
          <p className="text-xs text-red-500">{t('task_wizard.step2.recipient_invalid')}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          {t('task_wizard.step2.amount_label')}
        </label>
        <input
          type="number"
          min="0"
          step="0.0001"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder={t('task_wizard.step2.amount_placeholder')}
          className="w-full h-10 rounded-md border border-neutral-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
        />
        {!amountValid && (
          <p className="text-xs text-red-500">
            {amountExceedsLimit ? t('task_wizard.step2.amount_exceeds_available') : t('task_wizard.step2.amount_invalid')}
          </p>
        )}
        {availableAmountLabel && (
          <p className="text-xs text-neutral-500">{t('task_wizard.step2.available_amount').replace('{amount}', availableAmountLabel)}</p>
        )}
      </div>
    </div>
  );
}

// Step 3
function Step3({ freq, setFreq, customBlocks, setCustomBlocks, isAdvanced, maxPeriodSeconds, t }: {
  freq: Frequency;
  setFreq: (f: Frequency) => void;
  customBlocks: string;
  setCustomBlocks: (s: string) => void;
  isAdvanced: boolean;
  maxPeriodSeconds: number | null;
  t: (key: string) => string;
}) {
  const FREQUENCIES = [
    { value: 'five-minutes' as Frequency, label: t('task_wizard.freq.five_minutes'), seconds: 300 },
    { value: 'hourly'       as Frequency, label: t('task_wizard.freq.hourly'),       seconds: 3600 },
    { value: 'daily'        as Frequency, label: t('task_wizard.freq.daily'),        seconds: 86400 },
    { value: 'weekly'       as Frequency, label: t('task_wizard.freq.weekly'),       seconds: 604800 },
    { value: 'monthly'      as Frequency, label: t('task_wizard.freq.monthly'),      seconds: 2592000 },
  ];
  const customBlockLimit = maxPeriodSeconds === null ? null : Math.max(1, Math.floor(maxPeriodSeconds / 12));
  return (
    <div className="p-6 space-y-4">
      <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">{t('task_wizard.step3.title')}</h3>
      {maxPeriodSeconds !== null && (
        <p className="text-xs text-neutral-500">{t('task_wizard.step3.limit_note').replace('{period}', FREQUENCIES.find((item) => item.seconds === maxPeriodSeconds)?.label ?? `${maxPeriodSeconds}s`)}</p>
      )}
      <div className="space-y-2">
        {FREQUENCIES.map((f) => (
          (() => {
            const allowed = maxPeriodSeconds === null || f.seconds <= maxPeriodSeconds;
            return (
          <button
            key={f.value}
            disabled={!allowed}
            onClick={() => setFreq(f.value)}
            className={cn(
              'w-full flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45',
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
            );
          })()
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
              <>
                <input
                  type="number"
                  value={customBlocks}
                  onChange={(e) => setCustomBlocks(e.target.value)}
                  placeholder={t('task_wizard.freq.custom_blocks_placeholder')}
                  className="mt-2 w-full h-9 rounded-md border border-neutral-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
                />
                {customBlockLimit !== null && (
                  <p className="mt-2 text-xs text-neutral-500">{t('task_wizard.freq.custom_blocks_limit').replace('{count}', String(customBlockLimit))}</p>
                )}
              </>
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
  canCreateOnChain: boolean;
  blockedReason?: string;
  initialVaultSafe?: string;
  onSave: (task: NewTaskDraft) => Promise<void>;
}

export function NewTaskWizardModal({ open, onClose, vaults, isAdvanced, canCreateOnChain, blockedReason, initialVaultSafe, onSave }: NewTaskWizardModalProps) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [selectedVault, setSelectedVault] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [freq, setFreq] = useState<Frequency>('monthly');
  const [customBlocks, setCustomBlocks] = useState('7200');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [constraints, setConstraints] = useState<VaultAutomationConstraints>({
    recipientOptions: [],
    hasRecipientRestrictions: false,
    globalRemainingWei: null,
    maxPeriodSeconds: null,
  });
  const [constraintsLoading, setConstraintsLoading] = useState(false);
  const [constraintsError, setConstraintsError] = useState<string | null>(null);

  const FREQ_LABELS: Record<Frequency, string> = {
    'five-minutes': t('task_wizard.freq.five_minutes'),
    'hourly': t('task_wizard.freq.hourly'),
    'daily': t('task_wizard.freq.daily'),
    'weekly': t('task_wizard.freq.weekly'),
    'monthly': t('task_wizard.freq.monthly'),
    'custom-blocks': t('task_wizard.freq.custom_blocks'),
  };

  const frequencyConfig = useMemo(() => {
    if (freq === 'five-minutes') return { triggerType: 'timestamp' as const, interval: 300 };
    if (freq === 'hourly') return { triggerType: 'timestamp' as const, interval: 3600 };
    if (freq === 'daily') return { triggerType: 'timestamp' as const, interval: 86400 };
    if (freq === 'weekly') return { triggerType: 'timestamp' as const, interval: 604800 };
    if (freq === 'monthly') return { triggerType: 'timestamp' as const, interval: 2592000 };

    const blocks = Number(customBlocks);
    if (!Number.isFinite(blocks) || blocks <= 0) {
      return null;
    }

    return { triggerType: 'block' as const, interval: Math.floor(blocks) };
  }, [customBlocks, freq]);

  const selectedRecipientConstraint = useMemo(
    () => constraints.recipientOptions.find((option) => option.address.toLowerCase() === recipient.toLowerCase()) ?? null,
    [constraints.recipientOptions, recipient]
  );

  const availableAmountWei = useMemo(
    () => minBigInt(constraints.globalRemainingWei, selectedRecipientConstraint?.remainingWei ?? null),
    [constraints.globalRemainingWei, selectedRecipientConstraint]
  );

  const availableAmountLabel = availableAmountWei === null ? null : `${formatLyxAmount(availableAmountWei)} LYX`;

  const amountExceedsLimit = useMemo(() => {
    if (amount.trim().length === 0 || availableAmountWei === null) return false;
    try {
      return ethers.parseEther(amount.trim()) > availableAmountWei;
    } catch {
      return false;
    }
  }, [amount, availableAmountWei]);

  const allowedMaxPeriodSeconds = useMemo(
    () => minNumber(constraints.maxPeriodSeconds, selectedRecipientConstraint?.periodSeconds ?? null),
    [constraints.maxPeriodSeconds, selectedRecipientConstraint]
  );

  const customBlocksValid = useMemo(() => {
    if (freq !== 'custom-blocks' || frequencyConfig === null) return true;
    return allowedMaxPeriodSeconds === null || (frequencyConfig.interval * 12) <= allowedMaxPeriodSeconds;
  }, [allowedMaxPeriodSeconds, freq, frequencyConfig]);

  useEffect(() => {
    if (!open) return;
    if (!initialVaultSafe) return;
    if (!vaults.some((vault) => vault.safe === initialVaultSafe)) return;
    setSelectedVault((current) => current || initialVaultSafe);
  }, [initialVaultSafe, open, vaults]);

  useEffect(() => {
    if (!open || !selectedVault) {
      setConstraints({ recipientOptions: [], hasRecipientRestrictions: false, globalRemainingWei: null, maxPeriodSeconds: null });
      setConstraintsError(null);
      setConstraintsLoading(false);
      return;
    }

    const selectedVaultRecord = vaults.find((vault) => vault.safe === selectedVault);
    if (!selectedVaultRecord) {
      return;
    }

    let cancelled = false;
    setConstraintsLoading(true);
    setConstraintsError(null);

    loadVaultAutomationConstraints(selectedVaultRecord)
      .then((result) => {
        if (cancelled) return;
        setConstraints(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setConstraints({ recipientOptions: [], hasRecipientRestrictions: false, globalRemainingWei: null, maxPeriodSeconds: null });
        setConstraintsError(getLocalizedErrorMessage(error, t));
      })
      .finally(() => {
        if (!cancelled) setConstraintsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedVault, t, vaults]);

  useEffect(() => {
    if (!constraints.hasRecipientRestrictions) {
      return;
    }

    if (constraints.recipientOptions.length === 0) {
      if (recipient !== '') setRecipient('');
      return;
    }

    const stillAllowed = constraints.recipientOptions.some((option) => option.address.toLowerCase() === recipient.toLowerCase());
    if (!stillAllowed) {
      setRecipient(constraints.recipientOptions[0].address);
    }
  }, [constraints.hasRecipientRestrictions, constraints.recipientOptions, recipient]);

  useEffect(() => {
    if (allowedMaxPeriodSeconds === null) return;
    if (freq !== 'custom-blocks' && FREQUENCY_SECONDS[freq] <= allowedMaxPeriodSeconds) return;

    const fallback = (Object.entries(FREQUENCY_SECONDS).find(([, seconds]) => seconds <= allowedMaxPeriodSeconds)?.[0] ?? 'five-minutes') as Exclude<Frequency, 'custom-blocks'>;
    setFreq(fallback);
  }, [allowedMaxPeriodSeconds, freq]);

  const handleClose = () => {
    setStep(0);
    setActionType(null);
    setSelectedVault('');
    setRecipient('');
    setAmount('');
    setFreq('monthly');
    setCustomBlocks('7200');
    setSubmitError(null);
    setIsSubmitting(false);
    setConstraints({ recipientOptions: [], hasRecipientRestrictions: false, globalRemainingWei: null, maxPeriodSeconds: null });
    setConstraintsLoading(false);
    setConstraintsError(null);
    onClose();
  };

  const canNext = () => {
    if (step === 0) return actionType === 'fixed-payment';
    if (step === 1) {
      return selectedVault !== ''
        && ethers.isAddress(recipient)
        && Number(amount) > 0
        && !amountExceedsLimit
        && (!constraints.hasRecipientRestrictions || constraints.recipientOptions.length > 0);
    }

    if (freq === 'custom-blocks') {
      return frequencyConfig !== null && customBlocksValid;
    }

    return allowedMaxPeriodSeconds === null || FREQUENCY_SECONDS[freq] <= allowedMaxPeriodSeconds;
  };

  const handleFinish = async () => {
    if (!canCreateOnChain) {
      setSubmitError(blockedReason ?? t('task_wizard.error.scheduler_owner_required'));
      return;
    }

    if (actionType !== 'fixed-payment' || !frequencyConfig) {
      setSubmitError(t('task_wizard.error.unsupported_action'));
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      await onSave({
        actionType,
        vaultSafe: selectedVault,
        recipient,
        amount,
        triggerType: frequencyConfig.triggerType,
        interval: frequencyConfig.interval,
        intervalLabel: freq === 'custom-blocks'
          ? `${t('task_wizard.freq.custom_blocks')} ${customBlocks}`
          : (FREQ_LABELS[freq] ?? ''),
      });
      handleClose();
    } catch (error) {
      setSubmitError(getLocalizedErrorMessage(error, t));
      setIsSubmitting(false);
    }
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
          {step === 1 && (
            <Step2
              vaults={vaults}
              selectedVault={selectedVault}
              onSelect={setSelectedVault}
              recipient={recipient}
              onRecipientChange={setRecipient}
              amount={amount}
              onAmountChange={setAmount}
              recipientOptions={constraints.recipientOptions}
              hasRecipientRestrictions={constraints.hasRecipientRestrictions}
              constraintsLoading={constraintsLoading}
              constraintsError={constraintsError}
              availableAmountLabel={availableAmountLabel}
              amountExceedsLimit={amountExceedsLimit}
              t={t}
            />
          )}
          {step === 2 && (
            <Step3
              freq={freq}
              setFreq={setFreq}
              customBlocks={customBlocks}
              setCustomBlocks={setCustomBlocks}
              isAdvanced={isAdvanced}
              maxPeriodSeconds={allowedMaxPeriodSeconds}
              t={t}
            />
          )}
        </div>

        <div className="px-6">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {canCreateOnChain ? t('task_wizard.create_on_chain_note') : (blockedReason ?? t('task_wizard.error.scheduler_owner_required'))}
          </div>
          {submitError && (
            <p className="mt-2 text-xs text-red-500 break-words leading-relaxed">{localizeErrorMessage(submitError, t)}</p>
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
              <Button size="sm" onClick={handleFinish} disabled={!canNext() || isSubmitting || !canCreateOnChain}>
                {isSubmitting ? t('task_wizard.btn.creating') : t('task_wizard.btn.create')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
