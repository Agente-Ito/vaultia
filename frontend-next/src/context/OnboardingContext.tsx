'use client';

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

export type UseCase = 'family' | 'daily' | 'defi' | null;

interface OnboardingState {
  step: number;           // 0-3
  visible: boolean;
  completed: boolean;
  dismissed: boolean;     // "no mostrar de nuevo"
  useCase: UseCase;
  vaultName: string;
  vaultEmoji: string;
  rootBudget: string;
  budgetPeriod: 'daily' | 'weekly' | 'monthly';
}

interface OnboardingContextType extends OnboardingState {
  open: () => void;
  close: () => void;
  next: () => void;
  back: () => void;
  finish: () => void;
  dismissPermanently: () => void;
  setUseCase: (uc: UseCase) => void;
  setVaultName: (s: string) => void;
  setVaultEmoji: (s: string) => void;
  setRootBudget: (s: string) => void;
  setBudgetPeriod: (p: 'daily' | 'weekly' | 'monthly') => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

const STORAGE_COMPLETED = 'onboarding-completed';
const STORAGE_DISMISSED = 'onboarding-dismissed';
const MAX_STEPS = 4;

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [useCase, setUseCaseState] = useState<UseCase>(null);
  const [vaultName, setVaultNameState] = useState('');
  const [vaultEmoji, setVaultEmojiState] = useState('💰');
  const [rootBudget, setRootBudgetState] = useState('5000');
  const [budgetPeriod, setBudgetPeriodState] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  // SSR hydration guard — same pattern as ModeContext
  useEffect(() => {
    const isCompleted = localStorage.getItem(STORAGE_COMPLETED) === 'true';
    const isDismissed = localStorage.getItem(STORAGE_DISMISSED) === 'true';
    setCompleted(isCompleted);
    setDismissed(isDismissed);
    // Show on first visit unless permanently dismissed or completed
    if (!isCompleted && !isDismissed) {
      setVisible(true);
    }
    setHydrated(true);
  }, []);

  const open = useCallback(() => setVisible(true), []);
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
  }, []);

  const dismissPermanently = useCallback(() => {
    setDismissed(true);
    setVisible(false);
    localStorage.setItem(STORAGE_DISMISSED, 'true');
  }, []);

  const setUseCase = useCallback((uc: UseCase) => setUseCaseState(uc), []);
  const setVaultName = useCallback((s: string) => setVaultNameState(s), []);
  const setVaultEmoji = useCallback((s: string) => setVaultEmojiState(s), []);
  const setRootBudget = useCallback((s: string) => setRootBudgetState(s), []);
  const setBudgetPeriod = useCallback((p: 'daily' | 'weekly' | 'monthly') => setBudgetPeriodState(p), []);

  return (
    <OnboardingContext.Provider
      value={{
        step, visible: hydrated && visible, completed, dismissed, useCase,
        vaultName, vaultEmoji, rootBudget, budgetPeriod,
        open, close, next, back, finish, dismissPermanently,
        setUseCase, setVaultName, setVaultEmoji, setRootBudget, setBudgetPeriod,
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
