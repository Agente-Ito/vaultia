'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Button } from '@/components/common/Button';
import { Alert, AlertDescription } from '@/components/common/Alert';
import { GoalCard } from '@/components/wizard/GoalCard';
import { RecipientField } from '@/components/wizard/RecipientField';
import { AddressDisplay } from '@/components/common/AddressDisplay';
import { VaultDeployResultDialog } from '@/components/vaults/VaultDeployResultDialog';
import { SafetyLevelChips } from '@/components/wizard/SafetyLevelChips';
import { WizardReviewSummary } from '@/components/wizard/WizardReviewSummary';
import { useI18n } from '@/context/I18nContext';
import { getLocalizedErrorMessage, localizeErrorMessage } from '@/lib/errorMap';
import { useOnboarding } from '@/context/OnboardingContext';
import type { FrequencyKey, ExecutorType, GoalKey } from '@/context/OnboardingContext';
import { useWeb3 } from '@/context/Web3Context';
import { WIZARD_FREQUENCY_KEYS } from '@/lib/utils/frequencyLabels';
import { ethers } from 'ethers';
import type { DeployedVaultSummary, VaultDeployPhase, VaultProgressCallback } from '@/lib/web3/deployVault';
import { buildSimpleWizardDeployParams, deployRegistryVault, validateSimpleWizardInput } from '@/lib/web3/deployVault';
import { LuksoIcon } from '@/components/common/LuksoIcon';

// ─── Step indices ─────────────────────────────────────────────────────────────
// 0: Vault name
// 1: Goal
// 2: Who + Limits
// 3: Automation
// 4: Review & Activate

const TOTAL_STEPS = 5;

const SIMPLE_FREQS: FrequencyKey[] = ['daily', 'weekly', 'monthly', 'hourly', 'five-minutes'];

const FREQ_I18N: Record<FrequencyKey, string> = WIZARD_FREQUENCY_KEYS;
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

