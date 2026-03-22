import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '@/context/Web3Context';
import { getProvider } from '@/lib/web3/provider';
import { getSafeContract, getPolicyEngineContract, getBudgetPolicyContract, getMerchantPolicyContract, getExpirationPolicyContract, getAgentBudgetPolicyContract, getRecipientBudgetPolicyContract, getLSP7DemoTokenContract } from '@/lib/web3/contracts';

export interface RecipientLimitEntry {
  recipient: string;
  limit: string;
  spent: string;
  remaining: string;
  period: string;
}

export interface VaultPolicySummary {
  budget?: string;
  spent?: string;
  periodStart?: string;
  merchants?: string[];
  expiration?: string;
  warnings?: string[];
  agentBudgetPolicy?: {
    agentCount: number;
    periodDurationLabel: string;
    timeUntilReset: string;
  };
  recipientBudgetPolicyAddress?: string;
  recipientLimits?: RecipientLimitEntry[];
  budgetPolicyAddress?: string;
  merchantPolicyAddress?: string;
  expirationPolicyAddress?: string;
  budgetToken?: string;       // address(0) = native LYX
  tokenBalance?: string;      // LSP7 balance if budgetToken != address(0)
}

export interface VaultDetail {
  safe: string;
  policyEngine: string;
  keyManager: string;
  balance: string;
  policySummary: VaultPolicySummary;
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function useVault(safeAddress: string | null) {
  const { signer } = useWeb3();
  const [detail, setDetail] = useState<VaultDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!safeAddress) {
      setDetail(null);
      return;
    }

    let cancelled = false;

    const loadVault = async () => {
      setLoading(true);
      setError(null);

      try {
        // Use signer's provider when available (consistent RPC), fall back to read-only provider.
        // signer.provider can theoretically be null in ethers v6, so use ?. with fallback.
        const provider = signer?.provider ?? getProvider();
        const safe = getSafeContract(safeAddress, provider);

        const [policyEngine, keyManager, balance] = await Promise.all([
          safe.policyEngine(),
          safe.vaultKeyManager(),
          provider.getBalance(safeAddress),
        ]);

        const policyEngineContract = getPolicyEngineContract(policyEngine, provider);
        const policyAddrs: string[] = await policyEngineContract.getPolicies();
        const warnings: string[] = [];
        const summary: VaultPolicySummary = { warnings };

        for (const p of policyAddrs) {
          let matchedPolicy = false;

          try {
            const bp = getBudgetPolicyContract(p, provider);
            const [budget, spent, periodStart, budgetToken] = await Promise.all([
              bp.budget(), bp.spent(), bp.periodStart(), bp.budgetToken(),
            ]);
            summary.budget = ethers.formatEther(budget);
            summary.spent = ethers.formatEther(spent);
            summary.periodStart = new Date(Number(periodStart) * 1000).toLocaleString();
            summary.budgetPolicyAddress = p;
            summary.budgetToken = budgetToken;
            if (budgetToken !== ethers.ZeroAddress) {
              try {
                const tokenBal = await getLSP7DemoTokenContract(budgetToken, provider).balanceOf(safeAddress);
                summary.tokenBalance = ethers.formatEther(tokenBal);
              } catch {
                // token balance read failed — leave undefined
              }
            }
            matchedPolicy = true;
            continue;
          } catch {
            // Not a BudgetPolicy — try next type
          }

          try {
            const mp = getMerchantPolicyContract(p, provider);
            summary.merchants = await mp.getMerchants();
            summary.merchantPolicyAddress = p;
            matchedPolicy = true;
            continue;
          } catch {
            // Not a MerchantPolicy — try next type
          }

          try {
            const ep = getExpirationPolicyContract(p, provider);
            summary.expiration = (await ep.expiration()).toString();
            summary.expirationPolicyAddress = p;
            matchedPolicy = true;
            continue;
          } catch {
            // Not an ExpirationPolicy — try next type
          }

          try {
            const abp = getAgentBudgetPolicyContract(p, provider);
            const [agentCount, periodDuration, timeUntilReset] = await Promise.all([
              abp.agentCount(),
              abp.getPeriodDuration(),
              abp.getTimeUntilReset(),
            ]);
            const durationSec = Number(periodDuration);
            const periodDurationLabel =
              durationSec === 86400 ? 'Daily' :
              durationSec === 604800 ? 'Weekly' :
              durationSec === 2592000 ? 'Monthly' :
              durationSec === 3600 ? 'Hourly' :
              durationSec === 300 ? '5 min' :
              `${durationSec}s`;
            const resetSec = Number(timeUntilReset);
            const timeUntilResetLabel = resetSec === 0 ? 'resetting now' :
              resetSec < 3600 ? `${Math.ceil(resetSec / 60)}m` :
              resetSec < 86400 ? `${Math.ceil(resetSec / 3600)}h` :
              `${Math.ceil(resetSec / 86400)}d`;
            summary.agentBudgetPolicy = {
              agentCount: Number(agentCount),
              periodDurationLabel,
              timeUntilReset: timeUntilResetLabel,
            };
            matchedPolicy = true;
            continue;
          } catch {
            // Not an AgentBudgetPolicy — try next type
          }

          try {
            const rbp = getRecipientBudgetPolicyContract(p, provider);
            // recipientCount() is unique to RecipientBudgetPolicy
            await rbp.recipientCount();
            const recipientAddrs: string[] = await rbp.getRecipients();
            const PERIOD_LABELS: Record<number, string> = { 0: 'Daily', 1: 'Weekly', 2: 'Monthly', 3: 'Hourly', 4: '5 min' };
            const entries: RecipientLimitEntry[] = await Promise.all(
              recipientAddrs.map(async (addr) => {
                const rl = await rbp.recipientLimits(addr);
                const limit = ethers.formatEther(rl.limit);
                const spent = ethers.formatEther(rl.spent);
                const remaining = rl.limit === BigInt(0)
                  ? '∞'
                  : ethers.formatEther(rl.limit - rl.spent > BigInt(0) ? rl.limit - rl.spent : BigInt(0));
                return {
                  recipient: addr,
                  limit: rl.limit === BigInt(0) ? '∞' : limit,
                  spent,
                  remaining,
                  period: PERIOD_LABELS[Number(rl.period)] ?? `${rl.period}`,
                };
              })
            );
            summary.recipientBudgetPolicyAddress = p;
            summary.recipientLimits = entries;
            matchedPolicy = true;
          } catch {
            // Not a RecipientBudgetPolicy — skip
          }

          if (!matchedPolicy) {
            warnings.push(`Could not identify or load policy ${shortAddress(p)}.`);
          }
        }

        if (!cancelled) {
          setDetail({ safe: safeAddress, policyEngine, keyManager, balance: ethers.formatEther(balance), policySummary: summary });
        }
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadVault();
    return () => { cancelled = true; };
  }, [safeAddress, signer]);

  return { detail, loading, error };
}
