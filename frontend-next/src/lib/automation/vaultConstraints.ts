import { ethers } from 'ethers';
import type { VaultRecord } from '@/hooks/useVaults';
import {
  getBudgetPolicyContract,
  getMerchantPolicyContract,
  getPolicyEngineContract,
  getRecipientBudgetPolicyContract,
} from '@/lib/web3/contracts';
import { getReadOnlyProvider } from '@/lib/web3/provider';

export interface AuthorizedRecipientOption {
  address: string;
  remainingWei: bigint | null;
  periodSeconds: number | null;
}

export interface VaultAutomationConstraints {
  recipientOptions: AuthorizedRecipientOption[];
  hasRecipientRestrictions: boolean;
  globalRemainingWei: bigint | null;
  maxPeriodSeconds: number | null;
}

export const RECIPIENT_PERIOD_SECONDS: Record<number, number> = {
  0: 86400,
  1: 604800,
  2: 2592000,
  3: 3600,
  4: 300,
};

export const FREQUENCY_SECONDS: Record<'five-minutes' | 'hourly' | 'daily' | 'weekly' | 'monthly', number> = {
  'five-minutes': 300,
  hourly: 3600,
  daily: 86400,
  weekly: 604800,
  monthly: 2592000,
};

export function formatLyxAmount(amountWei: bigint) {
  return ethers.formatEther(amountWei).replace(/\.0+$|(?<=\.[0-9]*?)0+$/u, '').replace(/\.$/u, '');
}

export function minBigInt(left: bigint | null, right: bigint | null) {
  if (left === null) return right;
  if (right === null) return left;
  return left < right ? left : right;
}

export function minNumber(left: number | null, right: number | null) {
  if (left === null) return right;
  if (right === null) return left;
  return left < right ? left : right;
}

export async function loadVaultAutomationConstraints(vault: VaultRecord): Promise<VaultAutomationConstraints> {
  const provider = getReadOnlyProvider();
  const policyEngine = getPolicyEngineContract(vault.policyEngine, provider);
  const policyAddresses: string[] = await policyEngine.getPolicies();

  let globalRemainingWei: bigint | null = null;
  let maxPeriodSeconds: number | null = null;
  let merchantRecipients: string[] | null = null;
  let recipientOptionsMap: Map<string, AuthorizedRecipientOption> | null = null;

  for (const policyAddress of policyAddresses) {
    try {
      const budgetPolicy = getBudgetPolicyContract(policyAddress, provider);
      const [budget, spent, periodDuration] = await Promise.all([
        budgetPolicy.budget(),
        budgetPolicy.spent(),
        budgetPolicy.periodDuration(),
      ]);
      const budgetWei = BigInt(budget);
      const spentWei = BigInt(spent);
      const remainingWei = budgetWei > spentWei ? budgetWei - spentWei : BigInt(0);

      globalRemainingWei = minBigInt(globalRemainingWei, remainingWei);
      maxPeriodSeconds = minNumber(maxPeriodSeconds, Number(periodDuration));
      continue;
    } catch {
      // not a BudgetPolicy
    }

    try {
      const merchantPolicy = getMerchantPolicyContract(policyAddress, provider);
      merchantRecipients = await merchantPolicy.getMerchants();
      continue;
    } catch {
      // not a MerchantPolicy
    }

    try {
      const recipientBudgetPolicy = getRecipientBudgetPolicyContract(policyAddress, provider);
      const recipientAddresses: string[] = await recipientBudgetPolicy.getRecipients();
      const entries = await Promise.all(recipientAddresses.map(async (address) => {
        const [limitState, remaining] = await Promise.all([
          recipientBudgetPolicy.recipientLimits(address),
          recipientBudgetPolicy.getRecipientRemaining(address),
        ]);

        return {
          address,
          remainingWei: remaining === ethers.MaxUint256 ? null : remaining,
          periodSeconds: RECIPIENT_PERIOD_SECONDS[Number(limitState.period)] ?? null,
        } satisfies AuthorizedRecipientOption;
      }));

      recipientOptionsMap = new Map(entries.map((entry) => [entry.address.toLowerCase(), entry]));
    } catch {
      // not a RecipientBudgetPolicy
    }
  }

  let recipientOptions: AuthorizedRecipientOption[] = [];
  if (merchantRecipients && recipientOptionsMap) {
    recipientOptions = merchantRecipients
      .map((address) => recipientOptionsMap?.get(address.toLowerCase()))
      .filter((entry): entry is AuthorizedRecipientOption => Boolean(entry));
  } else if (merchantRecipients) {
    recipientOptions = merchantRecipients.map((address) => ({ address, remainingWei: null, periodSeconds: null }));
  } else if (recipientOptionsMap) {
    recipientOptions = [...recipientOptionsMap.values()];
  }

  return {
    recipientOptions,
    hasRecipientRestrictions: Boolean(merchantRecipients || recipientOptionsMap),
    globalRemainingWei,
    maxPeriodSeconds,
  };
}