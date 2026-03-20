'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/common/Button';
import { Alert, AlertDescription } from '@/components/common/Alert';
import { cn } from '@/lib/utils/cn';
import { useOnboarding, MAX_STEPS } from '@/context/OnboardingContext';
import type { GoalKey, FrequencyKey, ExecutorType } from '@/context/OnboardingContext';
import { useWeb3 } from '@/context/Web3Context';
import { useI18n } from '@/context/I18nContext';
import {
  ENTITY_TYPES,
  getEntityDef,
  getProfile,
  type EntityType,
} from '@/lib/onboarding/entityData';
import {
  buildRegistryDeployParams,
  buildSimpleWizardDeployParams,
  deployRegistryVault,
  PERIOD_MAP,
  parseBudgetToWei,
} from '@/lib/web3/deployVault';
import { GoalCard } from '@/components/wizard/GoalCard';
import { SafetyLevelChips } from '@/components/wizard/SafetyLevelChips';
import { RecipientField } from '@/components/wizard/RecipientField';
import { WizardReviewSummary } from '@/components/wizard/WizardReviewSummary';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const e = error as { reason?: unknown; message?: unknown };
    if (typeof e.reason === 'string' && e.reason) return e.reason;
    if (typeof e.message === 'string' && e.message) return e.message;
  }
  return String(error);
}

const EMOJIS = ['💰', '🏠', '🛒', '📈', '🎯', '✈️', '🏥', '🎓', '🎵', '⚡', '🚀', '🌐', '💎', '🔐', '🤝', '⛓️'];
const SIMPLE_FREQS: FrequencyKey[] = ['daily', 'weekly', 'monthly'];
const SIMPLE_EXECUTORS: ExecutorType[] = ['vaultia', 'me', 'my_agent'];
const SIMPLE_STEP_COUNT = 4;
const SIMPLE_STEP_LABEL_KEYS = [
  'wizard.step_label.goal',
  'wizard.step_label.limits',
  'wizard.step_label.automation',
  'wizard.step_label.review',
] as const;

// ─── Step 0: Entity type ──────────────────────────────────────────────────────

