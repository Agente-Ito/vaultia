'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Button } from '@/components/common/Button';
import { Alert, AlertDescription } from '@/components/common/Alert';
import { Progress } from '@/components/ui/progress';
import { GoalCard } from '@/components/wizard/GoalCard';
import { RecipientField } from '@/components/wizard/RecipientField';
import { SafetyLevelChips } from '@/components/wizard/SafetyLevelChips';
import { WizardReviewSummary } from '@/components/wizard/WizardReviewSummary';
import { useI18n } from '@/context/I18nContext';
import { useOnboarding } from '@/context/OnboardingContext';
import type { FrequencyKey, ExecutorType, GoalKey } from '@/context/OnboardingContext';
import { useWeb3 } from '@/context/Web3Context';
import { ethers } from 'ethers';
import { buildSimpleWizardDeployParams, deployRegistryVault, validateSimpleWizardInput } from '@/lib/web3/deployVault';

// ─── Step indices ─────────────────────────────────────────────────────────────
// 0: Vault name
// 1: Goal
// 2: Who + Limits
// 3: Automation
// 4: Review & Activate

const TOTAL_STEPS = 5;

const SIMPLE_FREQS: FrequencyKey[] = ['daily', 'weekly', 'monthly', 'hourly', 'five-minutes'];

const FREQ_I18N: Record<FrequencyKey, string> = {
  daily: 'wizard.limits.freq.daily',
  weekly: 'wizard.limits.freq.weekly',
  monthly: 'wizard.limits.freq.monthly',
  hourly: 'wizard.limits.freq.hourly',
  'five-minutes': 'wizard.limits.freq.five_minutes',
};
const SIMPLE_EXECUTORS: ExecutorType[] = ['vaultia', 'my_agent'];

// Primary preset goals always visible
const PRIMARY_GOAL_KEYS: GoalKey[] = ['pay_people', 'pay_vendors', 'subscriptions'];
// Coming soon — shown disabled
const COMING_SOON_GOAL_KEYS: GoalKey[] = ['yields' as GoalKey];
// Advanced goals shown when expanded
const ADVANCED_GOAL_KEYS: GoalKey[] = ['payroll', 'grants', 'treasury_rebalance', 'tax_reserve'];

const STEP_LABEL_KEYS = [
  'wizard.step_label.goal',
  'wizard.step_label.vault',
  'wizard.step_label.limits',
  'wizard.step_label.automation',
  'wizard.step_label.review',
] as const;

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { reason?: unknown; message?: unknown };
    if (typeof candidate.reason === 'string' && candidate.reason) return candidate.reason;
    if (typeof candidate.message === 'string' && candidate.message) return candidate.message;
  }
  return String(error);
}

