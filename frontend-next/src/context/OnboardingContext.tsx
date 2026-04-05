'use client';

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from '@/lib/browserStorage';

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
export type FrequencyKey = 'daily' | 'weekly' | 'monthly' | 'hourly' | 'five-minutes';
export type RecipientNetwork = 'up' | 'base';
export type ControllerMode = 'single' | 'multisig';

export interface RecipientEntry {
  address: string;
  label?: string;
}

interface OnboardingState {
  completed: boolean;
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
  controllerMode: ControllerMode;
  rawMultisigSigners: string;
  multisigThreshold: number;
  multisigTimelockHours: number;
}

interface OnboardingContextType extends OnboardingState {
  finish: () => void;
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
  setControllerMode: (mode: ControllerMode) => void;
  setRawMultisigSigners: (value: string) => void;
  setMultisigThreshold: (value: number) => void;
  setMultisigTimelockHours: (value: number) => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

const STORAGE_COMPLETED = 'onboarding-completed';
const STORAGE_WIZARD    = 'wizard-progress';

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
  controllerMode: 'single' as ControllerMode,
  rawMultisigSigners: '',
  multisigThreshold: 1,
  multisigTimelockHours: 0,
};

function loadWizardProgress(): Partial<typeof WIZARD_DEFAULTS> {
  try {
    const raw = readLocalStorage(STORAGE_WIZARD);
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
  const [completed, setCompleted]         = useState(false);

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
  const [controllerMode, setControllerModeState] = useState<ControllerMode>(WIZARD_DEFAULTS.controllerMode);
  const [rawMultisigSigners, setRawMultisigSignersState] = useState<string>(WIZARD_DEFAULTS.rawMultisigSigners);
  const [multisigThreshold, setMultisigThresholdState] = useState<number>(WIZARD_DEFAULTS.multisigThreshold);
  const [multisigTimelockHours, setMultisigTimelockHoursState] = useState<number>(WIZARD_DEFAULTS.multisigTimelockHours);

  useEffect(() => {
    const isCompleted = readLocalStorage(STORAGE_COMPLETED) === 'true';
    setCompleted(isCompleted);

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
    if (saved.controllerMode === 'single' || saved.controllerMode === 'multisig') setControllerModeState(saved.controllerMode);
    if (typeof saved.rawMultisigSigners === 'string') setRawMultisigSignersState(saved.rawMultisigSigners);
    if (typeof saved.multisigThreshold === 'number') setMultisigThresholdState(saved.multisigThreshold);
    if (typeof saved.multisigTimelockHours === 'number') setMultisigTimelockHoursState(saved.multisigTimelockHours);

    setHydrated(true);
  }, []);

  // Persist wizard progress to localStorage whenever key fields change
  useEffect(() => {
    if (!hydrated) return;
    writeLocalStorage(STORAGE_WIZARD, JSON.stringify({
      wizardVaultName, goal, recipientNetwork, baseToken, luksoToken, recipients, maxPerTx, frequency, wizardMode, executor, safetyLevel, agentEnabled,
      controllerMode, rawMultisigSigners, multisigThreshold, multisigTimelockHours,
    }));
  }, [wizardVaultName, goal, recipientNetwork, baseToken, luksoToken, recipients, maxPerTx, frequency, wizardMode, executor, safetyLevel, agentEnabled, controllerMode, rawMultisigSigners, multisigThreshold, multisigTimelockHours, hydrated]);

  const finish = useCallback(() => {
    setCompleted(true);
    writeLocalStorage(STORAGE_COMPLETED, 'true');
    // Clear wizard progress after success
    removeLocalStorage(STORAGE_WIZARD);
  }, []);

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
  const setControllerMode = useCallback((mode: ControllerMode) => setControllerModeState(mode), []);
  const setRawMultisigSigners = useCallback((value: string) => setRawMultisigSignersState(value), []);
  const setMultisigThreshold = useCallback((value: number) => setMultisigThresholdState(value), []);
  const setMultisigTimelockHours = useCallback((value: number) => setMultisigTimelockHoursState(value), []);

  return (
    <OnboardingContext.Provider
      value={{
        completed,
        wizardMode, wizardVaultName, goal, recipientNetwork, baseToken, luksoToken, recipients, maxPerTx, frequency,
        agentEnabled, executor, safetyLevel, controllerMode, rawMultisigSigners, multisigThreshold, multisigTimelockHours,
        finish,
        setWizardMode, setWizardVaultName, setGoal, setRecipientNetwork, setBaseToken, setLuksoToken, addRecipient, removeRecipient,
        setMaxPerTx, setFrequency, setAgentEnabled, setExecutor, setSafetyLevel, setControllerMode, setRawMultisigSigners, setMultisigThreshold, setMultisigTimelockHours,
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