function Step0({ onSelect }: { onSelect: (id: EntityType) => void }) {
  const { t } = useI18n();
  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
          {t('onboarding.step0.title')}
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          {t('onboarding.step0.subtitle')}
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ENTITY_TYPES.map((entity) => (
          <button
            key={entity.id}
            onClick={() => onSelect(entity.id)}
            className="group text-left rounded-xl border-2 border-neutral-200 hover:border-primary-400 hover:bg-primary-50 p-4 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-700 dark:hover:border-primary-500 dark:hover:bg-neutral-800"
          >
            <span className="text-3xl block mb-2">{entity.emoji}</span>
            <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-50 leading-tight">
              {t(entity.titleKey as Parameters<typeof t>[0])}
            </p>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed line-clamp-2">
              {t(entity.descKey as Parameters<typeof t>[0])}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step 1: Profile within entity ───────────────────────────────────────────

function Step1({ onSelect }: { onSelect: (id: string) => void }) {
  const { entityType } = useOnboarding();
  const { t } = useI18n();
  const entity = entityType ? getEntityDef(entityType) : null;

  if (!entity) return null;

  return (
    <div className="p-6 space-y-5">
      <div>
        <p className="text-xs font-semibold text-primary-500 uppercase tracking-widest mb-1">
          {entity.emoji} {t(entity.titleKey as Parameters<typeof t>[0])}
        </p>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
          {t('onboarding.step1.title')}
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          {t('onboarding.step1.subtitle')}
        </p>
      </div>
      <div className="space-y-3">
        {entity.profiles.map((profile) => (
          <button
            key={profile.id}
            onClick={() => onSelect(profile.id)}
            className="group w-full text-left rounded-xl border-2 border-neutral-200 hover:border-primary-400 hover:bg-primary-50 p-4 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-700 dark:hover:border-primary-500 dark:hover:bg-neutral-800"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">{profile.emoji}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                  {t(profile.titleKey as Parameters<typeof t>[0])}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                  {t(profile.descKey as Parameters<typeof t>[0])}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {profile.subVaults.slice(0, 3).map((sv) => (
                    <span
                      key={sv.id}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
                    >
                      {sv.emoji} {t(sv.titleKey as Parameters<typeof t>[0])}
                    </span>
                  ))}
                  {profile.subVaults.length > 3 && (
                    <span className="text-xs text-neutral-400">
                      +{profile.subVaults.length - 3} {t('onboarding.more')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step 2: Vault name + emoji + sub-vault selection ─────────────────────────

function Step2() {
  const {
    entityType, entityProfile,
    vaultName, vaultEmoji, selectedSubVaults,
    setVaultName, setVaultEmoji, toggleSubVault,
  } = useOnboarding();
  const { t } = useI18n();

  const profile = entityType && entityProfile
    ? getProfile(entityType, entityProfile)
    : null;

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
          {t('onboarding.step2.title')}
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          {t('onboarding.step2.subtitle')}
        </p>
      </div>

      {/* Name */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-widest">
          {t('onboarding.step2.name_label')}
        </label>
        <input
          type="text"
          value={vaultName}
          onChange={(e) => setVaultName(e.target.value)}
          placeholder={profile ? t(profile.vaultKey as Parameters<typeof t>[0]) : t('onboarding.step2.name_placeholder')}
          className="w-full h-10 rounded-lg border border-neutral-300 px-3 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
        />
      </div>

      {/* Emoji */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-widest">
          {t('onboarding.step2.icon_label')}
        </label>
        <div className="flex flex-wrap gap-2">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setVaultEmoji(e)}
              className={cn(
                'w-9 h-9 rounded-lg border-2 text-lg flex items-center justify-center transition-all',
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

      {/* Sub-vault selection */}
      {profile && profile.subVaults.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-widest">
            {t('onboarding.step2.subvaults_label')}
          </label>
          <p className="text-xs text-neutral-400">
            {t('onboarding.step2.subvaults_hint')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {profile.subVaults.map((sv) => {
              const checked = selectedSubVaults.includes(sv.id);
              return (
                <button
                  key={sv.id}
                  onClick={() => toggleSubVault(sv.id)}
                  className={cn(
                    'flex items-center gap-2 p-2.5 rounded-lg border-2 text-left transition-all',
                    checked
                      ? 'border-primary-400 bg-primary-50 dark:bg-neutral-700'
                      : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-700'
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors',
                    checked ? 'border-primary-500 bg-primary-500' : 'border-neutral-300 dark:border-neutral-500'
                  )}>
                    {checked && <span className="text-white text-xs leading-none">✓</span>}
                  </div>
                  <span className="text-sm">{sv.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-neutral-800 dark:text-neutral-100 leading-tight">
                      {t(sv.titleKey as Parameters<typeof t>[0])}
                    </p>
                    <p className="text-xs text-neutral-400 truncate">
                      {t(sv.descKey as Parameters<typeof t>[0])}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Budget ───────────────────────────────────────────────────────────

const PERIOD_VALUES = ['daily', 'weekly', 'monthly'] as const;

function Step3() {
  const { rootBudget, budgetPeriod, setRootBudget, setBudgetPeriod } = useOnboarding();
  const { t } = useI18n();
  return (
    <div className="p-6 space-y-5">
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
          <label className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-widest block mb-1">
            {t('onboarding.step3.amount_label')}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm font-medium">LYX</span>
            <input
              type="number"
              value={rootBudget}
              onChange={(e) => setRootBudget(e.target.value)}
              min="0"
              step="0.1"
              className="w-full h-10 rounded-lg border border-neutral-300 pl-12 pr-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-widest block mb-2">
            {t('onboarding.step3.period_label')}
          </label>
          <div className="flex gap-2">
            {PERIOD_VALUES.map((v) => (
              <button
                key={v}
                onClick={() => setBudgetPeriod(v)}
                className={cn(
                  'flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all',
                  budgetPeriod === v
                    ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-neutral-700 dark:text-primary-300'
                    : 'border-neutral-200 text-neutral-600 hover:border-primary-300 dark:border-neutral-700 dark:text-neutral-400'
                )}
              >
                {t(`onboarding.step3.period.${v}` as Parameters<typeof t>[0])}
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
  const {
    entityType, entityProfile,
    vaultName, vaultEmoji, rootBudget, budgetPeriod, selectedSubVaults,
  } = useOnboarding();
  const { isConnected, isRegistryConfigured } = useWeb3();
  const { t } = useI18n();

  const entity  = entityType ? getEntityDef(entityType) : null;
  const profile = entityType && entityProfile ? getProfile(entityType, entityProfile) : null;
  const subVaultDetails = profile?.subVaults.filter((sv) => selectedSubVaults.includes(sv.id)) ?? [];
  const displayName = vaultName || (profile ? t(profile.vaultKey as Parameters<typeof t>[0]) : t('onboarding.step4.no_name'));

  return (
    <div className="p-6 space-y-5">
      <div className="text-center space-y-1">
        <div className="text-5xl">{vaultEmoji}</div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
          {t('onboarding.step4.title')}
        </h2>
        <p className="text-sm text-neutral-500">
          {t('onboarding.step4.subtitle')}
        </p>
      </div>

      <div className="rounded-xl bg-neutral-50 dark:bg-neutral-700/50 divide-y divide-neutral-100 dark:divide-neutral-700 text-sm overflow-hidden border border-neutral-200 dark:border-neutral-600">
        {entity && (
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-neutral-500">{t('onboarding.step4.entity')}</span>
            <span className="font-medium text-neutral-900 dark:text-neutral-50">
              {entity.emoji} {t(entity.titleKey as Parameters<typeof t>[0])}
            </span>
          </div>
        )}
        {profile && (
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-neutral-500">{t('onboarding.step4.profile')}</span>
            <span className="font-medium text-neutral-900 dark:text-neutral-50">
              {profile.emoji} {t(profile.titleKey as Parameters<typeof t>[0])}
            </span>
          </div>
        )}
        <div className="flex justify-between px-4 py-2.5">
          <span className="text-neutral-500">{t('onboarding.step4.vault')}</span>
          <span className="font-medium text-neutral-900 dark:text-neutral-50">{vaultEmoji} {displayName}</span>
        </div>
        <div className="flex justify-between px-4 py-2.5">
          <span className="text-neutral-500">{t('onboarding.step4.budget')}</span>
          <span className="font-medium text-neutral-900 dark:text-neutral-50">
            {rootBudget} LYX / {t(`onboarding.step3.period.${budgetPeriod}` as Parameters<typeof t>[0])}
          </span>
        </div>
        {subVaultDetails.length > 0 && (
          <div className="px-4 py-2.5">
            <p className="text-neutral-500 mb-1.5">{t('onboarding.step4.subvaults')}</p>
            <div className="flex flex-wrap gap-1.5">
              {subVaultDetails.map((sv) => (
                <span
                  key={sv.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-50 text-primary-700 border border-primary-200 dark:bg-neutral-700 dark:text-primary-300 dark:border-neutral-600"
                >
                  {sv.emoji} {t(sv.titleKey as Parameters<typeof t>[0])}
                </span>
              ))}
            </div>
            <p className="text-xs text-neutral-400 mt-1.5">
              {t('onboarding.step4.subvaults_hint')}
            </p>
          </div>
        )}
      </div>

      {!isRegistryConfigured && (
        <Alert variant="warning">
          <AlertDescription>{t('onboarding.registry_not_configured')}</AlertDescription>
        </Alert>
      )}
      {isRegistryConfigured && !isConnected && (
        <Alert variant="warning">
          <AlertDescription>{t('onboarding.connect_wallet')}</AlertDescription>
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

// ─── Simple wizard — Step 0: Goal ────────────────────────────────────────────

const GOAL_KEYS: GoalKey[] = ['pay_people', 'pay_vendors', 'subscriptions', 'save_funds'];

function SimpleStep0() {
  const { goal, setGoal } = useOnboarding();
  const { t } = useI18n();
  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
          {t('wizard.goal.title')}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {t('wizard.goal.subtitle')}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {GOAL_KEYS.map((g) => (
          <GoalCard key={g} goalKey={g} selected={goal === g} onSelect={() => setGoal(g)} />
        ))}
      </div>
    </div>
  );
}

// ─── Simple wizard — Step 1: Limits ──────────────────────────────────────────

function SimpleStep1() {
  const { recipients, addRecipient, removeRecipient, maxPerTx, setMaxPerTx, frequency, setFrequency } = useOnboarding();
  const { t } = useI18n();
  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
          {t('wizard.limits.title')}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {t('wizard.limits.subtitle')}
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {t('wizard.limits.recipients')}
        </label>
        <RecipientField
          recipients={recipients}
          onAdd={addRecipient}
          onRemove={removeRecipient}
        />
      </div>

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
          className="w-full h-10 rounded-lg px-3 text-sm focus:outline-none"
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
        <div className="flex gap-2">
          {SIMPLE_FREQS.map((f) => (
            <button
              key={f}
              onClick={() => setFrequency(f)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: frequency === f ? 'var(--card-mid)' : 'var(--card)',
                border: frequency === f ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: frequency === f ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {t(`wizard.limits.freq.${f}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Simple wizard — Step 2: Automation ──────────────────────────────────────

function SimpleStep2() {
  const { agentEnabled, setAgentEnabled, executor, setExecutor, safetyLevel, setSafetyLevel } = useOnboarding();
  const { isConnected } = useWeb3();
  const { t } = useI18n();

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
          {t('wizard.automation.title')}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {t('wizard.automation.subtitle')}
        </p>
      </div>

      {/* Agent enable toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <div
          role="switch"
          aria-checked={agentEnabled}
          onClick={() => setAgentEnabled(!agentEnabled)}
          className="relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0"
          style={{ background: agentEnabled ? 'var(--primary)' : 'var(--border)' }}
        >
          <span
            className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform"
            style={{ transform: agentEnabled ? 'translateX(20px)' : 'translateX(0)' }}
          />
        </div>
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          {t('wizard.automation.toggle')}
        </span>
      </label>

      {agentEnabled && (
        <>
          {/* Executor selector */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              {t('wizard.automation.executor.title')}
            </p>
            {SIMPLE_EXECUTORS.map((exec) => (
              <button
                key={exec}
                onClick={() => setExecutor(exec)}
                className="w-full flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-all"
                style={{
                  background: executor === exec ? 'var(--card-mid)' : 'var(--card)',
                  border: executor === exec ? '1px solid var(--accent)' : '1px solid var(--border)',
                }}
              >
                <span
                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0"
                  style={{ borderColor: executor === exec ? 'var(--accent)' : 'var(--border)' }}
                >
                  {executor === exec && (
                    <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {t(`wizard.automation.executor.${exec}` as Parameters<typeof t>[0])}
                  </p>
                  {exec === 'vaultia' && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {t('wizard.automation.executor.vaultia_desc')}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Safety level */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              {t('wizard.automation.safety')}
            </p>
            <SafetyLevelChips value={safetyLevel} onChange={setSafetyLevel} />
          </div>
        </>
      )}

      {!isConnected && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('wizard.automation.connect_later')}
        </p>
      )}
    </div>
  );
}

// ─── Simple wizard — Step 3: Review + Deploy ──────────────────────────────────

function SimpleStep3({ deploying, deployError }: { deploying: boolean; deployError: string | null }) {
  const { goal, recipients, maxPerTx, frequency, agentEnabled, executor, safetyLevel } = useOnboarding();
  const { isConnected, isRegistryConfigured } = useWeb3();
  const { t } = useI18n();

  return (
    <div className="p-6 space-y-5">
      <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
        {t('wizard.review.title')}
      </h2>

      <WizardReviewSummary
        goal={goal}
        recipients={recipients}
        maxPerTx={maxPerTx}
        frequency={frequency}
        agentEnabled={agentEnabled}
        executor={executor}
        safetyLevel={safetyLevel}
      />

      {!isConnected && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('wizard.review.connect_prompt')}
          </p>
          <ConnectButton />
        </div>
      )}

      {!isRegistryConfigured && isConnected && (
        <Alert variant="warning">
          <AlertDescription>{t('onboarding.registry_not_configured')}</AlertDescription>
        </Alert>
      )}

      {deployError && (
        <Alert variant="error">
          <AlertDescription>{deployError}</AlertDescription>
        </Alert>
      )}

      {deploying && (
        <p className="text-sm text-center animate-pulse" style={{ color: 'var(--text-muted)' }}>
          {t('onboarding.step4.deploying')}
        </p>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function OnboardingModal() {
  const router = useRouter();
  const {
    step, visible, dismissed,
    entityType, entityProfile,
    vaultName, rootBudget, budgetPeriod,
    wizardMode,
    goal, recipients, maxPerTx, frequency, agentEnabled, executor, safetyLevel,
    close, next, back, finish, dismissPermanently,
    setEntityType, setEntityProfile,
  } = useOnboarding();

  const { registry, signer, isConnected, isRegistryConfigured } = useWeb3();
  const { t } = useI18n();

  // Simple wizard uses its own local step counter (0-3)
  const [simpleStep, setSimpleStep] = useState(0);

  const [neverShow, setNeverShow]     = React.useState(false);
  const [deploying, setDeploying]     = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const isSimple = wizardMode === 'simple';

  // ── Shared close handler ────────────────────────────────────────────────────
  const handleClose = () => {
    if (neverShow) dismissPermanently();
    else close();
  };

  // ── Expert mode handlers ────────────────────────────────────────────────────
  const handleEntitySelect = (id: EntityType) => { setEntityType(id); next(); };
  const handleProfileSelect = (id: string) => { if (!entityType) return; setEntityProfile(id); next(); };

  const handleExpertDeploy = async () => {
    if (!isRegistryConfigured || !registry || !signer) {
      setDeployError(t('onboarding.connect_wallet'));
      return;
    }
    setDeploying(true);
    setDeployError(null);
    try {
      const profile   = entityType && entityProfile ? getProfile(entityType, entityProfile) : null;
      const displayName = vaultName || (profile ? t(profile.vaultKey as Parameters<typeof t>[0]) : 'My Vault');
      await deployRegistryVault({
        registry,
        params: buildRegistryDeployParams({
          budget: parseBudgetToWei(rootBudget, '0'),
          period: PERIOD_MAP[budgetPeriod],
          label: displayName,
        }),
      });
      finish();
      router.push('/vaults');
    } catch (err: unknown) {
      setDeployError(getErrorMessage(err));
    } finally {
      setDeploying(false);
    }
  };

  // ── Simple mode deploy ──────────────────────────────────────────────────────
  const handleSimpleDeploy = async () => {
    if (!isRegistryConfigured || !registry || !signer) {
      setDeployError(t('onboarding.connect_wallet'));
      return;
    }
    setDeploying(true);
    setDeployError(null);
    try {
      await deployRegistryVault({
        registry,
        params: buildSimpleWizardDeployParams({
          goal,
          recipients,
          maxPerTx,
          frequency,
          agentEnabled,
          executor,
          safetyLevel,
        }),
      });
      finish();
      router.push('/dashboard');
    } catch (err: unknown) {
      setDeployError(getErrorMessage(err));
    } finally {
      setDeploying(false);
    }
  };

  if (dismissed && !visible) return null;

  // ══════════════════════════════════════════════════════════════════════════
  // SIMPLE WIZARD RENDER
  // ══════════════════════════════════════════════════════════════════════════
  if (isSimple) {
    const progressValue   = ((simpleStep + 1) / SIMPLE_STEP_COUNT) * 100;
    const isLastSimple    = simpleStep === SIMPLE_STEP_COUNT - 1;
    const canActivate     = isConnected && isRegistryConfigured && !deploying;

    return (
      <Dialog open={visible} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent
          className="max-w-lg w-full p-0 overflow-hidden"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-0">
            <DialogTitle className="text-lg font-bold" style={{ color: 'var(--text)' }}>
              {t('wizard.title')}
            </DialogTitle>
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              {simpleStep + 1} / {SIMPLE_STEP_COUNT}
            </span>
          </div>

          {/* Progress + step labels */}
          <div className="px-6 pt-3">
            <Progress value={progressValue} className="h-1" />
            <div className="flex gap-2 mt-2">
              {SIMPLE_STEP_LABEL_KEYS.map((key, i) => (
                <span
                  key={key}
                  className="text-xs flex-1 text-center transition-colors font-medium"
                  style={{
                    color:
                      i < simpleStep  ? 'var(--success)' :
                      i === simpleStep ? 'var(--accent)'  :
                                         'var(--text-muted)',
                  }}
                >
                  {t(key)}
                </span>
              ))}
            </div>
          </div>

          {/* Step content */}
          <div className="min-h-[340px] overflow-y-auto max-h-[62vh]">
            {simpleStep === 0 && <SimpleStep0 />}
            {simpleStep === 1 && <SimpleStep1 />}
            {simpleStep === 2 && <SimpleStep2 />}
            {simpleStep === 3 && <SimpleStep3 deploying={deploying} deployError={deployError} />}
          </div>

          {/* Footer */}
          <div
            className="px-6 pb-5 pt-4 flex items-center justify-between gap-3"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            {simpleStep === 0 ? (
              <Button variant="ghost" size="sm" onClick={handleClose}>
                {t('onboarding.btn.skip')}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setDeployError(null); setSimpleStep((s) => Math.max(0, s - 1)); }}
                disabled={deploying}
              >
                {t('onboarding.btn.back')}
              </Button>
            )}

            {!isLastSimple ? (
              <Button size="sm" onClick={() => setSimpleStep((s) => s + 1)}>
                {t('onboarding.btn.next')}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="success"
                onClick={handleSimpleDeploy}
                disabled={!canActivate}
              >
                {deploying ? t('onboarding.btn.deploying') : t('wizard.review.cta')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPERT WIZARD RENDER (original 5-step flow)
  // ══════════════════════════════════════════════════════════════════════════
  const STEP_LABEL_KEYS = [
    'onboarding.step_labels.0',
    'onboarding.step_labels.1',
    'onboarding.step_labels.2',
    'onboarding.step_labels.3',
    'onboarding.step_labels.4',
  ] as const;

  const progressValue  = ((step + 1) / MAX_STEPS) * 100;
  const isLastStep     = step === MAX_STEPS - 1;
  const showNextButton = step >= 2 && !isLastStep;
  const showFooter     = step > 0;
  const canDeploy      = isConnected && isRegistryConfigured && !deploying;

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <DialogTitle className="text-lg font-bold text-neutral-900 dark:text-neutral-50">
            {t('onboarding.title')}
          </DialogTitle>
          <span className="text-xs text-neutral-400 font-medium">
            {step + 1} / {MAX_STEPS}
          </span>
        </div>

        {/* Progress */}
        <div className="px-6 pt-3">
          <Progress value={progressValue} className="h-1.5" />
          <div className="flex gap-2 mt-2">
            {STEP_LABEL_KEYS.map((key, i) => (
              <span
                key={key}
                className={cn(
                  'text-xs flex-1 text-center transition-colors',
                  i < step   ? 'text-primary-500 font-medium'  :
                  i === step  ? 'text-primary-600 font-semibold' :
                                'text-neutral-400'
                )}
              >
                {t(key)}
              </span>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="min-h-[320px] overflow-y-auto max-h-[60vh]">
          {step === 0 && <Step0 onSelect={handleEntitySelect} />}
          {step === 1 && <Step1 onSelect={handleProfileSelect} />}
          {step === 2 && <Step2 />}
          {step === 3 && <Step3 />}
          {step === 4 && <Step4 deploying={deploying} deployError={deployError} />}
        </div>

        {/* Footer */}
        {showFooter && (
          <div className="px-6 pb-5 space-y-3 border-t border-neutral-100 dark:border-neutral-700 pt-3">
            {step >= 2 && (
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
                {showNextButton && (
                  <Button size="sm" onClick={next}>
                    {t('onboarding.btn.next')}
                  </Button>
                )}
                {isLastStep && (
                  <Button size="sm" variant="success" onClick={handleExpertDeploy} disabled={!canDeploy}>
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

