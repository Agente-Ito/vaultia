'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ethers } from 'ethers';
import { createPublicClient, custom } from 'viem';
import { Alert, AlertTitle, AlertDescription } from '@/components/common/Alert';
import { Button } from '@/components/common/Button';
import { ProfilePicker } from '@/components/profiles/ProfilePicker';
import { useAgents } from '@/hooks/useAgents';
import { useWeb3 } from '@/context/Web3Context';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils/cn';
import { verifyPermissionsWrite } from '@/lib/verifyWrite';
import {
  AgentMode,
  buildRegistryDeployParams,
  deployRegistryVault,
  encodeAllowedCallsForTargets,
  permissionHexForMode,
  PERM_POWER_USER,
  type RecipientConfig,
} from '@/lib/web3/deployVault';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAddressList(value: string, fieldName: string) {
  const seen = new Set<string>();
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      if (!ethers.isAddress(entry)) {
        throw new Error(`${fieldName} contains an invalid address: ${entry}`);
      }
      const normalized = ethers.getAddress(entry);
      if (seen.has(normalized)) {
        throw new Error(`${fieldName} contains a duplicate address: ${normalized}`);
      }
      seen.add(normalized);
      return normalized;
    });
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const e = error as { reason?: unknown; message?: unknown };
    if (typeof e.reason === 'string' && e.reason) return e.reason;
    if (typeof e.message === 'string' && e.message) return e.message;
  }
  return String(error);
}

interface Eip1193ProviderLike {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
}

// ─── Template data ─────────────────────────────────────────────────────────────

interface TemplateConfig {
  id: string;
  budget: string;
  period: string;
  hasExpiry: boolean;
  expiryDate: string;
  agents: string;
  merchants: string;
}

const TEMPLATE_CONFIGS: TemplateConfig[] = [
  { id: 'allowance',    budget: '1',   period: '1', hasExpiry: false, expiryDate: '', agents: '', merchants: '' },
  { id: 'defi',         budget: '5',   period: '2', hasExpiry: false, expiryDate: '', agents: '', merchants: '' },
  { id: 'subscription', budget: '10',  period: '2', hasExpiry: false, expiryDate: '', agents: '', merchants: '' },
  { id: 'custom',       budget: '0.5', period: '1', hasExpiry: false, expiryDate: '', agents: '', merchants: '' },
];

const TEMPLATE_ICON: Record<string, string> = {
  allowance: '✦', defi: '◈', subscription: '⬡', custom: '⚙',
};

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {steps.map((label, i) => {
        const num = i + 1;
        const active = num === current;
        const done = num < current;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
              style={{
                background: done ? 'var(--success)' : active ? 'var(--primary)' : 'var(--card-mid)',
                color: done || active ? '#fff' : 'var(--text-muted)',
              }}
            >
              {done ? '✓' : num}
            </div>
            <span
              className="text-xs font-medium"
              style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className="w-6 h-px mx-1" style={{ background: 'var(--border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Vault preview ────────────────────────────────────────────────────────────

function PreviewRow({ icon, label, value, active }: { icon: string; label: string; value: string; active: boolean }) {
  return (
    <div
      className="flex items-center justify-between gap-2 py-1.5"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2">
        <span style={{ opacity: active ? 1 : 0.3 }}>{icon}</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <span
        className="text-xs font-medium"
        style={{ color: active ? 'var(--text)' : 'var(--text-muted)', opacity: active ? 1 : 0.4 }}
      >
        {value}
      </span>
    </div>
  );
}

function VaultPreview({
  vaultLabel, budget, period, hasExpiry, expiryDate, agentCount, merchantCount,
  tokenSymbol, securityLabel, securityRisk,
}: {
  vaultLabel: string; budget: string; period: string;
  hasExpiry: boolean; expiryDate: string;
  agentCount: number; merchantCount: number;
  tokenSymbol: string;
  securityLabel: string; securityRisk: 'low' | 'medium' | 'high';
}) {
  const { t } = useI18n();
  const budgetNum = parseFloat(budget) || 0;

  const PERIOD_DISPLAY: Record<string, string> = {
    '0': t('create.field.period.daily'),
    '1': t('create.field.period.weekly'),
    '2': t('create.field.period.monthly'),
    '3': t('create.field.period.hourly'),
    '4': t('create.field.period.five_minutes'),
  };

  return (
    <div
      className="rounded-2xl p-5 sticky top-4 space-y-4"
      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
        {t('create.preview.title')}
      </p>
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))', color: '#000' }}
        >
          ✦
        </div>
        <div>
          <p className="text-base font-bold leading-tight" style={{ color: 'var(--text)' }}>
            {vaultLabel || t('create.preview.unnamed')}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>🌐 LUKSO</p>
        </div>
      </div>
      <div>
        <PreviewRow icon="✦" label={t('create.preview.field.budget')}    value={budgetNum > 0 ? `${budget} ${tokenSymbol}` : '—'}                                           active={budgetNum > 0} />
        <PreviewRow icon="◎" label={t('create.preview.field.period')}    value={PERIOD_DISPLAY[period] ?? '—'}                                                               active={true} />
        <PreviewRow icon="⏱" label={t('create.preview.field.expires')}   value={hasExpiry && expiryDate ? new Date(expiryDate).toLocaleDateString() : t('create.preview.no_expiry')} active={hasExpiry && !!expiryDate} />
        <PreviewRow icon="⬡" label={t('create.preview.field.security')}  value={`${securityLabel}${securityRisk === 'high' ? ' ⚠' : ''}`}                                  active={true} />
        <PreviewRow icon="◍" label={t('create.preview.field.merchants')} value={merchantCount > 0 ? `${merchantCount} ${t('create.preview.addresses')}` : t('create.preview.any')} active={merchantCount > 0} />
        <PreviewRow icon="◈" label={t('create.preview.field.agents')}    value={agentCount > 0 ? `${agentCount} ${t('create.preview.agents_unit')}` : t('create.preview.none')}     active={agentCount > 0} />
      </div>
    </div>
  );
}

// ─── Field label & error ──────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
      {children}
    </label>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-xs mt-1" style={{ color: 'var(--blocked)' }}>{message}</p>;
}

const inputStyle = {
  background: 'var(--card-mid)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
};

const inputClass = 'w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none';

// ─── Step card wrapper ────────────────────────────────────────────────────────

function StepCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-6 space-y-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      {children}
    </div>
  );
}

