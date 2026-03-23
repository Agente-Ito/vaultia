import type { FrequencyKey } from '@/context/OnboardingContext';

type TranslateFn = (key: string) => string;

export const WIZARD_FREQUENCY_KEYS: Record<FrequencyKey, string> = {
  daily: 'wizard.limits.freq.daily',
  weekly: 'wizard.limits.freq.weekly',
  monthly: 'wizard.limits.freq.monthly',
  hourly: 'wizard.limits.freq.hourly',
  'five-minutes': 'wizard.limits.freq.five_minutes',
};

export function getWizardFrequencyLabel(frequency: FrequencyKey, t: TranslateFn): string {
  return t(WIZARD_FREQUENCY_KEYS[frequency]);
}