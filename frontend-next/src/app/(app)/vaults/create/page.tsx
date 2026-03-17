'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ethers } from 'ethers';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Alert, AlertTitle, AlertDescription } from '@/components/common/Alert';
import { ProfilePicker } from '@/components/profiles/ProfilePicker';
import { useWeb3 } from '@/context/Web3Context';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils/cn';

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

// ─── Template data (display strings via t(), only config values here) ─────────

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

const TEMPLATE_STYLE: Record<string, { emoji: string; base: string; hover: string; active: string }> = {
  allowance:    { emoji: '💰', base: 'border-emerald-200 dark:border-emerald-800', hover: 'hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20', active: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' },
  defi:         { emoji: '📈', base: 'border-blue-200 dark:border-blue-800',       hover: 'hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20',           active: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' },
  subscription: { emoji: '🔄', base: 'border-orange-200 dark:border-orange-800',   hover: 'hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20',     active: 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' },
  custom:       { emoji: '⚙️', base: 'border-violet-200 dark:border-violet-800',   hover: 'hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20',     active: 'border-violet-500 bg-violet-50 dark:bg-violet-900/20' },
};

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-xs">
      {steps.map((label, i) => {
        const num = i + 1;
        const active = num === current;
        const done = num < current;
        return (
          <div key={label} className="flex items-center gap-xs">
            <div className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0',
              active ? 'bg-primary text-white' : done ? 'bg-success text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500'
            )}>
              {done ? '✓' : num}
            </div>
            <span className={cn('text-xs', active ? 'font-medium text-neutral-900 dark:text-neutral-50' : 'text-neutral-500')}>
              {label}
            </span>
            {i < steps.length - 1 && <div className="w-6 h-px bg-neutral-200 dark:bg-neutral-700 mx-xs" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Live vault preview ───────────────────────────────────────────────────────

const PERIOD_MAP: Record<string, string> = { '0': 'Daily', '1': 'Weekly', '2': 'Monthly' };

function PreviewRow({ icon, label, value, active }: { icon: string; label: string; value: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-neutral-100 dark:border-neutral-700 last:border-0">
      <div className="flex items-center gap-2">
        <span className={cn('text-sm', active ? '' : 'opacity-30')}>{icon}</span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
      </div>
      <span className={cn('text-xs font-medium', active ? 'text-neutral-900 dark:text-neutral-50' : 'text-neutral-300 dark:text-neutral-600')}>
        {value}
      </span>
    </div>
  );
}

function VaultPreview({
  vaultLabel, budget, period, hasExpiry, expiryDate, agentCount, merchantCount,
}: {
  vaultLabel: string; budget: string; period: string;
  hasExpiry: boolean; expiryDate: string;
  agentCount: number; merchantCount: number;
}) {
  const budgetNum = parseFloat(budget) || 0;
  return (
    <div className="rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-5 space-y-4 sticky top-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Preview</p>

      {/* Vault identity */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xl">
          🏦
        </div>
        <div>
          <p className="text-base font-bold text-neutral-900 dark:text-neutral-50 leading-tight">
            {vaultLabel || 'Unnamed Vault'}
          </p>
          <p className="text-xs text-neutral-400">LUKSO Network</p>
        </div>
      </div>

      {/* Summary rows */}
      <div>
        <PreviewRow icon="💰" label="Budget"    value={budgetNum > 0 ? `${budget} LYX` : '—'}               active={budgetNum > 0} />
        <PreviewRow icon="📅" label="Period"    value={PERIOD_MAP[period] ?? '—'}                            active={true} />
        <PreviewRow icon="⏱️" label="Expires"   value={hasExpiry && expiryDate ? new Date(expiryDate).toLocaleDateString() : 'No expiry'} active={hasExpiry && !!expiryDate} />
        <PreviewRow icon="🏪" label="Merchants" value={merchantCount > 0 ? `${merchantCount} address(es)` : 'Any'} active={merchantCount > 0} />
        <PreviewRow icon="🤖" label="Agents"    value={agentCount > 0 ? `${agentCount} agent(s)` : 'None yet'} active={agentCount > 0} />
      </div>
    </div>
  );
}

// ─── Inline field error ───────────────────────────────────────────────────────

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-xs text-red-500 mt-1">{message}</p>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateVaultPage() {
  const router = useRouter();
  const { registry, signer, isConnected, isRegistryConfigured } = useWeb3();
  const { t } = useI18n();

  // Form state
  const [label, setLabel]                         = useState('My Vault');
  const [budget, setBudget]                       = useState('0.5');
  const [period, setPeriod]                       = useState('1');
  const [hasExpiry, setHasExpiry]                 = useState(false);
  const [expiryDate, setExpiryDate]               = useState('');
  const [agents, setAgents]                       = useState('');
  const [usePerAgentBudgets, setUsePerAgentBudgets] = useState(false);
  const [agentBudgetMap, setAgentBudgetMap]       = useState<Record<string, string>>({});
  const [merchants, setMerchants]                 = useState('');
  const [status, setStatus]                       = useState('');
  const [loading, setLoading]                     = useState(false);
  const [deployed, setDeployed]                   = useState<{ safe: string; keyManager: string; policyEngine: string } | null>(null);

  // Wizard
  const [step, setStep]                           = useState(1);
  const [activeTemplate, setActiveTemplate]       = useState<string | null>(null);
  const [stepTouched, setStepTouched]             = useState<Record<number, boolean>>({});

  // Picker modal
  const [pickerOpen, setPickerOpen]               = useState<'agents' | 'merchants' | null>(null);

  // Derived
  const rawAgentList   = agents.split(',').map((a) => a.trim()).filter(Boolean);
  const merchantCount  = merchants.split(',').map((m) => m.trim()).filter(Boolean).length;

  // Validation
  const labelError  = stepTouched[1] && label.trim().length < 2  ? 'Vault name must be at least 2 characters.' : null;
  const budgetError = stepTouched[1] && (!budget || parseFloat(budget) <= 0) ? 'Budget must be greater than 0.' : null;
  const expiryError = stepTouched[2] && hasExpiry && !expiryDate  ? 'Please select an expiration date.'         : null;

  const step1Valid = label.trim().length >= 2 && !!budget && parseFloat(budget) > 0;
  const step2Valid = !hasExpiry || !!expiryDate;

  const stepLabels = [t('create.step1.title'), t('create.step2.title'), t('create.step3.title')];

  const applyTemplate = (cfg: TemplateConfig) => {
    setBudget(cfg.budget);
    setPeriod(cfg.period);
    setHasExpiry(cfg.hasExpiry);
    setExpiryDate(cfg.expiryDate);
    setAgents(cfg.agents);
    setMerchants(cfg.merchants);
    setUsePerAgentBudgets(false);
    setAgentBudgetMap({});
    setActiveTemplate(cfg.id);
    setStepTouched({});
    setStep(1);
  };

  /** Merge picker-selected addresses into an existing comma-separated string */
  const mergeAddresses = (existing: string, incoming: string[]) => {
    const current = existing.split(',').map((a) => a.trim()).filter(Boolean).map((a) => a.toLowerCase());
    const toAdd = incoming.filter((a) => !current.includes(a.toLowerCase()));
    const parts = existing.trim() ? [existing.trim(), ...toAdd] : toAdd;
    return parts.join(', ');
  };

  const handleAgentsPicked = (addresses: string[]) => {
    setAgents((prev) => mergeAddresses(prev, addresses));
    setAgentBudgetMap({});
  };

  const handleMerchantsPicked = (addresses: string[]) => {
    setMerchants((prev) => mergeAddresses(prev, addresses));
  };

  const handleStep1Next = () => {
    setStepTouched((p) => ({ ...p, 1: true }));
    if (step1Valid) setStep(2);
  };

  const handleStep2Next = () => {
    setStepTouched((p) => ({ ...p, 2: true }));
    if (step2Valid) setStep(3);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRegistryConfigured) {
      setStatus('Error: Registry address not configured. Set NEXT_PUBLIC_REGISTRY_ADDRESS in .env.local.');
      return;
    }
    if (!registry || !signer) {
      setStatus('Error: Connect your wallet first.');
      return;
    }

    setLoading(true);
    setStatus('');
    try {
      const owner = await signer.getAddress();
      const existingVaults = await registry.getVaults(owner);
      const existingSafeAddresses = new Set(existingVaults.map((v) => v.safe.toLowerCase()));

      const agentList   = parseAddressList(agents, 'Agents');
      const merchantList = parseAddressList(merchants, 'Merchant whitelist');
      const expirationUnix =
        hasExpiry && expiryDate
          ? BigInt(Math.floor(new Date(expiryDate).getTime() / 1000))
          : BigInt(0);

      if (hasExpiry && expiryDate && expirationUnix <= BigInt(Math.floor(Date.now() / 1000))) {
        throw new Error('Expiration date must be in the future.');
      }

      const agentBudgetsList =
        usePerAgentBudgets && agentList.length > 0
          ? agentList.map((addr) => {
              const configured = agentBudgetMap[addr];
              if (!configured) throw new Error(`Missing budget for agent ${addr}.`);
              return ethers.parseEther(configured);
            })
          : [];

      setStatus('Sending transaction…');
      const tx = await registry.deployVault({
        budget: ethers.parseEther(budget),
        period: Number(period),
        budgetToken: ethers.ZeroAddress,
        expiration: expirationUnix,
        agents: agentList,
        agentBudgets: agentBudgetsList,
        merchants: merchantList,
        label,
      });

      setStatus('Waiting for confirmation…');
      const receipt = await tx.wait();
      if (!receipt) throw new Error('Transaction receipt not available');

      const iface = registry.interface;
      let safeAddr = '', kmAddr = '', peAddr = '';
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === 'VaultDeployed') {
            safeAddr = parsed.args.safe;
            kmAddr   = parsed.args.keyManager;
            peAddr   = parsed.args.policyEngine;
          }
        } catch { /* ignore unrelated logs */ }
      }

      if (!safeAddr) {
        const latest = await registry.getVaults(owner);
        const found =
          latest.find((v) => !existingSafeAddresses.has(v.safe.toLowerCase()) && v.label === label) ??
          latest.find((v) => !existingSafeAddresses.has(v.safe.toLowerCase()));
        if (found) { safeAddr = found.safe; kmAddr = found.keyManager; peAddr = found.policyEngine; }
      }

      if (!safeAddr) {
        setStatus(`Vault deployed (tx: ${receipt.hash}), but deployed addresses could not be recovered. Check the explorer or refresh your vault list.`);
      } else {
        setDeployed({ safe: safeAddr, keyManager: kmAddr, policyEngine: peAddr });
        setStatus('Vault deployed!');
      }
    } catch (err: unknown) {
      setStatus('Error: ' + getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────────
  if (deployed) {
    return (
      <div className="space-y-lg max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">{t('create.success.title')}</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-xs">{t('create.success.subtitle')}</p>
        </div>
        <Alert variant="success">
          <AlertTitle>{t('create.success.ownership.title')}</AlertTitle>
          <AlertDescription>
            {t('create.success.ownership.desc').split('acceptOwnership()').map((part, i) =>
              i === 0 ? part : (
                <span key={i}>
                  <code className="font-mono text-xs bg-neutral-100 dark:bg-neutral-700 px-1 rounded">acceptOwnership()</code>
                  {part}
                </span>
              )
            )}
          </AlertDescription>
        </Alert>
        <Card>
          <CardContent>
            <div className="space-y-md text-sm font-mono">
              {[
                { label: 'Safe', value: deployed.safe },
                { label: 'KeyManager', value: deployed.keyManager },
                { label: 'PolicyEngine', value: deployed.policyEngine },
              ].map(({ label: lbl, value }) => (
                <div key={lbl}>
                  <p className="text-neutral-500 dark:text-neutral-400 font-sans text-xs uppercase tracking-wide mb-xs">{lbl}</p>
                  <p className="text-neutral-900 dark:text-neutral-100 break-all">{value || '—'}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="flex gap-md">
          <Button variant="primary" onClick={() => router.push('/vaults')}>{t('create.success.view_vaults')}</Button>
          <Button variant="secondary" onClick={() => { setDeployed(null); setStatus(''); setStep(1); }}>
            {t('create.success.create_another')}
          </Button>
        </div>
      </div>
    );
  }

  // ── Wizard ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-lg max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">{t('create.title')}</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-xs">{t('create.subtitle')}</p>
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

      {/* Template picker — full width, step 1 only */}
      {step === 1 && (
        <div>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-sm">{t('create.template_prompt')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-sm">
            {TEMPLATE_CONFIGS.map((cfg) => {
              const style = TEMPLATE_STYLE[cfg.id];
              const isActive = activeTemplate === cfg.id;
              return (
                <button
                  key={cfg.id}
                  type="button"
                  onClick={() => applyTemplate(cfg)}
                  className={cn(
                    'text-left p-4 rounded-xl border-2 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500',
                    isActive ? style.active : cn(style.base, style.hover)
                  )}
                >
                  <span className="text-2xl block mb-2">{style.emoji}</span>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 leading-tight">
                    {t(`create.template.${cfg.id}.name` as Parameters<typeof t>[0])}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                    {t(`create.template.${cfg.id}.desc` as Parameters<typeof t>[0])}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step indicator + two-column layout */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-lg space-y-lg lg:space-y-0">
        {/* Left: form (2 cols) */}
        <div className="lg:col-span-2 space-y-md">
          <StepIndicator current={step} steps={stepLabels} />

          {/* ── Step 1: Basics ─────────────────────────────────────────────── */}
          {step === 1 && (
            <Card>
              <CardHeader><CardTitle>{t('create.step1.title')}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-md">
                  <div>
                    <label className="label">{t('create.field.label')}</label>
                    <input
                      className={cn('input', labelError && 'border-red-400 focus:ring-red-400')}
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="e.g., Groceries Vault"
                    />
                    <FieldError message={labelError} />
                  </div>

                  <div className="grid grid-cols-2 gap-md">
                    <div>
                      <label className="label">{t('create.field.budget')}</label>
                      <input
                        className={cn('input', budgetError && 'border-red-400 focus:ring-red-400')}
                        type="number"
                        step="0.0001"
                        min="0"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                      />
                      <FieldError message={budgetError} />
                    </div>
                    <div>
                      <label className="label">{t('create.field.period')}</label>
                      <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
                        <option value="0">{t('create.field.period.daily')}</option>
                        <option value="1">{t('create.field.period.weekly')}</option>
                        <option value="2">{t('create.field.period.monthly')}</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-sm">
                    <Button type="button" variant="primary" onClick={handleStep1Next}>
                      {t('create.btn.next_rules')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 2: Protection rules ────────────────────────────────────── */}
          {step === 2 && (
            <Card>
              <CardHeader><CardTitle>{t('create.step2.title')}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-md">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('create.step2.subtitle')}</p>

                  <div className="space-y-sm">
                    <label className="flex items-center gap-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasExpiry}
                        onChange={(e) => { setHasExpiry(e.target.checked); if (!e.target.checked) setExpiryDate(''); }}
                        className="rounded"
                      />
                      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {t('create.field.expiry_toggle')}
                      </span>
                    </label>
                    {hasExpiry && (
                      <div>
                        <label className="label">{t('create.field.expiry_date')}</label>
                        <input
                          className={cn('input', expiryError && 'border-red-400 focus:ring-red-400')}
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
                    <div className="flex items-center justify-between mb-xs">
                      <label className="label !mb-0">{t('create.field.merchants')}</label>
                      <button
                        type="button"
                        onClick={() => setPickerOpen('merchants')}
                        className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 flex items-center gap-1"
                      >
                        <span>👥</span> {t('picker.browse')}
                      </button>
                    </div>
                    <input
                      className="input"
                      value={merchants}
                      onChange={(e) => setMerchants(e.target.value)}
                      placeholder="0xabcd…, 0xef01… (comma-separated)"
                    />
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-xs">{t('create.field.merchants_hint')}</p>
                  </div>

                  <div className="flex justify-between pt-sm">
                    <Button type="button" variant="secondary" onClick={() => setStep(1)}>Back</Button>
                    <div className="flex gap-sm">
                      <Button type="button" variant="secondary" onClick={() => { setHasExpiry(false); setExpiryDate(''); setMerchants(''); setStep(3); }}>
                        Skip
                      </Button>
                      <Button type="button" variant="primary" onClick={handleStep2Next}>
                        {t('create.btn.next_agents')}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 3: Agents ──────────────────────────────────────────────── */}
          {step === 3 && (
            <form onSubmit={onSubmit}>
              <Card>
                <CardHeader><CardTitle>{t('create.step3.title')}</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-md">
                    <Alert variant="info">
                      <AlertDescription>
                        {t('create.agents_info')}{' '}
                        <Link href="/agents" className="underline font-medium">{t('create.agents_browse')}</Link>
                      </AlertDescription>
                    </Alert>

                    <div>
                      <div className="flex items-center justify-between mb-xs">
                        <label className="label !mb-0">{t('create.field.agents')}</label>
                        <button
                          type="button"
                          onClick={() => setPickerOpen('agents')}
                          className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 flex items-center gap-1"
                        >
                          <span>👥</span> {t('picker.browse')}
                        </button>
                      </div>
                      <input
                        className="input"
                        value={agents}
                        onChange={(e) => { setAgents(e.target.value); setAgentBudgetMap({}); }}
                        placeholder="0x1234…, 0x5678… (comma-separated)"
                      />
                    </div>

                    {rawAgentList.length > 0 && (
                      <div className="space-y-sm">
                        <label className="flex items-center gap-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={usePerAgentBudgets}
                            onChange={(e) => setUsePerAgentBudgets(e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                            {t('create.field.per_agent_toggle')}
                          </span>
                        </label>
                        {usePerAgentBudgets && (
                          <div className="space-y-xs pl-md border-l-2 border-neutral-200 dark:border-neutral-700">
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('create.field.per_agent_hint')}</p>
                            {rawAgentList.map((addr) => {
                              const key = ethers.isAddress(addr) ? ethers.getAddress(addr) : addr;
                              return (
                                <div key={addr} className="flex items-center gap-sm">
                                  <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400 w-36 truncate">
                                    {addr.slice(0, 10)}…{addr.slice(-6)}
                                  </span>
                                  <input
                                    className="input text-sm"
                                    type="number"
                                    step="0.0001"
                                    min="0"
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

                    <div className="flex justify-between pt-sm">
                      <Button type="button" variant="secondary" onClick={() => setStep(2)}>Back</Button>
                      <div className="flex gap-sm">
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
                  </div>
                </CardContent>
              </Card>
            </form>
          )}
        </div>

        {/* Right: live preview (1 col) */}
        <div className="hidden lg:block">
          <VaultPreview
            vaultLabel={label}
            budget={budget}
            period={period}
            hasExpiry={hasExpiry}
            expiryDate={expiryDate}
            agentCount={rawAgentList.length}
            merchantCount={merchantCount}
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
