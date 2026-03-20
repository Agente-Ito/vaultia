'use client';

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import type { EntityType } from '@/lib/onboarding/entityData';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GoalKey =
  | 'pay_people'
  | 'pay_vendors'
  | 'subscriptions'
  | 'save_funds'
  | 'payroll'
  | 'grants'
  | 'treasury_rebalance'
  | 'tax_reserve';
export type SafetyLevel = 'safe' | 'flexible' | 'advanced';
export type ExecutorType = 'me' | 'vaultia' | 'my_agent';
export type WizardMode = 'simple' | 'expert';
export type FrequencyKey = 'daily' | 'weekly' | 'monthly';
export type RecipientNetwork = 'up' | 'base';

export interface RecipientEntry {
  address: string;
  label?: string;
}

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
  wizardVaultName: string;
  goal: GoalKey | null;
  recipientNetwork: RecipientNetwork;
  /** Token address for Base vaults (ZeroAddress = native ETH) */
  baseToken: string;
  /** Token address for LUKSO vaults (empty string = native LYX) */
  luksoToken: string;
  recipients: RecipientEntry[];
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
  setWizardVaultName: (s: string) => void;
  setGoal: (g: GoalKey | null) => void;
  setRecipientNetwork: (n: RecipientNetwork) => void;
  setBaseToken: (addr: string) => void;
  setLuksoToken: (addr: string) => void;
  addRecipient: (r: RecipientEntry) => void;
  removeRecipient: (address: string) => void;
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
  wizardVaultName: '',
  goal: null as GoalKey | null,
  recipientNetwork: 'up' as RecipientNetwork,
  baseToken: '0x0000000000000000000000000000000000000000', // native ETH
  luksoToken: '', // empty = native LYX
  recipients: [] as RecipientEntry[],
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

function normalizeStoredRecipients(value: unknown): RecipientEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') {
      return entry ? [{ address: entry }] : [];
    }
    if (typeof entry === 'object' && entry !== null && 'address' in entry) {
      const address = (entry as { address?: unknown }).address;
      const label = (entry as { label?: unknown }).label;
      if (typeof address !== 'string' || !address) return [];
      return [{
        address,
        label: typeof label === 'string' && label.trim() ? label : undefined,
      }];
    }
    return [];
  });
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
  const [wizardMode, setWizardModeState]           = useState<WizardMode>(WIZARD_DEFAULTS.wizardMode);
  const [wizardVaultName, setWizardVaultNameState] = useState<string>(WIZARD_DEFAULTS.wizardVaultName);
  const [goal, setGoalState]                       = useState<GoalKey | null>(WIZARD_DEFAULTS.goal);
  const [recipientNetwork, setRecipientNetworkState] = useState<RecipientNetwork>(WIZARD_DEFAULTS.recipientNetwork);
  const [baseToken, setBaseTokenState]             = useState<string>(WIZARD_DEFAULTS.baseToken);
  const [luksoToken, setLuksoTokenState]           = useState<string>(WIZARD_DEFAULTS.luksoToken);
  const [recipients, setRecipients]            = useState<RecipientEntry[]>(WIZARD_DEFAULTS.recipients);
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

    // Restore wizard progress
    const saved = loadWizardProgress();
    if (saved.wizardVaultName !== undefined) setWizardVaultNameState(saved.wizardVaultName);
    if (saved.goal)         setGoalState(saved.goal);
    if (saved.recipientNetwork) setRecipientNetworkState(saved.recipientNetwork);
    if (saved.baseToken)    setBaseTokenState(saved.baseToken);
    if (saved.luksoToken !== undefined) setLuksoTokenState(saved.luksoToken);
    if (saved.recipients)   setRecipients(normalizeStoredRecipients(saved.recipients));
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
        wizardVaultName, goal, recipientNetwork, baseToken, luksoToken, recipients, maxPerTx, frequency, wizardMode, executor, safetyLevel, agentEnabled,
      }));
    } catch { /* ignore */ }
  }, [wizardVaultName, goal, recipientNetwork, baseToken, luksoToken, recipients, maxPerTx, frequency, wizardMode, executor, safetyLevel, agentEnabled, hydrated]);

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
  const setWizardMode       = useCallback((m: WizardMode) => setWizardModeState(m), []);
  const setWizardVaultName  = useCallback((s: string) => setWizardVaultNameState(s), []);
  const setGoal             = useCallback((g: GoalKey | null) => setGoalState(g), []);
  const setRecipientNetwork = useCallback((n: RecipientNetwork) => setRecipientNetworkState(n), []);
  const setBaseToken        = useCallback((addr: string) => setBaseTokenState(addr), []);
  const setLuksoToken       = useCallback((addr: string) => setLuksoTokenState(addr), []);
  const addRecipient    = useCallback((recipient: RecipientEntry) => {
    setRecipients((prev) =>
      prev.some((entry) => entry.address.toLowerCase() === recipient.address.toLowerCase())
        ? prev
        : [...prev, recipient]
    );
  }, []);
  const removeRecipient = useCallback((address: string) => {
    setRecipients((prev) => prev.filter((entry) => entry.address.toLowerCase() !== address.toLowerCase()));
  }, []);
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
        wizardMode, wizardVaultName, goal, recipientNetwork, baseToken, luksoToken, recipients, maxPerTx, frequency,
        agentEnabled, executor, safetyLevel,
        open, close, next, back, finish, dismissPermanently,
        setEntityType, setEntityProfile, setVaultName, setVaultEmoji,
        toggleSubVault, setRootBudget, setBudgetPeriod,
        setWizardMode, setWizardVaultName, setGoal, setRecipientNetwork, setBaseToken, setLuksoToken, addRecipient, removeRecipient,
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