function FrequencyOptionList({
  value,
  onChange,
  compact = false,
}: {
  value: FrequencyKey;
  onChange: (value: FrequencyKey) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-2">
      {SIMPLE_FREQS.map((period) => {
        const selected = value === period;

        return (
          <button
            key={period}
            type="button"
            onClick={() => onChange(period)}
            className={compact ? 'w-full rounded-xl px-3 py-2.5 text-left text-sm transition-all' : 'w-full rounded-xl px-4 py-3 text-left text-sm transition-all'}
            style={{
              background: selected ? 'var(--card-mid)' : 'var(--card)',
              border: `1px solid ${selected ? 'var(--text)' : 'var(--border)'}`,
              color: selected ? 'var(--text)' : 'var(--text-muted)',
            }}
          >
            <span className="flex items-center gap-3">
              <span
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{
                  background: selected ? 'var(--text)' : 'transparent',
                  border: '1.5px solid var(--text)',
                }}
              />
              <span className="leading-tight">{t(FREQ_I18N[period] as Parameters<typeof t>[0])}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
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
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deployPhases, setDeployPhases] = useState<{ phase: VaultDeployPhase; detail?: string }[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdVault, setCreatedVault] = useState<DeployedVaultSummary | null>(null);
  const [createTxHash, setCreateTxHash] = useState<string | null>(null);
  const [createWarnings, setCreateWarnings] = useState<string[]>([]);
  const myAgentAddress = '';
  const [goalsExpanded, setGoalsExpanded] = useState(false);
  const [customTokenOpen, setCustomTokenOpen] = useState(false);
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

  useEffect(() => {
    if (executor === 'my_agent') {
      setExecutor('vaultia');
    }
  }, [executor, setExecutor]);

  const isLastStep = step === TOTAL_STEPS - 1;
  const canCreate = isConnected && isRegistryConfigured && !creating;

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
    setCreateError(null);

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


    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };

  const handleBack = () => {
    setStepError(null);
    setCreateError(null);
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

  const handleCreateAnother = () => {
    finish();
    setCreateDialogOpen(false);
    setCreateError(null);
    setCreatedVault(null);
    setCreateTxHash(null);
    setCreateWarnings([]);
    setStep(0);
  };

  const handleViewVaults = () => {
    finish();
    router.push('/vaults');
  };

  const handleCreateVault = async () => {
    const validationErrors = validateSimple(true);
    if (validationErrors.length > 0) {
      setCreateError(translateSimpleError(validationErrors[0]));
      return;
    }

    if (!isConnected) {
      setCreateError(t('wizard.review.connect_wallet_required'));
      return;
    }

    if (luksoToken.trim() && !ethers.isAddress(luksoToken.trim())) {
      setCreateError(t('wizard.vault.lukso_token_invalid'));
      return;
    }

    setCreating(true);
    setDeployPhases([]);
    setCreateError(null);
    setCreateWarnings([]);
    const onProgress: VaultProgressCallback = (phase, detail) => {
      setDeployPhases((prev) => [...prev, { phase, detail }]);
    };

    try {
      if (!isRegistryConfigured || !registry || !signer) {
        setCreateError(t('wizard.review.connect_wallet_required'));
        return;
      }
      const owner = await signer.getAddress();
      const existingVaults = await registry.getVaults(owner);
      const existingSafeAddresses = new Set(existingVaults.map((vault) => vault.safe.toLowerCase()));
      const { deployed, receipt, ownershipWarnings } = await deployRegistryVault({
        registry,
        owner,
        existingSafeAddresses,
        onProgress,
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
      if (!deployed) {
        throw new Error(t('deploy_result.error.no_vault_address'));
      }
      setCreatedVault(deployed);
      setCreateTxHash(receipt.hash);
      setCreateWarnings(ownershipWarnings);
      setCreateDialogOpen(true);
    } catch (error: unknown) {
      setCreateError(getErrorMessage(error));
      setCreateDialogOpen(true);
    } finally {
      setCreating(false);
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
            <p
              className="text-xs uppercase tracking-[0.18em]"
              style={{ color: '#10B981', fontWeight: 300 }}
            >
              {t('wizard.title')}
            </p>
            <h1
              style={{ fontSize: '1.6rem', fontWeight: 300, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text)' }}
            >
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
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-xs transition-opacity hover:opacity-80"
              style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}
            >
              {t('wizard.header.home_cta')}
            </button>
            <button
              type="button"
              onClick={handleContinueToExpert}
              className="text-xs transition-opacity hover:opacity-80"
              style={{ color: '#10B981', fontWeight: 300, letterSpacing: '0.06em' }}
            >
              {t('wizard.header.expert_cta')}
            </button>
          </div>
        </div>

        <div className="rounded-3xl p-6 md:p-8" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          {/* 7-dot node matrix progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {Array.from({ length: 7 }).map((_, i) => {
              const dotStep = Math.floor((i / 7) * TOTAL_STEPS);
              const isActive = dotStep < step;
              const isPending = dotStep === step;
              return (
                <span
                  key={i}
                  style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: isActive ? 'var(--text)' : isPending ? '#FFB000' : 'var(--border)',
                    boxShadow: isPending ? '0 0 6px rgba(255,176,0,0.45)' : 'none',
                    transition: 'all 0.3s',
                  }}
                />
              );
            })}
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '0.9rem',
                fontWeight: 500,
                letterSpacing: '0.08em',
                color: 'var(--text)',
                padding: '0.3rem 0.6rem',
                borderRadius: '999px',
                border: '1px solid var(--border)',
                background: 'var(--card-mid)',
              }}
            >
              {step + 1} / {TOTAL_STEPS}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            {STEP_LABEL_KEYS.map((labelKey, idx) => {
              const isActive = idx === step;
              const isDone = idx < step;
              const isNext = idx === step + 1;
              const isClickable = isDone || isNext;

              const handlePillClick = () => {
                if (isDone) {
                  setStepError(null);
                  setCreateError(null);
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
                    background: isActive ? 'rgba(16,185,129,0.06)' : 'transparent',
                    border: `1px solid ${isActive ? '#10B981' : 'var(--border)'}`,
                    color: isDone ? '#10B981' : isActive ? 'var(--text)' : 'var(--text-muted)',
                    fontWeight: isActive ? 400 : 300,
                    letterSpacing: '0.05em',
                    cursor: isClickable ? 'pointer' : 'default',
                    opacity: isNext ? 0.65 : 1,
                  }}
                >
                  <span className="inline-flex items-center gap-2">
                    {isDone ? <span className="h-2 w-2 rounded-full" style={{ background: '#10B981' }} /> : null}
                    <span>{t(labelKey)}</span>
                  </span>
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
                      <div className="flex items-center gap-2 mb-1.5">
                        <LuksoIcon size={14} />
                        <span>{t('wizard.limits.network.up')}</span>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(34,255,178,0.15)', color: 'var(--success)' }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: 'var(--success)' }} />
                        Active
                      </span>
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
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="h-3.5 w-3.5 rounded-full flex-shrink-0" style={{ background: '#3B82F6' }} />
                        <span>{t('wizard.limits.network.base')}</span>
                      </div>
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--card-mid)', color: 'var(--text-muted)' }}>
                        {t('wizard.limits.network.coming_soon')}
                      </span>
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
                            AVT — Test Token (testnet)
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
                      <FrequencyOptionList value={frequency} onChange={setFrequency} />
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
                      style={{ background: recipientLimitsEnabled ? 'var(--accent)' : 'var(--text-subtle)' }}
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
                        <div className="space-y-3">
                          <span className="text-sm block" style={{ color: 'var(--text-muted)' }}>
                            {t('wizard.limits.global_limit_label')}
                          </span>
                          <FrequencyOptionList value={globalRecipientPeriod} onChange={setGlobalRecipientPeriod} compact />
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={globalRecipientAmount}
                              onChange={(e) => setGlobalRecipientAmount(e.target.value)}
                              placeholder="0.0"
                              min="0"
                              step="0.1"
                              className="w-28 rounded-lg px-3 py-2 text-sm focus:outline-none"
                              style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                            />
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {luksoToken.trim() ? 'token' : 'LYX'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Capa 4 — per-recipient mode */}
                      {recipientLimitMode === 'per' && (
                        <div className="space-y-2">
                          {recipients.map((entry) => {
                            const addr = entry.address;
                            const current = perRecipientLimits[addr] ?? { amount: '', period: 'weekly' as FrequencyKey };
                            return (
                              <div key={addr} className="rounded-xl p-3 space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                                <span
                                  className="text-xs font-mono block min-w-0 truncate"
                                  style={{ color: 'var(--text-muted)' }}
                                  title={addr}
                                >
                                  <AddressDisplay address={addr} />
                                </span>
                                <div className="flex items-center gap-2">
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
                                    className="w-28 rounded-lg px-3 py-2 text-sm focus:outline-none"
                                    style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                  />
                                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    {luksoToken.trim() ? 'token' : 'LYX'}
                                  </span>
                                </div>
                                <FrequencyOptionList
                                  value={current.period}
                                  onChange={(value) => setPerRecipientLimits((prev) => ({
                                    ...prev,
                                    [addr]: { ...current, period: value },
                                  }))}
                                  compact
                                />
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
                      style={{ background: agentEnabled ? 'var(--accent)' : 'var(--text-subtle)' }}
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
                              onClick={() => option === 'vaultia' && setExecutor(option)}
                              className="w-full rounded-2xl px-4 py-4 text-left transition-all"
                              style={{
                                background: isSelected ? 'var(--card-mid)' : 'var(--bg)',
                                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                                opacity: option === 'my_agent' ? 0.62 : 1,
                                cursor: option === 'my_agent' ? 'not-allowed' : 'pointer',
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
                                  : t('wizard.automation.executor.my_agent_locked_desc')}
                              </p>
                              {option === 'my_agent' && (
                                <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                    {t('wizard.automation.my_agent_locked_notice')}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleContinueToExpert(); }}
                                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
                                    style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                  >
                                    {t('wizard.automation.my_agent_expert_cta')}
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
                        <span
                          className="h-3 w-3 rounded-full flex-shrink-0"
                          style={{ background: 'var(--accent)' }}
                        />
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

                  {createError && (
                    <Alert variant="error">
                      <AlertDescription>{createError}</AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="rounded-2xl p-5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {t('wizard.review.activation_ready')}
                  </p>
                  <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('wizard.review.tx_notice')}
                  </p>
                  {(creating || deployPhases.length > 0) && (
                    <SimpleDeployProgressStepper phases={deployPhases} t={t} />
                  )}
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
              disabled={creating}
            >
              {step === 0 ? t('wizard.btn.exit') : t('wizard.btn.back')}
            </Button>

            {!isLastStep ? (
              <Button size="sm" onClick={handleNext}>
                {t('wizard.btn.next')}
              </Button>
            ) : (
              <Button size="sm" variant="success" onClick={handleCreateVault} disabled={!canCreate}>
                {creating ? t('wizard.btn.deploying') : t('wizard.review.cta')}
              </Button>
            )}
          </div>

        </div>
      </div>

      <VaultDeployResultDialog
        open={createDialogOpen}
        mode={createdVault ? 'success' : 'error'}
        onOpenChange={setCreateDialogOpen}
        deployed={createdVault}
        ownershipWarnings={createWarnings}
        errorMessage={createError}
        txHash={createTxHash}
        budgetToken={luksoToken}
        signer={signer}
        secondaryLabel={createdVault ? t('create.success.create_another') : t('wizard.review.edit')}
        onSecondaryAction={createdVault ? handleCreateAnother : () => setCreateDialogOpen(false)}
        primaryLabel={createdVault ? t('create.success.view_vaults') : t('deploy_result.close')}
        onPrimaryAction={createdVault ? handleViewVaults : () => setCreateDialogOpen(false)}
      />
    </section>
  );
}

// ─── Deploy progress stepper ──────────────────────────────────────────────────

function SimpleDeployProgressStepper({
  phases,
  t,
}: {
  phases: { phase: VaultDeployPhase; detail?: string }[];
  t: (key: string) => string;
}) {
  const rows: { phase: VaultDeployPhase; done: boolean }[] = [];
  for (let i = 0; i < phases.length; i++) {
    const { phase } = phases[i];
    const isLast = i === phases.length - 1;
    rows.push({ phase, done: !isLast });
  }

  return (
    <div
      className="mt-4 rounded-xl p-4 space-y-2.5"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
        {t('create.progress.title')}
      </p>
      {rows.map(({ phase, done }, idx) => (
        <div key={`${phase}-${idx}`} className="flex items-center gap-3">
          <span className="flex-shrink-0 flex items-center justify-center w-5 h-5">
            {done ? (
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" fill="none" stroke="var(--success)" strokeWidth="1.5" />
                <path d="M6 10l3 3 5-5" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="var(--border)" strokeWidth="2" />
                <path d="M10 2a8 8 0 0 1 8 8" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </span>
          <span className="text-sm" style={{ color: done ? 'var(--text-muted)' : 'var(--text)' }}>
            {t(`create.progress.${phase}`)}
          </span>
        </div>
      ))}
    </div>
  );
}
