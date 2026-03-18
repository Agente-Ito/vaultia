'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ethers } from 'ethers';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/common/Button';
import { Alert, AlertDescription } from '@/components/common/Alert';
import { cn } from '@/lib/utils/cn';
import { useOnboarding, type UseCase } from '@/context/OnboardingContext';
import { useWeb3 } from '@/context/Web3Context';
import { useI18n } from '@/context/I18nContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const e = error as { reason?: unknown; message?: unknown };
    if (typeof e.reason === 'string' && e.reason) return e.reason;
    if (typeof e.message === 'string' && e.message) return e.message;
  }
  return String(error);
}

const PERIOD_MAP: Record<'daily' | 'weekly' | 'monthly', number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
};

// ─── Static use-case data (ids and emojis only; strings resolved via t()) ─────

const USE_CASE_DATA: { id: UseCase; emoji: string }[] = [
  { id: 'family', emoji: '🏠' },
  { id: 'daily',  emoji: '🛒' },
  { id: 'defi',   emoji: '📈' },
];

// ─── Static period data (values only; labels resolved via t()) ────────────────

const PERIOD_VALUES = ['daily', 'weekly', 'monthly'] as const;

// ─── Step 1: Use-case selection ───────────────────────────────────────────────

function Step1({ onSelect }: { onSelect: (uc: UseCase) => void }) {
  const { t } = useI18n();
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
          {t('onboarding.step1.title')}
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          {t('onboarding.step1.subtitle')}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {USE_CASE_DATA.map((uc) => (
          <button
            key={uc.id}
            onClick={() => onSelect(uc.id)}
            className="group text-left rounded-xl border-2 border-neutral-200 hover:border-primary-400 hover:bg-primary-50 p-4 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-700 dark:hover:border-primary-500 dark:hover:bg-neutral-700"
          >
            <span className="text-3xl">{uc.emoji}</span>
            <h3 className="mt-2 font-semibold text-neutral-900 dark:text-neutral-50 text-sm">
              {t(`onboarding.usecase.${uc.id}.title`)}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
              {t(`onboarding.usecase.${uc.id}.desc`)}
            </p>
            <span className="mt-3 inline-block text-xs font-medium text-primary-500 group-hover:translate-x-0.5 transition-transform">
              {t('onboarding.step1.select')}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step 2: Vault name + emoji ───────────────────────────────────────────────

const EMOJIS = ['💰', '🏠', '🛒', '📈', '🎯', '✈️', '🏥', '🎓', '🎵', '⚡'];

function Step2() {
  const { t } = useI18n();
  const { vaultName, vaultEmoji, setVaultName, setVaultEmoji } = useOnboarding();
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
          {t('onboarding.step2.title')}
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          {t('onboarding.step2.subtitle')}
        </p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-1">
            {t('onboarding.step2.name_label')}
          </label>
          <input
            type="text"
            value={vaultName}
            onChange={(e) => setVaultName(e.target.value)}
            placeholder={t('onboarding.step2.name_placeholder')}
            className="w-full h-10 rounded-md border border-neutral-300 px-3 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-2">
            {t('onboarding.step2.icon_label')}
          </label>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setVaultEmoji(e)}
                className={cn(
                  'w-10 h-10 rounded-lg border-2 text-xl flex items-center justify-center transition-all',
                  vaultEmoji === e
                    ? 'border-primary-500 bg-primary-50 dark:bg-neutral-700'
                    : 'border-neutral-200 hover:border-primary-300 dark:border-neutral-700'
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Root budget ──────────────────────────────────────────────────────

function Step3() {
  const { t } = useI18n();
  const { rootBudget, budgetPeriod, setRootBudget, setBudgetPeriod } = useOnboarding();
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
          {t('onboarding.step3.title')}
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          {t('onboarding.step3.subtitle')}
        </p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-1">
            {t('onboarding.step3.amount_label')}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm font-medium">
              LYX
            </span>
            <input
              type="number"
              value={rootBudget}
              onChange={(e) => setRootBudget(e.target.value)}
              min="0"
              step="0.1"
              className="w-full h-10 rounded-md border border-neutral-300 pl-12 pr-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-2">
            {t('onboarding.step3.period_label')}
          </label>
          <div className="flex gap-2">
            {PERIOD_VALUES.map((value) => (
              <button
                key={value}
                onClick={() => setBudgetPeriod(value)}
                className={cn(
                  'flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all',
                  budgetPeriod === value
                    ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-neutral-700 dark:text-primary-300'
                    : 'border-neutral-200 text-neutral-600 hover:border-primary-300 dark:border-neutral-700 dark:text-neutral-400'
                )}
              >
                {t(`onboarding.step3.period.${value}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Summary + deploy ─────────────────────────────────────────────────

function Step4({ deploying, deployError }: { deploying: boolean; deployError: string | null }) {
  const { t } = useI18n();
  const { vaultEmoji, vaultName, rootBudget, budgetPeriod, useCase } = useOnboarding();
  const { isConnected, isRegistryConfigured } = useWeb3();

  const ucTitle = useCase ? t(`onboarding.usecase.${useCase}.title`) : '—';
  const periodLabel = t(`onboarding.step3.period.${budgetPeriod}`);

  return (
    <div className="p-6 space-y-6">
      <div className="text-center space-y-2">
        <div className="text-5xl">{vaultEmoji}</div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
          {t('onboarding.step4.title')}
        </h2>
        <p className="text-sm text-neutral-500">
          {t('onboarding.step4.subtitle')}
        </p>
      </div>

      <div className="rounded-xl bg-neutral-50 dark:bg-neutral-700/50 p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">{t('onboarding.step4.use_case')}</span>
          <span className="font-medium text-neutral-900 dark:text-neutral-50">{ucTitle}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">{t('onboarding.step4.vault')}</span>
          <span className="font-medium text-neutral-900 dark:text-neutral-50">{vaultName || t('onboarding.step4.no_name')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">{t('onboarding.step4.budget')}</span>
          <span className="font-medium text-neutral-900 dark:text-neutral-50">
            {rootBudget} LYX / {periodLabel}
          </span>
        </div>
      </div>

      {!isRegistryConfigured && (
        <Alert variant="warning">
          <AlertDescription>
            {t('onboarding.registry_not_configured')}
          </AlertDescription>
        </Alert>
      )}

      {isRegistryConfigured && !isConnected && (
        <Alert variant="warning">
          <AlertDescription>
            {t('onboarding.connect_wallet')}
          </AlertDescription>
        </Alert>
      )}

      {deployError && (
        <Alert variant="error">
          <AlertDescription>{deployError}</AlertDescription>
        </Alert>
      )}

      {deploying && (
        <p className="text-sm text-center text-neutral-500 animate-pulse">
          {t('onboarding.step4.deploying')}
        </p>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function OnboardingModal() {
  const router = useRouter();
  const { t } = useI18n();
  const {
    step, visible, dismissed,
    close, next, back, finish, dismissPermanently,
    setUseCase,
    vaultName, rootBudget, budgetPeriod,
  } = useOnboarding();

  const { registry, signer, isConnected, isRegistryConfigured } = useWeb3();

  const [neverShow, setNeverShow] = React.useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const stepLabels = [
    t('onboarding.step_labels.0'),
    t('onboarding.step_labels.1'),
    t('onboarding.step_labels.2'),
    t('onboarding.step_labels.3'),
  ];

  const handleClose = () => {
    if (neverShow) dismissPermanently();
    else close();
  };

  const handleUseCaseSelect = (uc: UseCase) => {
    setUseCase(uc);
    next();
  };

  const handleDeploy = async () => {
    if (!isRegistryConfigured || !registry || !signer) {
      setDeployError(t('onboarding.connect_wallet'));
      return;
    }

    setDeploying(true);
    setDeployError(null);

    try {
      const tx = await registry.deployVault({
        budget: ethers.parseEther(rootBudget || '0'),
        period: PERIOD_MAP[budgetPeriod],
        budgetToken: ethers.ZeroAddress,
        expiration: BigInt(0),
        agents: [],
        agentBudgets: [],
        merchants: [],
        label: vaultName || 'My Vault',
      });

      await tx.wait();
      finish();
      router.push('/vaults');
    } catch (err: unknown) {
      setDeployError(getErrorMessage(err));
    } finally {
      setDeploying(false);
    }
  };

  const progressValue = ((step + 1) / stepLabels.length) * 100;
  const isLastStep = step === stepLabels.length - 1;
  const canDeploy = isConnected && isRegistryConfigured && !deploying;

  // dismissed only blocks auto-show on load; manual open() clears it
  if (dismissed && !visible) return null;

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-lg font-bold text-neutral-900 dark:text-neutral-50">💰 {t('onboarding.app_name')}</DialogTitle>
          </div>
          <span className="text-xs text-neutral-400 font-medium">
            {step + 1} / {stepLabels.length}
          </span>
        </div>

        {/* Progress */}
        <div className="px-6 pt-3">
          <Progress value={progressValue} className="h-1.5" />
          <div className="flex gap-2 mt-2">
            {stepLabels.map((label, i) => (
              <span
                key={label}
                className={cn(
                  'text-xs flex-1 text-center transition-colors',
                  i <= step ? 'text-primary-500 font-medium' : 'text-neutral-400'
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="min-h-[280px]">
          {step === 0 && <Step1 onSelect={handleUseCaseSelect} />}
          {step === 1 && <Step2 />}
          {step === 2 && <Step3 />}
          {step === 3 && <Step4 deploying={deploying} deployError={deployError} />}
        </div>

        {/* Footer */}
        {step > 0 && (
          <div className="px-6 pb-5 space-y-3">
            {step >= 1 && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={neverShow}
                  onChange={(e) => setNeverShow(e.target.checked)}
                  className="rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-xs text-neutral-500">{t('onboarding.footer.never_show')}</span>
              </label>
            )}
            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" size="sm" onClick={back} disabled={deploying}>
                {t('onboarding.btn.back')}
              </Button>
              <div className="flex gap-2">
                {!isLastStep && (
                  <Button variant="ghost" size="sm" onClick={handleClose}>
                    {t('onboarding.btn.skip')}
                  </Button>
                )}
                {!isLastStep ? (
                  <Button size="sm" onClick={next}>
                    {t('onboarding.btn.next')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="success"
                    onClick={handleDeploy}
                    disabled={!canDeploy}
                  >
                    {deploying ? t('onboarding.btn.deploying') : t('onboarding.btn.start')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
