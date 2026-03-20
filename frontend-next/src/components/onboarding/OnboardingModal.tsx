'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/common/Button';
import { Alert, AlertDescription } from '@/components/common/Alert';
import { useOnboarding, MAX_STEPS } from '@/context/OnboardingContext';
import type { GoalKey, FrequencyKey, ExecutorType, RecipientNetwork } from '@/context/OnboardingContext';
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
  validateSimpleWizardInput,
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
const SIMPLE_EXECUTORS: ExecutorType[] = ['vaultia', 'my_agent'];
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
        <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
          {t('onboarding.step0.title')}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {t('onboarding.step0.subtitle')}
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ENTITY_TYPES.map((entity) => (
          <button
            key={entity.id}
            onClick={() => onSelect(entity.id)}
            className="text-left rounded-xl p-4 transition-all duration-150 focus:outline-none"
            style={{ background: 'var(--card-mid)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
          >
            <span className="text-3xl block mb-2">{entity.emoji}</span>
            <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--text)' }}>
              {t(entity.titleKey as Parameters<typeof t>[0])}
            </p>
            <p className="text-xs mt-1 leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>
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
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--accent)' }}>
          {entity.emoji} {t(entity.titleKey as Parameters<typeof t>[0])}
        </p>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
          {t('onboarding.step1.title')}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {t('onboarding.step1.subtitle')}
        </p>
      </div>
      <div className="space-y-3">
        {entity.profiles.map((profile) => (
          <button
            key={profile.id}
            onClick={() => onSelect(profile.id)}
            className="w-full text-left rounded-xl p-4 transition-all duration-150 focus:outline-none"
            style={{ background: 'var(--card-mid)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">{profile.emoji}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {t(profile.titleKey as Parameters<typeof t>[0])}
                </p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {t(profile.descKey as Parameters<typeof t>[0])}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {profile.subVaults.slice(0, 3).map((sv) => (
                    <span
                      key={sv.id}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs"
                      style={{ background: 'var(--card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                    >
                      {sv.emoji} {t(sv.titleKey as Parameters<typeof t>[0])}
                    </span>
                  ))}
                  {profile.subVaults.length > 3 && (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
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
        <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
          {t('onboarding.step2.title')}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {t('onboarding.step2.subtitle')}
        </p>
      </div>

      {/* Name */}
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {t('onboarding.step2.name_label')}
        </label>
        <input
          type="text"
          value={vaultName}
          onChange={(e) => setVaultName(e.target.value)}
          placeholder={profile ? t(profile.vaultKey as Parameters<typeof t>[0]) : t('onboarding.step2.name_placeholder')}
          className="w-full h-10 rounded-lg px-3 text-sm focus:outline-none"
          style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
      </div>

      {/* Emoji */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {t('onboarding.step2.icon_label')}
        </label>
        <div className="flex flex-wrap gap-2">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setVaultEmoji(e)}
              className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all"
              style={{
                background: vaultEmoji === e ? 'var(--card-mid)' : 'transparent',
                border: `2px solid ${vaultEmoji === e ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-vault selection */}
      {profile && profile.subVaults.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {t('onboarding.step2.subvaults_label')}
          </label>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('onboarding.step2.subvaults_hint')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {profile.subVaults.map((sv) => {
              const checked = selectedSubVaults.includes(sv.id);
              return (
                <button
                  key={sv.id}
                  onClick={() => toggleSubVault(sv.id)}
                  className="flex items-center gap-2 p-2.5 rounded-lg text-left transition-all"
                  style={{
                    background: checked ? 'var(--card-mid)' : 'var(--card)',
                    border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                    style={{
                      background: checked ? 'var(--accent)' : 'transparent',
                      border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {checked && <span className="text-xs leading-none" style={{ color: '#000' }}>✓</span>}
                  </div>
                  <span className="text-sm">{sv.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-tight" style={{ color: 'var(--text)' }}>
                      {t(sv.titleKey as Parameters<typeof t>[0])}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
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
        <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
          {t('onboarding.step3.title')}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {t('onboarding.step3.subtitle')}
        </p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-widest block mb-1" style={{ color: 'var(--text-muted)' }}>
            {t('onboarding.step3.amount_label')}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>LYX</span>
            <input
              type="number"
              value={rootBudget}
              onChange={(e) => setRootBudget(e.target.value)}
              min="0"
              step="0.1"
              className="w-full h-10 rounded-lg pl-12 pr-3 text-sm focus:outline-none"
              style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: 'var(--text-muted)' }}>
            {t('onboarding.step3.period_label')}
          </label>
          <div className="flex gap-2">
            {PERIOD_VALUES.map((v) => (
              <button
                key={v}
                onClick={() => setBudgetPeriod(v)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: budgetPeriod === v ? 'var(--card-mid)' : 'transparent',
                  border: `2px solid ${budgetPeriod === v ? 'var(--accent)' : 'var(--border)'}`,
                  color: budgetPeriod === v ? 'var(--text)' : 'var(--text-muted)',
                }}
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
        <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
          {t('onboarding.step4.title')}
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('onboarding.step4.subtitle')}
        </p>
      </div>

      <div
        className="rounded-xl text-sm overflow-hidden"
        style={{ background: 'var(--card-mid)', border: '1px solid var(--border)' }}
      >
        {entity && (
          <div className="flex justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('onboarding.step4.entity')}</span>
            <span className="font-medium" style={{ color: 'var(--text)' }}>
              {entity.emoji} {t(entity.titleKey as Parameters<typeof t>[0])}
            </span>
          </div>
        )}
        {profile && (
          <div className="flex justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('onboarding.step4.profile')}</span>
            <span className="font-medium" style={{ color: 'var(--text)' }}>
              {profile.emoji} {t(profile.titleKey as Parameters<typeof t>[0])}
            </span>
          </div>
        )}
        <div className="flex justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-muted)' }}>{t('onboarding.step4.vault')}</span>
          <span className="font-medium" style={{ color: 'var(--text)' }}>{vaultEmoji} {displayName}</span>
        </div>
        <div className="flex justify-between px-4 py-2.5" style={{ borderBottom: subVaultDetails.length > 0 ? '1px solid var(--border)' : 'none' }}>
          <span style={{ color: 'var(--text-muted)' }}>{t('onboarding.step4.budget')}</span>
          <span className="font-medium" style={{ color: 'var(--text)' }}>
            {rootBudget} LYX / {t(`onboarding.step3.period.${budgetPeriod}` as Parameters<typeof t>[0])}
          </span>
        </div>
        {subVaultDetails.length > 0 && (
          <div className="px-4 py-2.5">
            <p className="mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('onboarding.step4.subvaults')}</p>
            <div className="flex flex-wrap gap-1.5">
              {subVaultDetails.map((sv) => (
                <span
                  key={sv.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style={{ background: 'rgba(123,97,255,0.15)', color: 'var(--primary)', border: '1px solid rgba(123,97,255,0.25)' }}
                >
                  {sv.emoji} {t(sv.titleKey as Parameters<typeof t>[0])}
                </span>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
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
        <p className="text-sm text-center animate-pulse" style={{ color: 'var(--text-muted)' }}>
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

const RECIPIENT_NETWORKS: Array<{ key: RecipientNetwork; labelKey: string }> = [
  { key: 'up', labelKey: 'wizard.limits.network.up' },
  { key: 'base', labelKey: 'wizard.limits.network.base' },
];

function SimpleStep1({ stepError }: { stepError: string | null }) {
  const {
    recipientNetwork,
    setRecipientNetwork,
    recipients,
    addRecipient,
    removeRecipient,
    maxPerTx,
    setMaxPerTx,
    frequency,
    setFrequency,
  } = useOnboarding();
  const { t } = useI18n();

  const placeholder = recipientNetwork === 'base'
    ? t('wizard.limits.recipients_placeholder_base')
    : t('wizard.limits.recipients_placeholder_up');

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
          {t('wizard.limits.network.label')}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {RECIPIENT_NETWORKS.map((network) => {
            const active = recipientNetwork === network.key;
            return (
              <button
                key={network.key}
                type="button"
                onClick={() => setRecipientNetwork(network.key)}
                className="rounded-xl px-3 py-3 text-left text-sm font-medium transition-all"
                style={{
                  background: active ? 'var(--card-mid)' : 'var(--card)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  color: active ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                {t(network.labelKey as Parameters<typeof t>[0])}
              </button>
            );
          })}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t(`wizard.limits.network.${recipientNetwork}_hint` as Parameters<typeof t>[0])}
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
          placeholder={placeholder}
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

      {stepError && (
        <p className="text-sm" style={{ color: 'var(--blocked)' }}>
          {stepError}
        </p>
      )}
    </div>
  );
}

// ─── Simple wizard — Step 2: Automation ──────────────────────────────────────

function SimpleStep2() {
  const { agentEnabled, setAgentEnabled, executor, setExecutor, safetyLevel, setSafetyLevel } = useOnboarding();
  const { t } = useI18n();

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
          onClick={handleToggleAgent}
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
                  {exec === 'my_agent' && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {t('wizard.automation.executor.my_agent_desc')}
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
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {t('wizard.automation.safe_default_note')}
            </p>
            <SafetyLevelChips value={safetyLevel} onChange={setSafetyLevel} />
          </div>
        </>
      )}

      {!agentEnabled && (
        <div className="rounded-xl px-4 py-3" style={{ background: 'var(--card-mid)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {t('wizard.automation.manual_state_title')}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {t('wizard.automation.manual_state_desc')}
          </p>
        </div>
      )}

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {t('wizard.automation.connect_later')}
      </p>
    </div>
  );
}

// ─── Simple wizard — Step 3: Review + Deploy ──────────────────────────────────

function SimpleStep3({
  deploying,
  deployError,
  onConnectWallet,
}: {
  deploying: boolean;
  deployError: string | null;
  onConnectWallet: (openConnectModal: () => void) => void;
}) {
  const { goal, recipientNetwork, recipients, maxPerTx, frequency, agentEnabled, executor, safetyLevel } = useOnboarding();
  const { isConnected, isRegistryConfigured, hasUPExtension } = useWeb3();
  const { t } = useI18n();

  const connectLabel = recipientNetwork === 'base'
    ? t('wizard.review.connect_base')
    : hasUPExtension
      ? t('wizard.review.connect_up')
      : t('wizard.review.connect_up_fallback');

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
          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) =>
              mounted ? (
                <Button
                  size="sm"
                  onClick={() => {
                    onConnectWallet(openConnectModal);
                  }}
                >
                  {connectLabel}
                </Button>
              ) : null
            }
          </ConnectButton.Custom>
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
    goal, recipientNetwork, recipients, maxPerTx, frequency, agentEnabled, executor, safetyLevel,
    close, next, back, finish, dismissPermanently,
    setEntityType, setEntityProfile,
  } = useOnboarding();

  const { registry, signer, isConnected, isRegistryConfigured, connect, hasUPExtension } = useWeb3();
  const { t } = useI18n();

  // Simple wizard uses its own local step counter (0-3)
  const [simpleStep, setSimpleStep] = useState(0);
  const [simpleError, setSimpleError] = useState<string | null>(null);

  const [neverShow, setNeverShow]     = React.useState(false);
  const [deploying, setDeploying]     = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const isSimple = wizardMode === 'simple';

  useEffect(() => {
    if (!visible || !isSimple) return;
    setSimpleStep(goal ? 1 : 0);
    setSimpleError(null);
    setDeployError(null);
  }, [visible, isSimple, goal]);

  useEffect(() => {
    if (!visible || wizardMode !== 'expert') return;
    close();
    router.push('/vaults/create');
  }, [visible, wizardMode, close, router]);

  // ── Shared close handler ────────────────────────────────────────────────────
  const handleClose = () => {
    if (neverShow) dismissPermanently();
    else close();
  };

  const translateSimpleError = (errorCode: string) => {
    const translations: Record<string, Parameters<typeof t>[0]> = {
      missing_goal: 'wizard.goal.missing',
      invalid_amount: 'wizard.limits.error.invalid_amount',
      invalid_address: 'wizard.limits.error.invalid_address',
      duplicate_address: 'wizard.limits.error.duplicate_address',
      missing_recipients: 'wizard.limits.error.missing_recipients',
      manual_executor_invalid: 'wizard.automation.error.manual_hidden',
      my_agent_requires_expert: 'wizard.automation.error.my_agent_requires_expert',
      base_requires_expert: 'wizard.automation.error.base_requires_expert',
    };

    const key = translations[errorCode];
    return key ? t(key) : errorCode;
  };

  const validateSimple = (strictExecutorSetup = false) => {
    const errors = validateSimpleWizardInput(
      { goal, recipients, maxPerTx, frequency, agentEnabled, executor, safetyLevel },
      { strictExecutorSetup }
    );
    return errors;
  };

  const handleConnectWallet = async (openConnectModal: () => void) => {
    close();
    if (recipientNetwork === 'up' && hasUPExtension) {
      await connect();
      return;
    }

    window.setTimeout(() => {
      openConnectModal();
    }, 80);
  };

  const handleSimpleNext = () => {
    setSimpleError(null);

    if (simpleStep === 0 && !goal) {
      setSimpleError(translateSimpleError('missing_goal'));
      return;
    }

    if (simpleStep === 1) {
      const relevantErrors = validateSimple(false).filter((error) =>
        ['invalid_amount', 'invalid_address', 'duplicate_address', 'missing_recipients'].includes(error)
      );
      if (relevantErrors.length > 0) {
        setSimpleError(translateSimpleError(relevantErrors[0]));
        return;
      }
    }

    if (simpleStep === 2 && agentEnabled && executor === 'me') {
      setSimpleError(translateSimpleError('manual_executor_invalid'));
      return;
    }

    if (simpleStep === 2 && agentEnabled && executor === 'my_agent') {
      setSimpleError(translateSimpleError('my_agent_requires_expert'));
      return;
    }

    setSimpleStep((s) => s + 1);
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
    if (recipientNetwork === 'base') {
      setDeployError(translateSimpleError('base_requires_expert'));
      return;
    }

    const validationErrors = validateSimple(true);
    if (validationErrors.length > 0) {
      setDeployError(translateSimpleError(validationErrors[0]));
      return;
    }

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
  if (wizardMode === 'expert') return null;

  // ══════════════════════════════════════════════════════════════════════════
  // SIMPLE WIZARD RENDER
  // ══════════════════════════════════════════════════════════════════════════
  if (isSimple) {
    const simpleStepOrder = goal ? [1, 2, 3] : [0, 1, 2, 3];
    const visibleStepKeys = simpleStepOrder.map((stepIndex) => SIMPLE_STEP_LABEL_KEYS[stepIndex]);
    const visibleStepCount = visibleStepKeys.length;
    const currentVisibleIndex = Math.max(0, simpleStepOrder.indexOf(simpleStep));
    const progressValue   = ((currentVisibleIndex + 1) / visibleStepCount) * 100;
    const isLastSimple    = currentVisibleIndex === visibleStepCount - 1;
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
              {currentVisibleIndex + 1} / {visibleStepCount}
            </span>
          </div>

          {/* Progress + step labels */}
          <div className="px-6 pt-3">
            <Progress value={progressValue} className="h-1" />
            <div className="flex gap-2 mt-2">
              {visibleStepKeys.map((key, i) => (
                <span
                  key={key}
                  className="text-xs flex-1 text-center transition-colors font-medium"
                  style={{
                    color:
                      i < currentVisibleIndex  ? 'var(--success)' :
                      i === currentVisibleIndex ? 'var(--accent)'  :
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
            {simpleStep === 1 && <SimpleStep1 stepError={simpleError} />}
            {simpleStep === 2 && <SimpleStep2 />}
            {simpleStep === 3 && (
              <SimpleStep3
                deploying={deploying}
                deployError={deployError}
                onConnectWallet={handleConnectWallet}
              />
            )}
          </div>

          {/* Footer */}
          <div
            className="px-6 pb-5 pt-4 flex items-center justify-between gap-3"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            {currentVisibleIndex === 0 ? (
              <Button variant="ghost" size="sm" onClick={handleClose}>
                {t('onboarding.btn.skip')}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDeployError(null);
                  setSimpleError(null);
                  setSimpleStep(simpleStepOrder[currentVisibleIndex - 1]);
                }}
                disabled={deploying}
              >
                {t('onboarding.btn.back')}
              </Button>
            )}

            {!isLastSimple ? (
              <Button size="sm" onClick={handleSimpleNext}>
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
      <DialogContent
        className="max-w-lg w-full p-0 overflow-hidden"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <DialogTitle className="text-lg font-bold" style={{ color: 'var(--text)' }}>
            {t('onboarding.title')}
          </DialogTitle>
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
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
                className="text-xs flex-1 text-center transition-colors font-medium"
                style={{
                  color: i < step ? 'var(--success)' : i === step ? 'var(--accent)' : 'var(--text-muted)',
                }}
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
          <div className="px-6 pb-5 space-y-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            {step >= 2 && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={neverShow}
                  onChange={(e) => setNeverShow(e.target.checked)}
                  className="rounded"
                />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('onboarding.footer.never_show')}</span>
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

