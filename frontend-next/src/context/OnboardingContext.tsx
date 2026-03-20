'use client';

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import type { EntityType } from '@/lib/onboarding/entityData';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GoalKey = 'pay_people' | 'pay_vendors' | 'subscriptions' | 'save_funds';
export type SafetyLevel = 'safe' | 'flexible' | 'advanced';
export type ExecutorType = 'me' | 'vaultia' | 'my_agent';
export type WizardMode = 'simple' | 'expert';
export type FrequencyKey = 'daily' | 'weekly' | 'monthly';

interface OnboardingState {
  step: number;           // 0-4
  visible: boolean;
  completed: boolean;
  dismissed: boolean;
  // Step 0: entity type (legacy expert mode)
  entityType: EntityType | null;
  // Step 1: profile within entity (legacy)
  entityProfile: string | null;
  // Step 2: vault setup (legacy)
  vaultName: string;
  vaultEmoji: string;
  selectedSubVaults: string[];
  // Step 3: budget (legacy)
  rootBudget: string;
  budgetPeriod: 'daily' | 'weekly' | 'monthly';

  // ── New wizard fields (simple flow) ──────────────────────────────────────
  wizardMode: WizardMode;
  goal: GoalKey | null;
  recipients: string[];
  maxPerTx: string;
  frequency: FrequencyKey;
  agentEnabled: boolean;
  executor: ExecutorType;
  safetyLevel: SafetyLevel;
}