export function SimpleSetupFlow() {
  const router = useRouter();
  const {
    wizardVaultName,
    setWizardVaultName,
    goal,
    setGoal,
    luksoToken,
    setLuksoToken,
    recipients,
    addRecipient,
    removeRecipient,
    maxPerTx,
    setMaxPerTx,
    frequency,
    setFrequency,
    agentEnabled,
    setAgentEnabled,
    executor,
    setExecutor,
    safetyLevel,
    setSafetyLevel,
    setWizardMode,
    finish,
  } = useOnboarding();
  const { registry, signer, isConnected, isRegistryConfigured, connect, hasUPExtension } = useWeb3();
  const { t } = useI18n();

  const [step, setStep] = useState(() => (goal ? 1 : 0));
  const [stepError, setStepError] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [goalsExpanded, setGoalsExpanded] = useState(false);
  const [customTokenOpen, setCustomTokenOpen] = useState(false);
  const [myAgentAddress, setMyAgentAddress] = useState('');

  // ── Per-recipient limits (Track 3) ────────────────────────────────────────
  const [recipientLimitsEnabled, setRecipientLimitsEnabled] = useState(false);
  const [recipientLimitMode, setRecipientLimitMode] = useState<'global' | 'per'>('global');
  const [globalRecipientAmount, setGlobalRecipientAmount] = useState('');
  const [globalRecipientPeriod, setGlobalRecipientPeriod] = useState<FrequencyKey>('weekly');
  const [perRecipientLimits, setPerRecipientLimits] = useState<Record<string, { amount: string; period: FrequencyKey }>>({});

  // ── Sub-vaults (Track 7B) ─────────────────────────────────────────────────
  const [subVaultsOpen, setSubVaultsOpen] = useState(false);
  const [subVaults, setSubVaults] = useState<Array<{ label: string; budget: string; period: FrequencyKey }>>([]);

  useEffect(() => {
    setWizardMode('simple');
  }, [setWizardMode]);

  const progressValue = ((step + 1) / TOTAL_STEPS) * 100;
  const isLastStep = step === TOTAL_STEPS - 1;
  const canDeploy = isConnected && isRegistryConfigured && !deploying;

  const placeholder = t('wizard.limits.recipients_placeholder_up');

  const connectLabel = hasUPExtension
    ? t('wizard.review.connect_up')
    : t('wizard.review.connect_up_fallback');

  const translateSimpleError = (errorCode: string) => {
    const translations: Record<string, Parameters<typeof t>[0]> = {
      missing_goal: 'wizard.goal.missing',
      invalid_amount: 'wizard.limits.error.invalid_amount',
      invalid_address: 'wizard.limits.error.invalid_address',
      duplicate_address: 'wizard.limits.error.duplicate_address',
      missing_recipients: 'wizard.limits.error.missing_recipients',
      manual_executor_invalid: 'wizard.automation.error.manual_hidden',
      my_agent_missing_address: 'wizard.automation.error.my_agent_missing_address',
    };
    const key = translations[errorCode];
    return key ? t(key) : errorCode;
  };

  const validateSimple = (strictExecutorSetup = false) =>
    validateSimpleWizardInput(
      { goal, recipients, maxPerTx, frequency, agentEnabled, executor, safetyLevel },
      { strictExecutorSetup }
    );

  const handleExit = () => {
    router.push(isConnected ? '/dashboard' : '/');
  };

  const handleConnectWallet = async (openConnectModal: () => void) => {
    if (hasUPExtension) {
      await connect();
      return;
    }
    window.setTimeout(() => { openConnectModal(); }, 80);
  };

  const handleNext = () => {
    setStepError(null);
    setDeployError(null);

    if (step === 0 && !goal) {
      setStepError(translateSimpleError('missing_goal'));
      return;
    }

    if (step === 2) {
      const relevantErrors = validateSimple(false).filter((error) =>
        ['invalid_amount', 'invalid_address', 'duplicate_address', 'missing_recipients'].includes(error)
      );
      if (relevantErrors.length > 0) {
        setStepError(translateSimpleError(relevantErrors[0]));
        return;
      }
    }

    if (step === 3 && agentEnabled && executor === 'me') {
      setStepError(translateSimpleError('manual_executor_invalid'));
      return;
    }

    if (step === 3 && agentEnabled && executor === 'my_agent' &&
        (!myAgentAddress.trim() || !ethers.isAddress(myAgentAddress.trim()))) {
      setStepError(translateSimpleError('my_agent_missing_address'));
      return;
    }

    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };

  const handleBack = () => {
    setStepError(null);
    setDeployError(null);
    if (step === 0) {
      handleExit();
      return;
    }
    setStep((s) => s - 1);
  };

  const handleContinueToExpert = () => {
    setWizardMode('expert');
    router.push('/vaults/create');
  };

  const handleDeploy = async () => {
    const validationErrors = validateSimple(true);
    if (validationErrors.length > 0) {
      setDeployError(translateSimpleError(validationErrors[0]));
      return;
    }

    if (!isConnected) {
      setDeployError(t('wizard.review.connect_wallet_required'));
      return;
    }

    if (luksoToken.trim() && !ethers.isAddress(luksoToken.trim())) {
      setDeployError(t('wizard.vault.lukso_token_invalid'));
      return;
    }

    setDeploying(true);
    setDeployError(null);

    try {
      if (!isRegistryConfigured || !registry || !signer) {
        setDeployError(t('wizard.review.connect_wallet_required'));
        return;
      }
      await deployRegistryVault({
        registry,
        params: buildSimpleWizardDeployParams({
          vaultName: wizardVaultName,
          goal,
          recipients,
          maxPerTx,
          frequency,
          agentEnabled,
          executor,
          safetyLevel,
          luksoToken,
          myAgentAddress,
          recipientLimitsEnabled,
          recipientLimitMode,
          globalRecipientLimit: { amount: globalRecipientAmount, period: globalRecipientPeriod },
          perRecipientLimits,
        }),
      });
      finish();
      router.push('/dashboard');
    } catch (error: unknown) {
      setDeployError(getErrorMessage(error));
    } finally {
      setDeploying(false);
    }
  };

  const handleToggleAgent = () => {
    const nextEnabled = !agentEnabled;
    setAgentEnabled(nextEnabled);
    if (!nextEnabled) {
      setExecutor('me');
      setSafetyLevel('safe');
      return;
    }
    if (executor === 'me') {
      setExecutor('vaultia');
    }
  };

  return (
    <section className="px-lg py-lg">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent)' }}>
              {t('wizard.title')}
            </p>
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>
              {step === 0
                ? t('wizard.goal.title')
                : step === 1
                  ? t('wizard.vault.title')
                  : step === 2
                    ? t('wizard.limits.title')
                    : step === 3
                      ? t('wizard.automation.title')
                      : t('wizard.review.title')}
            </h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              {step === 0
                ? t('wizard.goal.subtitle')
                : step === 1
                  ? t('wizard.vault.setup_subtitle')
                  : step === 2
                    ? t('wizard.limits.subtitle')
                    : step === 3
                      ? t('wizard.automation.subtitle')
                      : t('wizard.review.subtitle')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
              {step + 1} / {TOTAL_STEPS}
            </div>
            <button
              type="button"
              onClick={handleContinueToExpert}
              className="text-xs font-medium transition-opacity hover:opacity-80"
              style={{ color: 'var(--accent)' }}
            >
              {t('wizard.header.expert_cta')}
            </button>
          </div>
        </div>

        <div className="rounded-3xl p-6 md:p-8" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          {/* Progress */}
          <Progress value={progressValue} className="h-1.5" />
          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            {STEP_LABEL_KEYS.map((labelKey, idx) => {
              const isActive = idx === step;
              const isDone = idx < step;
              const isNext = idx === step + 1;
              const isClickable = isDone || isNext;

              const handlePillClick = () => {
                if (isDone) {
                  setStepError(null);
                  setDeployError(null);
                  setStep(idx);
                } else if (isNext) {
                  handleNext();
                }
              };

              return (
                <div
                  key={labelKey}
                  role={isClickable ? 'button' : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  onClick={isClickable ? handlePillClick : undefined}
                  onKeyDown={(e) => {
                    if (isClickable && (e.key === 'Enter' || e.key === ' ')) handlePillClick();
                  }}
                  className="rounded-2xl px-3 py-2 text-xs font-medium text-center transition-opacity"
                  style={{
                    background: isActive ? 'var(--card-mid)' : 'transparent',
                    border: `1px solid ${isActive ? 'var(--accent)' : isNext ? 'var(--border)' : 'var(--border)'}`,
                    color: isDone ? 'var(--success)' : isActive ? 'var(--text)' : 'var(--text-muted)',
                    cursor: isClickable ? 'pointer' : 'default',
                    opacity: isNext ? 0.7 : 1,
                  }}
                >
                  {isDone ? '✓ ' : ''}{t(labelKey)}
                </div>
              );
            })}
          </div>

          <div className="mt-8 min-h-[420px]">

            {/* ── Step 0: Goal ───────────────────────────────────────────────── */}
            {step === 0 && (
              <div className="space-y-6">
                {/* Primary presets */}
                <div className="grid gap-3 md:grid-cols-3">
                  {PRIMARY_GOAL_KEYS.map((goalKey) => (
                    <GoalCard
                      key={goalKey}
                      goalKey={goalKey}
                      selected={goal === goalKey}
                      onSelect={() => setGoal(goalKey)}
                    />
                  ))}
                </div>

                {/* Coming soon */}
                <div className="grid gap-3 md:grid-cols-3">
                  {COMING_SOON_GOAL_KEYS.map((goalKey) => (
                    <GoalCard
                      key={goalKey}
                      goalKey={goalKey}
                      selected={false}
                      onSelect={() => {}}
                      comingSoon
                    />
                  ))}
                </div>

                {/* Expandable advanced goals */}
                <div>
                  <button
                    type="button"
                    onClick={() => setGoalsExpanded((v) => !v)}
                    className="flex items-center gap-2 text-xs font-semibold transition-opacity hover:opacity-80"
                    style={{ color: 'var(--accent)' }}
                  >
                    <span
                      className="inline-block transition-transform duration-200"
                      style={{ transform: goalsExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >
                      ▶
                    </span>
                    {goalsExpanded ? t('wizard.goal.show_less') : t('wizard.goal.show_more')}
                  </button>

                  {goalsExpanded && (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {ADVANCED_GOAL_KEYS.map((goalKey) => (
                        <GoalCard
                          key={goalKey}
                          goalKey={goalKey}
                          selected={goal === goalKey}
                          onSelect={() => setGoal(goalKey)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {stepError && (
                  <p className="text-sm" style={{ color: 'var(--blocked)' }}>{stepError}</p>
                )}
              </div>
            )}

            {/* ── Step 1: Network + Name ─────────────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-6 max-w-lg">
                {/* Network selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    {t('wizard.limits.network.label')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {/* LUKSO — active */}
                    <div
                      className="rounded-xl px-3 py-3 text-left text-sm font-medium"
                      style={{
                        background: 'var(--card-mid)',
                        border: '1px solid var(--accent)',
                        color: 'var(--text)',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span>{t('wizard.limits.network.up')}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(34,255,178,0.15)', color: 'var(--success)' }}>
                          ✓ Active
                        </span>
                      </div>
                    </div>
                    {/* Base — coming soon */}
                    <div
                      className="rounded-xl px-3 py-3 text-left text-sm font-medium opacity-50 cursor-not-allowed"
                      style={{
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span>{t('wizard.limits.network.base')}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--card-mid)', color: 'var(--text-muted)' }}>
                          {t('wizard.limits.network.coming_soon')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('wizard.limits.network.up_hint')}
                  </p>
                </div>

                {/* Vault name */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    {t('wizard.vault.name_label')}
                  </label>
                  <input
                    type="text"
                    value={wizardVaultName}
                    onChange={(e) => setWizardVaultName(e.target.value)}
                    placeholder={t('wizard.vault.name_placeholder')}
                    maxLength={48}
                    autoFocus
                    className="w-full rounded-xl px-4 py-3 text-base focus:outline-none"
                    style={{
                      background: 'var(--card-mid)',
                      border: `1px solid ${stepError ? 'var(--blocked)' : 'var(--border)'}`,
                      color: 'var(--text)',
                    }}
                  />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('wizard.vault.name_hint')}
                  </p>
                </div>

                {/* Custom token — hidden by default, discoverable */}
                <div>
                    <button
                      type="button"
                      onClick={() => setCustomTokenOpen((v) => !v)}
                      className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-80"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span
                        className="inline-block transition-transform duration-200"
                        style={{ transform: customTokenOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                      >▶</span>
                      {t('wizard.vault.custom_token_cta')}
                    </button>
                    {customTokenOpen && (
                      <div className="mt-2 space-y-1">
                        {process.env.NEXT_PUBLIC_LUKSO_DEMO_TOKEN_ADDRESS && (
                          <button
                            type="button"
                            onClick={() => setLuksoToken(process.env.NEXT_PUBLIC_LUKSO_DEMO_TOKEN_ADDRESS!)}
                            className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                            style={{ background: 'var(--card-mid)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
                          >
                            AVT — Demo Token (testnet)
                          </button>
                        )}
                        <input
                          type="text"
                          value={luksoToken}
                          onChange={(e) => setLuksoToken(e.target.value)}
                          placeholder={t('wizard.vault.lukso_token_placeholder')}
                          className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none font-mono"
                          style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                        />
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {t('wizard.vault.lukso_token_hint')}
                        </p>
                      </div>
                    )}
                  </div>

                {/* ── Sub-vaults (Track 7B) ─────────────────────────────────── */}
                <div>
                  <button
                    type="button"
                    onClick={() => setSubVaultsOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                    style={{ color: 'var(--text-muted)' }}
                    title={t('wizard.subvaults.tooltip')}
                  >
                    <span
                      className="inline-block transition-transform duration-200"
                      style={{ transform: subVaultsOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >▶</span>
                    {t('wizard.subvaults.add_cta')}
                  </button>

                  {subVaultsOpen && (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {t('wizard.subvaults.tooltip')}
                      </p>
                      {subVaults.map((sv, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={sv.label}
                            onChange={(e) => setSubVaults((prev) => prev.map((s, i) => i === idx ? { ...s, label: e.target.value } : s))}
                            placeholder={t('wizard.subvaults.label_placeholder')}
                            className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
                            style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                          />
                          <input
                            type="number"
                            value={sv.budget}
                            onChange={(e) => setSubVaults((prev) => prev.map((s, i) => i === idx ? { ...s, budget: e.target.value } : s))}
                            placeholder={t('wizard.subvaults.budget_label')}
                            min="0"
                            className="w-24 rounded-xl px-3 py-2 text-sm focus:outline-none"
                            style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                          />
                          <select
                            value={sv.period}
                            onChange={(e) => setSubVaults((prev) => prev.map((s, i) => i === idx ? { ...s, period: e.target.value as FrequencyKey } : s))}
                            className="rounded-xl px-2 py-2 text-xs focus:outline-none"
                            style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                          >
                            {SIMPLE_FREQS.map((f) => (
                              <option key={f} value={f}>{t(FREQ_I18N[f] as Parameters<typeof t>[0])}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setSubVaults((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-xs px-2 py-1 rounded-lg"
                            style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--blocked)' }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSubVaults((prev) => [...prev, { label: '', budget: '', period: 'weekly' }])}
                        className="text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ color: 'var(--accent)' }}
                      >
                        {t('wizard.subvaults.add_another')}
                      </button>
                    </div>
                  )}
                </div>

                {stepError && (
                  <p className="text-sm" style={{ color: 'var(--blocked)' }}>{stepError}</p>
                )}
              </div>
            )}

            {/* ── Step 2: Recipients + Limits ────────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)]">
                  <div className="space-y-5">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                        {t('wizard.limits.recipients')}
                      </label>
                      <RecipientField
                        recipients={recipients}
                        onAdd={addRecipient}
                        onRemove={removeRecipient}
                        placeholder={placeholder}
                      />
                    </div>
                  </div>

                  <div className="space-y-5 rounded-2xl p-5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                        {t('wizard.limits.max_per_tx')}
                      </label>
                      <input
                        type="number"
                        value={maxPerTx}
                        onChange={(e) => setMaxPerTx(e.target.value)}
                        placeholder="1.0"
                        min="0"
                        step="0.1"
                        className="w-full rounded-xl px-3 py-3 text-sm focus:outline-none"
                        style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      />
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {t('wizard.limits.max_per_tx_helper')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                        {t('wizard.limits.frequency')}
                      </label>
                      <div className="grid gap-2 grid-cols-2 sm:grid-cols-5">
                        {SIMPLE_FREQS.map((period) => (
                          <button
                            key={period}
                            type="button"
                            onClick={() => setFrequency(period)}
                            className="rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
                            style={{
                              background: frequency === period ? 'var(--card-mid)' : 'var(--card)',
                              border: `1px solid ${frequency === period ? 'var(--accent)' : 'var(--border)'}`,
                              color: frequency === period ? 'var(--text)' : 'var(--text-muted)',
                            }}
                          >
                            {t(FREQ_I18N[period] as Parameters<typeof t>[0])}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Per-recipient limits toggle (Track 3) ──────────────────── */}
                <div className="space-y-3">
                  {/* Capa 2 — toggle */}
                  <label className="flex items-center gap-2.5 cursor-pointer w-fit">
                    <div
                      role="switch"
                      aria-checked={recipientLimitsEnabled}
                      onClick={() => setRecipientLimitsEnabled((v) => !v)}
                      className="relative h-5 w-9 rounded-full transition-colors cursor-pointer flex-shrink-0"
                      style={{ background: recipientLimitsEnabled ? 'var(--primary)' : 'var(--border)' }}
                    >
                      <span
                        className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                        style={{ transform: recipientLimitsEnabled ? 'translateX(16px)' : 'translateX(0)' }}
                      />
                    </div>
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {t('wizard.limits.enable_limits_toggle')}
                    </span>
                  </label>

                  {recipientLimitsEnabled && (
                    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      {/* Capa 3 — global mode */}
                      {recipientLimitMode === 'global' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            {t('wizard.limits.global_limit_label')}
                          </span>
                          <select
                            value={globalRecipientPeriod}
                            onChange={(e) => setGlobalRecipientPeriod(e.target.value as FrequencyKey)}
                            className="rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                            style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                          >
                            {SIMPLE_FREQS.map((f) => (
                              <option key={f} value={f}>{t(FREQ_I18N[f] as Parameters<typeof t>[0])}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={globalRecipientAmount}
                            onChange={(e) => setGlobalRecipientAmount(e.target.value)}
                            placeholder="0.0"
                            min="0"
                            step="0.1"
                            className="w-28 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                            style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                          />
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {luksoToken.trim() ? 'token' : 'LYX'}
                          </span>
                        </div>
                      )}

                      {/* Capa 4 — per-recipient mode */}
                      {recipientLimitMode === 'per' && (
                        <div className="space-y-2">
                          {recipients.map((addr) => {
                            const current = perRecipientLimits[addr] ?? { amount: '', period: 'weekly' as FrequencyKey };
                            return (
                              <div key={addr} className="flex flex-wrap items-center gap-2">
                                <span
                                  className="text-xs font-mono flex-1 min-w-0 truncate"
                                  style={{ color: 'var(--text-muted)' }}
                                  title={addr}
                                >
                                  {addr.slice(0, 8)}…{addr.slice(-6)}
                                </span>
                                <input
                                  type="number"
                                  value={current.amount}
                                  onChange={(e) => setPerRecipientLimits((prev) => ({
                                    ...prev,
                                    [addr]: { ...current, amount: e.target.value },
                                  }))}
                                  placeholder={t('wizard.limits.per_recipient_amount')}
                                  min="0"
                                  step="0.1"
                                  className="w-24 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                                  style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                />
                                <select
                                  value={current.period}
                                  onChange={(e) => setPerRecipientLimits((prev) => ({
                                    ...prev,
                                    [addr]: { ...current, period: e.target.value as FrequencyKey },
                                  }))}
                                  className="rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                                  style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                >
                                  {SIMPLE_FREQS.map((f) => (
                                    <option key={f} value={f}>{t(FREQ_I18N[f] as Parameters<typeof t>[0])}</option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Mode switch link */}
                      <button
                        type="button"
                        onClick={() => setRecipientLimitMode((m) => m === 'global' ? 'per' : 'global')}
                        className="text-xs transition-opacity hover:opacity-80"
                        style={{ color: 'var(--accent)' }}
                      >
                        {recipientLimitMode === 'global'
                          ? t('wizard.limits.customize_per_recipient')
                          : t('wizard.limits.global_limit_label') + ' →'}
                      </button>
                    </div>
                  )}
                </div>

                {stepError && (
                  <p className="text-sm" style={{ color: 'var(--blocked)' }}>{stepError}</p>
                )}
              </div>
            )}

            {/* ── Step 3: Automation ─────────────────────────────────────────── */}
            {step === 3 && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
                <div className="space-y-5">

                  <>{/* Toggle */}
                  <label
                    className="flex items-center gap-3 cursor-pointer rounded-2xl px-4 py-4"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  >
                    <div
                      role="switch"
                      aria-checked={agentEnabled}
                      onClick={handleToggleAgent}
                      className="relative h-6 w-11 rounded-full transition-colors cursor-pointer flex-shrink-0"
                      style={{ background: agentEnabled ? 'var(--primary)' : 'var(--border)' }}
                    >
                      <span
                        className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform"
                        style={{ transform: agentEnabled ? 'translateX(20px)' : 'translateX(0)' }}
                      />
                    </div>
                    <div>
                      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                        {t('wizard.automation.toggle')}
                      </span>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {agentEnabled
                          ? t('wizard.automation.toggle_on_hint')
                          : t('wizard.automation.toggle_off_hint')}
                      </p>
                    </div>
                  </label>

                  {agentEnabled ? (
                    <>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                          {t('wizard.automation.executor.title')}
                        </p>
                        {SIMPLE_EXECUTORS.map((option) => {
                          const isSelected = executor === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setExecutor(option)}
                              className="w-full rounded-2xl px-4 py-4 text-left transition-all"
                              style={{
                                background: isSelected ? 'var(--card-mid)' : 'var(--bg)',
                                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                                  {t(`wizard.automation.executor.${option}` as Parameters<typeof t>[0])}
                                </p>
                                {option === 'vaultia' && (
                                  <span
                                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                                    style={{ background: 'rgba(34,255,178,0.15)', color: 'var(--success)' }}
                                  >
                                    {t('wizard.automation.executor.recommended')}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                {option === 'vaultia'
                                  ? t('wizard.automation.executor.vaultia_desc')
                                  : t('wizard.automation.executor.my_agent_desc')}
                              </p>
                              {/* My Agent: inline address form when selected */}
                              {option === 'my_agent' && isSelected && (
                                <div
                                  className="mt-3 space-y-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <label className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                                    {t('wizard.automation.my_agent_address_label')}
                                  </label>
                                  <input
                                    type="text"
                                    value={myAgentAddress}
                                    onChange={(e) => setMyAgentAddress(e.target.value)}
                                    placeholder={t('wizard.automation.my_agent_address_placeholder')}
                                    className="w-full rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                                    style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                  />
                                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    {t('wizard.automation.my_agent_address_hint')}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleContinueToExpert(); }}
                                    className="text-xs transition-opacity hover:opacity-100"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    {t('wizard.automation.my_agent_pro_cta')}
                                  </button>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                          {t('wizard.automation.safety')}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {t('wizard.automation.safe_default_note')}
                        </p>
                        <SafetyLevelChips value={safetyLevel} onChange={setSafetyLevel} />
                      </div>

                      {/* Curated agents note */}
                      <div
                        className="rounded-xl px-4 py-3 text-xs leading-relaxed"
                        style={{
                          background: 'rgba(34,255,178,0.06)',
                          border: '1px solid rgba(34,255,178,0.15)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <span className="font-medium" style={{ color: 'var(--success)' }}>
                          {t('wizard.automation.curated_title')}&nbsp;
                        </span>
                        {t('wizard.automation.curated_desc')}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl px-4 py-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                        {t('wizard.automation.manual_state_title')}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {t('wizard.automation.manual_state_desc')}
                      </p>
                    </div>
                  )}
                  </>

                  {stepError && (
                    <p className="text-sm" style={{ color: 'var(--blocked)' }}>{stepError}</p>
                  )}
                </div>

                {/* Right: mini-review */}
                <div className="rounded-2xl p-5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    {t('wizard.step_label.review')}
                  </p>
                  <div className="mt-4">
                    <WizardReviewSummary
                      goal={goal}
                      recipients={recipients}
                      maxPerTx={maxPerTx}
                      frequency={frequency}
                      agentEnabled={agentEnabled}
                      executor={executor}
                      safetyLevel={safetyLevel}
                      agentAddress={myAgentAddress}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 4: Review & Activate ──────────────────────────────────── */}
            {step === 4 && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
                <div className="space-y-5">
                  {/* Vault name badge */}
                  {wizardVaultName && (
                    <div
                      className="rounded-2xl px-4 py-3 flex items-center gap-3"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                    >
                      <span className="text-lg">✦</span>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                          {t('wizard.vault.name_label')}
                        </p>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                          {wizardVaultName}
                        </p>
                      </div>
                    </div>
                  )}

                  <WizardReviewSummary
                    goal={goal}
                    recipients={recipients}
                    maxPerTx={maxPerTx}
                    frequency={frequency}
                    agentEnabled={agentEnabled}
                    executor={executor}
                    safetyLevel={safetyLevel}
                    agentAddress={myAgentAddress}
                  />

                  {!isConnected && (
                    <div className="space-y-3 rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        {t('wizard.review.connect_prompt')}
                      </p>
                      <ConnectButton.Custom>
                        {({ openConnectModal, mounted }) =>
                          mounted ? (
                            <Button size="sm" onClick={() => handleConnectWallet(openConnectModal)}>
                              {connectLabel}
                            </Button>
                          ) : null
                        }
                      </ConnectButton.Custom>
                    </div>
                  )}

                  {!isRegistryConfigured && isConnected && (
                    <Alert variant="warning">
                      <AlertDescription>{t('wizard.review.registry_not_configured')}</AlertDescription>
                    </Alert>
                  )}

                  {deployError && (
                    <Alert variant="error">
                      <AlertDescription>{deployError}</AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="rounded-2xl p-5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {t('wizard.review.activation_ready')}
                  </p>
                  <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('wizard.automation.connect_later')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div
            className="mt-8 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: 'var(--border)' }}
          >
            <Button
              variant={step === 0 ? 'ghost' : 'secondary'}
              size="sm"
              onClick={handleBack}
              disabled={deploying}
            >
              {step === 0 ? t('wizard.btn.exit') : t('wizard.btn.back')}
            </Button>

            {!isLastStep ? (
              <Button size="sm" onClick={handleNext}>
                {t('wizard.btn.next')}
              </Button>
            ) : (
              <Button size="sm" variant="success" onClick={handleDeploy} disabled={!canDeploy}>
                {deploying ? t('wizard.btn.deploying') : t('wizard.review.cta')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