// ─── Security mode button ─────────────────────────────────────────────────────

function SecurityMode({
  label, desc, isActive, onClick,
}: {
  label: string; desc: string; isActive: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-4 rounded-xl text-left transition-all"
      style={{
        background: isActive ? 'var(--card-mid)' : 'var(--bg)',
        border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
        boxShadow: isActive ? '0 0 0 1px var(--accent)' : 'none',
      }}
    >
      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{label}</p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</p>
    </button>
  );
}

// ─── CoordinatorAgentCatalog ─────────────────────────────────────────────────
// Shows on-chain registered agents (from AgentCoordinator) as selectable cards
// in the vault creation flow. Renders nothing when coordinator is not configured.

function CoordinatorAgentCatalog({
  selectedAddresses,
  onToggle,
}: {
  selectedAddresses: string[];
  onToggle: (address: string) => void;
}) {
  const { data: catalogAgents = [], isLoading } = useAgents();

  if (isLoading) {
    return (
      <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
        Loading agent catalog…
      </p>
    );
  }

  if (catalogAgents.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        From coordinator catalog — click to select:
      </p>
      <div className="grid grid-cols-1 gap-2">
        {catalogAgents.map((ag) => {
          const selected = selectedAddresses.some(
            (a) => a.toLowerCase() === ag.address.toLowerCase()
          );
          return (
            <button
              key={ag.address}
              type="button"
              onClick={() => onToggle(ag.address)}
              className="flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-all"
              style={{
                borderColor: selected ? 'var(--accent)' : 'var(--border)',
                background: selected ? 'rgba(34,255,178,0.07)' : 'var(--bg)',
                color: 'var(--text)',
              }}
            >
              {/* Checkbox */}
              <span
                className="w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-xs"
                style={{
                  borderColor: selected ? 'var(--accent)' : 'var(--border)',
                  background: selected ? 'var(--accent)' : 'transparent',
                  color: 'var(--bg)',
                }}
              >
                {selected && '✓'}
              </span>

              <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                {ag.address.slice(0, 10)}…{ag.address.slice(-6)}
              </span>

              {ag.roles.map((r) => (
                <span
                  key={r}
                  className="rounded-full px-2 py-0.5"
                  style={{ background: 'var(--card-mid)', color: 'var(--text-muted)' }}
                >
                  {r}
                </span>
              ))}

              {ag.allowedAutomation && (
                <span className="ml-auto rounded-full px-2 py-0.5 text-xs" style={{ background: 'rgba(34,255,178,0.15)', color: 'var(--accent)' }}>
                  auto
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateVaultPage() {
  const router = useRouter();
  const { registry, signer, isConnected, isRegistryConfigured, connect, hasUPExtension } = useWeb3();
  const { t } = useI18n();

  const [luksoToken, setLuksoToken]                     = useState('');
  const [label, setLabel]                               = useState('');
  const [budget, setBudget]                             = useState('0.5');
  const [period, setPeriod]                             = useState('1');
  const [hasExpiry, setHasExpiry]                       = useState(false);
  const [expiryDate, setExpiryDate]                     = useState('');
  const [agents, setAgents]                             = useState('');
  const [usePerAgentBudgets, setUsePerAgentBudgets]     = useState(false);
  const [agentBudgetMap, setAgentBudgetMap]             = useState<Record<string, string>>({});
  const [merchants, setMerchants]                       = useState('');
  const [status, setStatus]                             = useState('');
  const [loading, setLoading]                           = useState(false);
  const [deployed, setDeployed]                         = useState<{ safe: string; keyManager: string; policyEngine: string } | null>(null);

  const [step, setStep]                                 = useState(1);
  const [activeTemplate, setActiveTemplate]             = useState<string | null>(null);
  const [stepTouched, setStepTouched]                   = useState<Record<number, boolean>>({});
  const [agentMode, setAgentMode]                       = useState<number>(AgentMode.STRICT_PAYMENTS);
  const [allowSuperPermissions, setAllowSuperPermissions] = useState(false);
  const [showPowerUserWarning, setShowPowerUserWarning] = useState(false);
  const [pickerOpen, setPickerOpen]                     = useState<'agents' | 'merchants' | null>(null);
  const [recipientRows, setRecipientRows]               = useState<Array<{ recipient: string; budget: string; period: string }>>([]);

  const rawAgentList  = agents.split(',').map((a) => a.trim()).filter(Boolean);
  const merchantCount = merchants.split(',').map((m) => m.trim()).filter(Boolean).length;

  const securityLabel =
    agentMode === AgentMode.STRICT_PAYMENTS   ? t('create.security.strict.label') :
    agentMode === AgentMode.SUBSCRIPTIONS     ? t('create.security.subscriptions.label') :
    agentMode === AgentMode.TREASURY_BALANCED ? t('create.security.treasury.label') :
    agentMode === AgentMode.OPS_ADMIN         ? t('create.security.ops_admin.label') :
    t('create.security.power_user.label');
  const securityRisk: 'low' | 'medium' | 'high' = agentMode === AgentMode.CUSTOM ? 'high' : 'low';

  const labelError  = stepTouched[1] && label.trim().length < 2    ? t('create.error.label_too_short') : null;
  const budgetError = stepTouched[1] && (!budget || parseFloat(budget) <= 0) ? t('create.error.budget_zero') : null;
  const expiryError = stepTouched[2] && hasExpiry && !expiryDate   ? t('create.error.expiry_required') : null;

  const step1Valid = label.trim().length >= 2 && !!budget && parseFloat(budget) > 0;
  const step2Valid = !hasExpiry || !!expiryDate;

  const stepLabels = [t('create.step1.title'), t('create.step2.title'), t('create.step.security'), t('create.step3.title')];

  const applyTemplate = (cfg: TemplateConfig) => {
    setBudget(cfg.budget);
    setPeriod(cfg.period);
    setHasExpiry(cfg.hasExpiry);
    setExpiryDate(cfg.expiryDate);
    setAgents(cfg.agents);
    setMerchants(cfg.merchants);
    setUsePerAgentBudgets(false);
    setAgentBudgetMap({});
    setAgentMode(AgentMode.STRICT_PAYMENTS);
    setAllowSuperPermissions(false);
    setActiveTemplate(cfg.id);
    setStepTouched({});
    setStep(1);
  };

  const mergeAddresses = (existing: string, incoming: string[]) => {
    const current = existing.split(',').map((a) => a.trim()).filter(Boolean).map((a) => a.toLowerCase());
    const toAdd = incoming.filter((a) => !current.includes(a.toLowerCase()));
    const parts = existing.trim() ? [existing.trim(), ...toAdd] : toAdd;
    return parts.join(', ');
  };

  const handleAgentsPicked    = (addresses: string[]) => { setAgents((prev) => mergeAddresses(prev, addresses)); setAgentBudgetMap({}); };
  const handleMerchantsPicked = (addresses: string[]) => setMerchants((prev) => mergeAddresses(prev, addresses));

  const handleStep1Next = () => { setStepTouched((p) => ({ ...p, 1: true })); if (step1Valid) setStep(2); };
  const handleStep2Next = () => { setStepTouched((p) => ({ ...p, 2: true })); if (step2Valid) setStep(3); };
  const handleStep3Next = () => setStep(4);

  // ── LUKSO deploy ─────────────────────────────────────────────────────────────
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRegistryConfigured) { setStatus('Error: Registry address not configured. Set NEXT_PUBLIC_REGISTRY_ADDRESS in .env.local.'); return; }
    if (!registry || !signer) { setStatus('Error: Connect your wallet first.'); return; }
    setLoading(true);
    setStatus('');
    try {
      const owner = await signer.getAddress();
      const existingVaults = await registry.getVaults(owner);
      const existingSafeAddresses = new Set(existingVaults.map((v) => v.safe.toLowerCase()));
      const agentList    = parseAddressList(agents, 'Agents');
      const merchantList = parseAddressList(merchants, 'Merchant whitelist');
      const expirationUnix = hasExpiry && expiryDate ? BigInt(Math.floor(new Date(expiryDate).getTime() / 1000)) : BigInt(0);
      if (hasExpiry && expiryDate && expirationUnix <= BigInt(Math.floor(Date.now() / 1000))) throw new Error('Expiration date must be in the future.');
      const agentBudgetsList = usePerAgentBudgets && agentList.length > 0
        ? agentList.map((addr) => { const configured = agentBudgetMap[addr]; if (!configured) throw new Error(`Missing budget for agent ${addr}.`); return ethers.parseEther(configured); })
        : [];
      const modeNeedsAllowedCalls = agentMode === AgentMode.STRICT_PAYMENTS || agentMode === AgentMode.SUBSCRIPTIONS || agentMode === AgentMode.TREASURY_BALANCED;
      const shouldWriteAllowedCalls = modeNeedsAllowedCalls && !allowSuperPermissions;
      const encodedAllowedCalls = encodeAllowedCallsForTargets(merchantList);
      const allowedCallsByAgent = shouldWriteAllowedCalls ? agentList.map((address) => ({ agent: address, allowedCalls: encodedAllowedCalls })) : [];
      const customAgentPermissions = agentMode === AgentMode.CUSTOM ? PERM_POWER_USER : ethers.ZeroHash;
      if (luksoToken.trim() && !ethers.isAddress(luksoToken.trim())) throw new Error('Invalid token address. Enter a valid 0x… contract address or leave empty for native LYX.');
      const budgetToken = luksoToken.trim() || ethers.ZeroAddress;
      const recipientConfigs: RecipientConfig[] = recipientRows
        .filter((r) => ethers.isAddress(r.recipient.trim()))
        .map((r) => ({
          recipient: ethers.getAddress(r.recipient.trim()),
          budget: r.budget && parseFloat(r.budget) > 0 ? ethers.parseEther(r.budget) : BigInt(0),
          period: Number(r.period),
        }));
      setStatus(t('create.status.sending'));
      const { receipt, deployed: deployedVault } = await deployRegistryVault({ registry, owner, existingSafeAddresses, params: buildRegistryDeployParams({ budget: ethers.parseEther(budget), period: Number(period), budgetToken, expiration: expirationUnix, agents: agentList, agentBudgets: agentBudgetsList, merchants: merchantList, recipientConfigs, label, agentMode, allowSuperPermissions, customAgentPermissions, allowedCallsByAgent }) });
      const safeAddr = deployedVault?.safe ?? '';
      const kmAddr   = deployedVault?.keyManager ?? '';
      const peAddr   = deployedVault?.policyEngine ?? '';
      if (!safeAddr) {
        setStatus(`Vault deployed (tx: ${receipt.hash}), but deployed addresses could not be recovered. Check the explorer or refresh your vault list.`);
      } else {
        try {
          const ethereumProvider = (window as unknown as { ethereum?: Eip1193ProviderLike }).ethereum;
          if (!ethereumProvider) throw new Error('Wallet provider is unavailable for post-deploy verification.');
          const client = createPublicClient({ transport: custom(ethereumProvider) });
          const expectedPermissions = permissionHexForMode(agentMode);
          const verifyRows = await verifyPermissionsWrite(client, safeAddr as `0x${string}`, agentList.map((address) => ({ address, mode: agentMode, expectedPermissions, expectedAllowedCalls: shouldWriteAllowedCalls ? encodedAllowedCalls : '0x' })));
          const failed = verifyRows.filter((r) => !r.permissionsMatch || !r.allowedCallsMatch);
          if (failed.length > 0) throw new Error('On-chain permission verification failed after deployment.');
        } catch (verifyErr: unknown) {
          setStatus('Error: ' + getErrorMessage(verifyErr));
          return;
        }
        setDeployed({ safe: safeAddr, keyManager: kmAddr, policyEngine: peAddr });
        setStatus(t('create.status.deployed'));
      }
    } catch (err: unknown) {
      setStatus('Error: ' + getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Success ───────────────────────────────────────────────────────────────────
  if (deployed) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{t('create.success.title')}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{t('create.success.subtitle')}</p>
        </div>
        <Alert variant="success">
          <AlertTitle>{t('create.success.ownership.title')}</AlertTitle>
          <AlertDescription>
            {t('create.success.ownership.desc').split('acceptOwnership()').map((part, i) =>
              i === 0 ? part : (
                <span key={i}>
                  <code
                    className="font-mono text-xs px-1 rounded"
                    style={{ background: 'var(--card-mid)', color: 'var(--accent)' }}
                  >acceptOwnership()</code>
                  {part}
                </span>
              )
            )}
          </AlertDescription>
        </Alert>
        <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          {[{ label: t('create.success.contract.safe'), value: deployed.safe }, { label: t('create.success.contract.key_manager'), value: deployed.keyManager }, { label: t('create.success.contract.policy_engine'), value: deployed.policyEngine }].map(({ label: lbl, value }) => (
            <div key={lbl}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{lbl}</p>
              <p className="text-sm font-mono break-all" style={{ color: 'var(--text)' }}>{value || '—'}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <Button variant="primary" onClick={() => router.push('/vaults')}>{t('create.success.view_vaults')}</Button>
          <Button variant="secondary" onClick={() => { setDeployed(null); setStatus(''); setStep(1); }}>{t('create.success.create_another')}</Button>
        </div>
      </div>
    );
  }

  // ── Wizard ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent)' }}>
            {t('create.expert_mode_label')}
          </p>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{t('create.title')}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{t('create.subtitle')}</p>
        </div>
        <Link
          href="/setup"
          className="flex-shrink-0 text-xs font-medium mt-1 transition-opacity hover:opacity-80"
          style={{ color: 'var(--accent)' }}
        >
          {t('create.back_to_simple')}
        </Link>
      </div>

      {/* System alerts */}
      {!isRegistryConfigured && (
        <Alert variant="warning">
          <AlertTitle>{t('create.registry_not_configured.title')}</AlertTitle>
          <AlertDescription>{t('create.registry_not_configured.desc')}</AlertDescription>
        </Alert>
      )}
      {isRegistryConfigured && !isConnected && (
        <Alert variant="warning">
          <AlertTitle>{t('create.wallet_not_connected.title')}</AlertTitle>
          <AlertDescription>{t('create.wallet_not_connected.desc')}</AlertDescription>
        </Alert>
      )}

      {/* Chain selector — step 1 only */}
      {step === 1 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {t('create.chain.label')}
          </p>
          <div className="flex gap-3">
            {/* LUKSO — active */}
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold"
              style={{
                background: 'var(--card-mid)',
                border: '1px solid var(--accent)',
                color: 'var(--text)',
                boxShadow: '0 0 0 1px var(--accent)',
              }}
            >
              <span>🌐</span>
              <span>{t('create.chain.lukso')}</span>
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(34,255,178,0.15)', color: 'var(--success)' }}>✓</span>
            </div>
            {/* Base — coming soon */}
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold opacity-50 cursor-not-allowed"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              <span>🔵</span>
              <span>{t('create.chain.base')}</span>
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--card-mid)', color: 'var(--text-muted)' }}>
                {t('wizard.limits.network.coming_soon')}
              </span>
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('create.chain.hint')}</p>
        </div>
      )}

      {/* Template picker — step 1 only */}
      {step === 1 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {t('create.template_prompt')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TEMPLATE_CONFIGS.map((cfg) => {
              const isActive = activeTemplate === cfg.id;
              return (
                <button
                  key={cfg.id}
                  type="button"
                  onClick={() => applyTemplate(cfg)}
                  className="text-left p-4 rounded-xl transition-all"
                  style={{
                    background: isActive ? 'var(--card-mid)' : 'var(--card)',
                    border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    boxShadow: isActive ? '0 0 0 1px var(--accent)' : 'none',
                  }}
                >
                  <span
                    className="block text-xl mb-2 font-mono"
                    style={{ color: 'var(--accent)' }}
                  >
                    {TEMPLATE_ICON[cfg.id]}
                  </span>
                  <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)' }}>
                    {t(`create.template.${cfg.id}.name` as Parameters<typeof t>[0])}
                  </p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {t(`create.template.${cfg.id}.desc` as Parameters<typeof t>[0])}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-6 space-y-6 lg:space-y-0">
        {/* Left: form (2 cols) */}
        <div className="lg:col-span-2 space-y-5">
          <StepIndicator current={step} steps={stepLabels} />

          {/* ── Step 1: Basics ─────────────────────────────────────────────── */}
          {step === 1 && (
            <StepCard>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{t('create.step1.title')}</h3>
              <div>
                <FieldLabel>{t('create.field.label')}</FieldLabel>
                <input
                  className={inputClass}
                  style={{ ...inputStyle, borderColor: labelError ? 'var(--blocked)' : 'var(--border)' }}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={t('create.field.label_placeholder')}
                />
                <FieldError message={labelError} />
              </div>

              <div>
                  <FieldLabel>{t('create.field.lukso_token')}</FieldLabel>
                  <input
                    className={`${inputClass} font-mono`}
                    style={inputStyle}
                    value={luksoToken}
                    onChange={(e) => setLuksoToken(e.target.value)}
                    placeholder={t('create.field.lukso_token_placeholder')}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {t('create.field.lukso_token_hint')}
                  </p>
                </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>{t('create.field.budget')}</FieldLabel>
                  <input
                    className={inputClass}
                    style={{ ...inputStyle, borderColor: budgetError ? 'var(--blocked)' : 'var(--border)' }}
                    type="number" step="0.0001" min="0"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  />
                  <FieldError message={budgetError} />
                </div>
                <div>
                  <FieldLabel>{t('create.field.period')}</FieldLabel>
                  <select
                    className={inputClass}
                    style={inputStyle}
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    <option value="0">{t('create.field.period.daily')}</option>
                    <option value="1">{t('create.field.period.weekly')}</option>
                    <option value="2">{t('create.field.period.monthly')}</option>
                    <option value="3">{t('create.field.period.hourly')}</option>
                    <option value="4">{t('create.field.period.five_minutes')}</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="button" variant="primary" onClick={handleStep1Next}>
                  {t('create.btn.next_rules')}
                </Button>
              </div>
            </StepCard>
          )}

          {/* ── Step 2: Protection rules ────────────────────────────────────── */}
          {step === 2 && (
            <StepCard>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{t('create.step2.title')}</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('create.step2.subtitle')}</p>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasExpiry}
                    onChange={(e) => { setHasExpiry(e.target.checked); if (!e.target.checked) setExpiryDate(''); }}
                    className="rounded"
                  />
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {t('create.field.expiry_toggle')}
                  </span>
                </label>
                {hasExpiry && (
                  <div>
                    <FieldLabel>{t('create.field.expiry_date')}</FieldLabel>
                    <input
                      className={inputClass}
                      style={{ ...inputStyle, borderColor: expiryError ? 'var(--blocked)' : 'var(--border)' }}
                      type="datetime-local"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                    />
                    <FieldError message={expiryError} />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <FieldLabel>{t('create.field.merchants')}</FieldLabel>
                  <button
                    type="button"
                    onClick={() => setPickerOpen('merchants')}
                    className="text-xs font-medium flex items-center gap-1"
                    style={{ color: 'var(--accent)' }}
                  >
                    <span>◉</span> {t('picker.browse')}
                  </button>
                </div>
                <input
                  className={inputClass}
                  style={inputStyle}
                  value={merchants}
                  onChange={(e) => setMerchants(e.target.value)}
                  placeholder={t('create.field.merchants_placeholder')}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('create.field.merchants_hint')}</p>
              </div>

              {/* Per-recipient spending limits (Track 4) */}
              <div>
                <FieldLabel>{t('vaults.card.recipient_limits')}</FieldLabel>
                {recipientRows.length > 0 && (
                  <div className="mb-2 space-y-1.5">
                    <div className="grid grid-cols-[1fr_120px_120px_28px] gap-2 px-1">
                      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Recipient</span>
                      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Amount</span>
                      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Period</span>
                      <span />
                    </div>
                    {recipientRows.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_120px_120px_28px] gap-2 items-center">
                        <input
                          className={`${inputClass} font-mono`}
                          style={inputStyle}
                          value={row.recipient}
                          onChange={(e) => setRecipientRows((prev) => prev.map((r, i) => i === idx ? { ...r, recipient: e.target.value } : r))}
                          placeholder="0x…"
                        />
                        <input
                          className={inputClass}
                          style={inputStyle}
                          type="number" step="0.0001" min="0"
                          value={row.budget}
                          onChange={(e) => setRecipientRows((prev) => prev.map((r, i) => i === idx ? { ...r, budget: e.target.value } : r))}
                          placeholder="0 = unlimited"
                        />
                        <select
                          className={inputClass}
                          style={inputStyle}
                          value={row.period}
                          onChange={(e) => setRecipientRows((prev) => prev.map((r, i) => i === idx ? { ...r, period: e.target.value } : r))}
                        >
                          <option value="0">{t('create.field.period.daily')}</option>
                          <option value="1">{t('create.field.period.weekly')}</option>
                          <option value="2">{t('create.field.period.monthly')}</option>
                          <option value="3">{t('create.field.period.hourly')}</option>
                          <option value="4">{t('create.field.period.five_minutes')}</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setRecipientRows((prev) => prev.filter((_, i) => i !== idx))}
                          className="flex items-center justify-center text-xs rounded-lg h-9 w-7"
                          style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--blocked)' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setRecipientRows((prev) => [...prev, { recipient: '', budget: '', period: '1' }])}
                  className="text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ color: 'var(--accent)' }}
                >
                  + Add recipient limit
                </button>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Amount 0 = whitelist-only (no cap). Deploys RecipientBudgetPolicy alongside MerchantPolicy whitelist.
                </p>
              </div>

              <div className="flex justify-between pt-2">
                <Button type="button" variant="secondary" onClick={() => setStep(1)}>{t('create.btn.back')}</Button>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => { setHasExpiry(false); setExpiryDate(''); setMerchants(''); setStep(3); }}>
                    {t('create.btn.skip_protection')}
                  </Button>
                  <Button type="button" variant="primary" onClick={handleStep2Next}>
                    {t('create.btn.next_security')}
                  </Button>
                </div>
              </div>
            </StepCard>
          )}

          {/* ── Step 3: Security profile ─────────────────────────────────────── */}
          {step === 3 && (
            <StepCard>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{t('create.security.title')}</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {t('create.security.subtitle')}
              </p>

              <div className="grid sm:grid-cols-2 gap-3">
                <SecurityMode
                  label={t('create.security.strict.label')}
                  desc={t('create.security.strict.desc')}
                  isActive={agentMode === AgentMode.STRICT_PAYMENTS}
                  onClick={() => { setAgentMode(AgentMode.STRICT_PAYMENTS); setAllowSuperPermissions(false); }}
                />
                <SecurityMode
                  label={t('create.security.subscriptions.label')}
                  desc={t('create.security.subscriptions.desc')}
                  isActive={agentMode === AgentMode.SUBSCRIPTIONS}
                  onClick={() => { setAgentMode(AgentMode.SUBSCRIPTIONS); setAllowSuperPermissions(false); }}
                />
                <SecurityMode
                  label={t('create.security.treasury.label')}
                  desc={t('create.security.treasury.desc')}
                  isActive={agentMode === AgentMode.TREASURY_BALANCED}
                  onClick={() => { setAgentMode(AgentMode.TREASURY_BALANCED); setAllowSuperPermissions(false); }}
                />
                <SecurityMode
                  label={t('create.security.ops_admin.label')}
                  desc={t('create.security.ops_admin.desc')}
                  isActive={agentMode === AgentMode.OPS_ADMIN}
                  onClick={() => { setAgentMode(AgentMode.OPS_ADMIN); setAllowSuperPermissions(false); }}
                />
              </div>

              {/* Power User toggle */}
              <div
                className="rounded-xl px-4 py-3"
                style={{ background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.25)' }}
              >
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm font-medium" style={{ color: 'var(--blocked)' }}>
                    {t('create.security.power_user.label')}
                  </span>
                  <input
                    type="checkbox"
                    checked={agentMode === AgentMode.CUSTOM && allowSuperPermissions}
                    onChange={(e) => {
                      if (e.target.checked) { setShowPowerUserWarning(true); }
                      else { setAllowSuperPermissions(false); setAgentMode(AgentMode.STRICT_PAYMENTS); }
                    }}
                  />
                </label>
                <p className="text-xs mt-1" style={{ color: 'var(--blocked)', opacity: 0.8 }}>
                  {t('create.security.power_user.desc')}
                </p>
              </div>

              {showPowerUserWarning && (
                <Alert variant="warning">
                  <AlertTitle>{t('create.security.power_user.warning.title')}</AlertTitle>
                  <AlertDescription>
                    {t('create.security.power_user.warning.body')}
                    <div className="mt-2 flex gap-2">
                      <Button type="button" variant="secondary" onClick={() => setShowPowerUserWarning(false)}>
                        {t('create.security.power_user.warning.cancel')}
                      </Button>
                      <Button type="button" variant="primary" onClick={() => { setAgentMode(AgentMode.CUSTOM); setAllowSuperPermissions(true); setShowPowerUserWarning(false); }}>
                        {t('create.security.power_user.warning.confirm')}
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex justify-between pt-2">
                <Button type="button" variant="secondary" onClick={() => setStep(2)}>{t('create.btn.back')}</Button>
                <Button type="button" variant="primary" onClick={handleStep3Next}>{t('create.btn.next_agents')}</Button>
              </div>
            </StepCard>
          )}

          {/* ── Step 4: Agents ──────────────────────────────────────────────── */}
          {step === 4 && (
            <form onSubmit={onSubmit}>
              <StepCard>
                <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{t('create.step3.title')}</h3>

                <Alert variant="info">
                  <AlertDescription>
                    {t('create.agents_info')}{' '}
                    <Link href="/agents" className="underline font-medium" style={{ color: 'var(--accent)' }}>
                      {t('create.agents_browse')}
                    </Link>
                  </AlertDescription>
                </Alert>

                <div
                  className="rounded-xl px-4 py-3 text-xs leading-relaxed"
                  style={{
                    background: 'rgba(34,255,178,0.07)',
                    border: '1px solid rgba(34,255,178,0.2)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {t('create.agents.lukso_automation_note')}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <FieldLabel>{t('create.field.agents')}</FieldLabel>
                    <button
                      type="button"
                      onClick={() => setPickerOpen('agents')}
                      className="text-xs font-medium flex items-center gap-1"
                      style={{ color: 'var(--accent)' }}
                    >
                      <span>◉</span> {t('picker.browse')}
                    </button>
                  </div>

                  {/* ── Coordinator catalog (if configured) ───────────────── */}
                  <CoordinatorAgentCatalog
                    selectedAddresses={rawAgentList}
                    onToggle={(addr) => {
                      setAgents((prev) => {
                        const list = prev.split(',').map((a) => a.trim()).filter(Boolean);
                        const idx = list.findIndex((a) => a.toLowerCase() === addr.toLowerCase());
                        if (idx >= 0) {
                          list.splice(idx, 1);
                        } else {
                          list.push(addr);
                        }
                        return list.join(', ');
                      });
                      setAgentBudgetMap({});
                    }}
                  />

                  {/* Curated agents note */}
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {t('add_agent.catalog_future_note')}
                  </p>

                  <input
                    className={inputClass}
                    style={inputStyle}
                    value={agents}
                    onChange={(e) => { setAgents(e.target.value); setAgentBudgetMap({}); }}
                    placeholder={t('create.field.agents_placeholder')}
                  />
                </div>

                {rawAgentList.length > 0 && (
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={usePerAgentBudgets}
                        onChange={(e) => setUsePerAgentBudgets(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                        {t('create.field.per_agent_toggle')}
                      </span>
                    </label>
                    {usePerAgentBudgets && (
                      <div
                        className="space-y-2 pl-4"
                        style={{ borderLeft: '2px solid var(--border)' }}
                      >
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('create.field.per_agent_hint')}</p>
                        {rawAgentList.map((addr) => {
                          const key = ethers.isAddress(addr) ? ethers.getAddress(addr) : addr;
                          return (
                            <div key={addr} className="flex items-center gap-3">
                              <span className="text-xs font-mono w-36 truncate" style={{ color: 'var(--text-muted)' }}>
                                {addr.slice(0, 10)}…{addr.slice(-6)}
                              </span>
                              <input
                                className={cn(inputClass, 'flex-1')}
                                style={inputStyle}
                                type="number" step="0.0001" min="0"
                                placeholder="Budget (LYX)"
                                value={agentBudgetMap[key] ?? ''}
                                onChange={(e) => setAgentBudgetMap((prev) => ({ ...prev, [key]: e.target.value }))}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {!isConnected && (
                  <div
                    className="rounded-xl px-4 py-3 space-y-2"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  >
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {t('create.wallet_not_connected.desc')}
                    </p>
                    <ConnectButton.Custom>
                      {({ openConnectModal, mounted }) =>
                        mounted ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={async () => {
                              if (hasUPExtension) {
                                await connect();
                              } else {
                                window.setTimeout(() => openConnectModal(), 80);
                              }
                            }}
                          >
                            {t('create.btn.connect_wallet')}
                          </Button>
                        ) : null
                      }
                    </ConnectButton.Custom>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <Button type="button" variant="secondary" onClick={() => setStep(3)}>{t('create.btn.back')}</Button>
                  <div className="flex gap-2">
                    {agents.trim() === '' && (
                      <Button type="submit" variant="secondary" disabled={loading || !isConnected || !isRegistryConfigured}>
                        {loading ? t('create.btn.deploying') : t('create.btn.skip_deploy')}
                      </Button>
                    )}
                    <Button type="submit" variant="primary" disabled={loading || !isConnected || !isRegistryConfigured}>
                      {loading ? t('create.btn.deploying') : t('create.btn.deploy')}
                    </Button>
                  </div>
                </div>

                {status && (
                  <Alert variant={status.startsWith('Error') ? 'error' : 'info'}>
                    <AlertDescription>{status}</AlertDescription>
                  </Alert>
                )}
              </StepCard>
            </form>
          )}
        </div>

        {/* Right: live preview */}
        <div className="hidden lg:block">
          <VaultPreview
            vaultLabel={label}
            budget={budget}
            period={period}
            hasExpiry={hasExpiry}
            expiryDate={expiryDate}
            agentCount={rawAgentList.length}
            merchantCount={merchantCount}
            tokenSymbol={luksoToken.trim() ? `${luksoToken.slice(0, 6)}…` : 'LYX'}
            securityLabel={securityLabel}
            securityRisk={securityRisk}
          />
        </div>
      </div>

      {/* Profile picker modals */}
      <ProfilePicker
        isOpen={pickerOpen === 'agents'}
        onClose={() => setPickerOpen(null)}
        onConfirm={handleAgentsPicked}
        mode="agents"
        preSelected={rawAgentList}
      />
      <ProfilePicker
        isOpen={pickerOpen === 'merchants'}
        onClose={() => setPickerOpen(null)}
        onConfirm={handleMerchantsPicked}
        mode="merchants"
        preSelected={merchants.split(',').map((m) => m.trim()).filter(Boolean)}
      />
    </div>
  );
}