interface OnboardingContextType extends OnboardingState {
  open: () => void;
  close: () => void;
  next: () => void;
  back: () => void;
  finish: () => void;
  dismissPermanently: () => void;
  setEntityType: (t: EntityType) => void;
  setEntityProfile: (id: string) => void;
  setVaultName: (s: string) => void;
  setVaultEmoji: (s: string) => void;
  toggleSubVault: (id: string) => void;
  setRootBudget: (s: string) => void;
  setBudgetPeriod: (p: 'daily' | 'weekly' | 'monthly') => void;
  // New simple wizard setters
  setWizardMode: (m: WizardMode) => void;
  setGoal: (g: GoalKey | null) => void;
  addRecipient: (r: string) => void;
  removeRecipient: (r: string) => void;
  setMaxPerTx: (s: string) => void;
  setFrequency: (f: FrequencyKey) => void;
  setAgentEnabled: (v: boolean) => void;
  setExecutor: (e: ExecutorType) => void;
  setSafetyLevel: (s: SafetyLevel) => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

const STORAGE_COMPLETED = 'onboarding-completed';
const STORAGE_DISMISSED = 'onboarding-dismissed';
const STORAGE_WIZARD    = 'wizard-progress';
export const MAX_STEPS = 5;

// ─── Local defaults ───────────────────────────────────────────────────────────

const WIZARD_DEFAULTS = {
  wizardMode: 'simple' as WizardMode,
  goal: null as GoalKey | null,
  recipients: [] as string[],
  maxPerTx: '',
  frequency: 'monthly' as FrequencyKey,
  agentEnabled: true,
  executor: 'vaultia' as ExecutorType,
  safetyLevel: 'safe' as SafetyLevel,
};

function loadWizardProgress(): Partial<typeof WIZARD_DEFAULTS> {
  try {
    const raw = localStorage.getItem(STORAGE_WIZARD);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated]           = useState(false);
  const [step, setStep]                   = useState(0);
  const [visible, setVisible]             = useState(false);
  const [completed, setCompleted]         = useState(false);
  const [dismissed, setDismissed]         = useState(false);

  // Legacy fields
  const [entityType, setEntityTypeState]       = useState<EntityType | null>(null);
  const [entityProfile, setEntityProfileState] = useState<string | null>(null);
  const [vaultName, setVaultNameState]         = useState('');
  const [vaultEmoji, setVaultEmojiState]       = useState('💰');
  const [selectedSubVaults, setSelectedSubVaults] = useState<string[]>([]);
  const [rootBudget, setRootBudgetState]       = useState('1');
  const [budgetPeriod, setBudgetPeriodState]   = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  // New wizard fields
  const [wizardMode, setWizardModeState]       = useState<WizardMode>(WIZARD_DEFAULTS.wizardMode);
  const [goal, setGoalState]                   = useState<GoalKey | null>(WIZARD_DEFAULTS.goal);
  const [recipients, setRecipients]            = useState<string[]>(WIZARD_DEFAULTS.recipients);
  const [maxPerTx, setMaxPerTxState]           = useState<string>(WIZARD_DEFAULTS.maxPerTx);
  const [frequency, setFrequencyState]         = useState<FrequencyKey>(WIZARD_DEFAULTS.frequency);
  const [agentEnabled, setAgentEnabledState]   = useState<boolean>(WIZARD_DEFAULTS.agentEnabled);
  const [executor, setExecutorState]           = useState<ExecutorType>(WIZARD_DEFAULTS.executor);
  const [safetyLevel, setSafetyLevelState]     = useState<SafetyLevel>(WIZARD_DEFAULTS.safetyLevel);

  useEffect(() => {
    const isCompleted = localStorage.getItem(STORAGE_COMPLETED) === 'true';
    const isDismissed = localStorage.getItem(STORAGE_DISMISSED) === 'true';
    setCompleted(isCompleted);
    setDismissed(isDismissed);
    if (!isCompleted && !isDismissed) setVisible(true);

    // Restore wizard progress
    const saved = loadWizardProgress();
    if (saved.goal)         setGoalState(saved.goal);
    if (saved.recipients)   setRecipients(saved.recipients);
    if (saved.maxPerTx)     setMaxPerTxState(saved.maxPerTx);
    if (saved.frequency)    setFrequencyState(saved.frequency);
    if (saved.wizardMode)   setWizardModeState(saved.wizardMode);
    if (saved.executor)     setExecutorState(saved.executor);
    if (saved.safetyLevel)  setSafetyLevelState(saved.safetyLevel);
    if (typeof saved.agentEnabled === 'boolean') setAgentEnabledState(saved.agentEnabled);

    setHydrated(true);
  }, []);

  // Persist wizard progress to localStorage whenever key fields change
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_WIZARD, JSON.stringify({
        goal, recipients, maxPerTx, frequency, wizardMode, executor, safetyLevel, agentEnabled,
      }));
    } catch { /* ignore */ }
  }, [goal, recipients, maxPerTx, frequency, wizardMode, executor, safetyLevel, agentEnabled, hydrated]);

  const open = useCallback(() => {
    setVisible(true);
    setDismissed(false);
  }, []);

  const close = useCallback(() => setVisible(false), []);

  const next = useCallback(() => {
    setStep((s) => Math.min(s + 1, MAX_STEPS - 1));
  }, []);

  const back = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const finish = useCallback(() => {
    setCompleted(true);
    setVisible(false);
    localStorage.setItem(STORAGE_COMPLETED, 'true');
    // Clear wizard progress after success
    try { localStorage.removeItem(STORAGE_WIZARD); } catch { /* ignore */ }
  }, []);

  const dismissPermanently = useCallback(() => {
    setDismissed(true);
    setVisible(false);
    localStorage.setItem(STORAGE_DISMISSED, 'true');
  }, []);

  const setEntityType = useCallback((t: EntityType) => {
    setEntityTypeState(t);
    setEntityProfileState(null);
    setSelectedSubVaults([]);
    setVaultNameState('');
    setVaultEmojiState('💰');
  }, []);

  const setEntityProfile = useCallback((id: string) => setEntityProfileState(id), []);
  const toggleSubVault = useCallback((id: string) => {
    setSelectedSubVaults((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);
  const setVaultName    = useCallback((s: string) => setVaultNameState(s), []);
  const setVaultEmoji   = useCallback((s: string) => setVaultEmojiState(s), []);
  const setRootBudget   = useCallback((s: string) => setRootBudgetState(s), []);
  const setBudgetPeriod = useCallback((p: 'daily' | 'weekly' | 'monthly') => setBudgetPeriodState(p), []);

  // New wizard setters
  const setWizardMode   = useCallback((m: WizardMode) => setWizardModeState(m), []);
  const setGoal         = useCallback((g: GoalKey | null) => setGoalState(g), []);
  const addRecipient    = useCallback((r: string) => setRecipients((prev) => prev.includes(r) ? prev : [...prev, r]), []);
  const removeRecipient = useCallback((r: string) => setRecipients((prev) => prev.filter((x) => x !== r)), []);
  const setMaxPerTx     = useCallback((s: string) => setMaxPerTxState(s), []);
  const setFrequency    = useCallback((f: FrequencyKey) => setFrequencyState(f), []);
  const setAgentEnabled = useCallback((v: boolean) => setAgentEnabledState(v), []);
  const setExecutor     = useCallback((e: ExecutorType) => setExecutorState(e), []);
  const setSafetyLevel  = useCallback((s: SafetyLevel) => setSafetyLevelState(s), []);

  return (
    <OnboardingContext.Provider
      value={{
        step, visible: hydrated && visible, completed, dismissed,
        entityType, entityProfile, vaultName, vaultEmoji,
        selectedSubVaults, rootBudget, budgetPeriod,
        wizardMode, goal, recipients, maxPerTx, frequency,
        agentEnabled, executor, safetyLevel,
        open, close, next, back, finish, dismissPermanently,
        setEntityType, setEntityProfile, setVaultName, setVaultEmoji,
        toggleSubVault, setRootBudget, setBudgetPeriod,
        setWizardMode, setGoal, addRecipient, removeRecipient,
        setMaxPerTx, setFrequency, setAgentEnabled, setExecutor, setSafetyLevel,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextType {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}

