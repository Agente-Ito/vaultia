'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';
import { useWeb3 } from '@/context/Web3Context';
import { useMode } from '@/context/ModeContext';
import { useMissionActions } from '@/hooks/useMissionActions';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Alert, AlertDescription } from '@/components/common/Alert';
import {
  MISSION_PRESETS,
  MISSION_TYPES,
  MissionType,
  MISSION_PERMISSIONS,
} from '@/lib/missions/missionTypes';
import { getDefaultPolicyConfig } from '@/lib/missions/permissionCompiler';
import { cn } from '@/lib/utils/cn';
import { useVaults } from '@/hooks/useVaults';

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS = ['Type', 'Config', 'Key', 'Create'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1">
          <div
            className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
              i < current
                ? 'bg-green-500 text-white'
                : i === current
                ? 'bg-primary-600 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500'
            )}
          >
            {i < current ? <span className="h-2.5 w-2.5 rounded-full bg-white" /> : i + 1}
          </div>
          <span
            className={cn(
              'text-xs hidden sm:block',
              i === current
                ? 'text-neutral-900 dark:text-white font-medium'
                : 'text-neutral-400'
            )}
          >
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                'w-6 h-px mx-1',
                i < current ? 'bg-green-400' : 'bg-neutral-200 dark:bg-neutral-700'
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Mission type selector ────────────────────────────────────────────

function Step1TypeSelect({
  selected,
  onSelect,
}: {
  selected: MissionType | null;
  onSelect: (t: MissionType) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
        {t('missions.create.step1')}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MISSION_TYPES.map((type) => {
          const preset = MISSION_PRESETS[type];
          const isSelected = selected === type;
          const isComingSoon = !!preset.comingSoon;
          return (
            <button
              key={type}
              onClick={isComingSoon ? undefined : () => onSelect(type)}
              disabled={isComingSoon}
              aria-disabled={isComingSoon}
              className={cn(
                'text-left rounded-xl border-2 p-4 transition-all space-y-2',
                isComingSoon
                  ? 'opacity-60 cursor-default border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800'
                  : isSelected
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 bg-white dark:bg-neutral-800'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{preset.emoji}</span>
                <div className="flex items-center gap-1">
                  {isComingSoon && (
                    <Badge variant="warning" className="text-xs">Coming soon</Badge>
                  )}
                  {!preset.stable && !isComingSoon && (
                    <Badge variant="neutral" className="text-xs">Beta</Badge>
                  )}
                  {!isComingSoon && (
                    <Badge
                      variant={
                        preset.riskLevel === 'high' ? 'danger' :
                        preset.riskLevel === 'medium' ? 'warning' : 'success'
                      }
                      className="text-xs"
                    >
                      {preset.riskLevel} risk
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <p className="font-semibold text-sm text-neutral-900 dark:text-white">
                  {preset.label}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {preset.tagline}
                </p>
              </div>
              <ul className="space-y-1">
                {preset.rulesPreview.map((r, i) => (
                  <li key={i} className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    {r}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-orange-600 dark:text-orange-400">
                ⚠ {preset.riskLabel}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 2: Config ───────────────────────────────────────────────────────────

interface MissionConfig {
  label: string;
  vaultSafe: string;
  allowedTargets: string;
  budgetLYX: number;
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'HOURLY' | 'FIVE_MINUTES';
}

function Step2Config({
  missionType,
  config,
  onChange,
  vaults,
  isAdvanced,
}: {
  missionType: MissionType;
  config: MissionConfig;
  onChange: (c: MissionConfig) => void;
  vaults: Array<{ safe: string; keyManager: string; policyEngine: string; label: string }>;
  isAdvanced: boolean;
}) {
  const { t } = useI18n();
  const preset = MISSION_PRESETS[missionType];
  const defaults = getDefaultPolicyConfig(missionType);

  const set = (partial: Partial<MissionConfig>) => onChange({ ...config, ...partial });

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
        {t('missions.create.step2')}
      </h2>

      {/* Mission label */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Mission name
        </label>
        <input
          type="text"
          value={config.label}
          onChange={(e) => set({ label: e.target.value })}
          placeholder={`e.g. ${preset.label}`}
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Vault select */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Vault
        </label>
        {vaults.length === 0 ? (
          <p className="text-sm text-orange-600 dark:text-orange-400">
            No vaults found. <a href="/vaults/create" className="underline">Create one first.</a>
          </p>
        ) : (
          <select
            value={config.vaultSafe}
            onChange={(e) => set({ vaultSafe: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">— Select vault —</option>
            {vaults.map((v) => (
              <option key={v.safe} value={v.safe}>
                {v.label || v.safe.slice(0, 12) + '…'}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Allowed targets */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          {t('missions.create.targets_label')}
        </label>
        <textarea
          rows={4}
          value={config.allowedTargets}
          onChange={(e) => set({ allowedTargets: e.target.value })}
          placeholder={t('missions.create.targets_placeholder')}
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <p className="text-xs text-neutral-400 mt-1">
          {preset.rulesPreview[0]}
        </p>
      </div>

      {/* Budget & period */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            {t('missions.create.budget_label')} (LYX)
          </label>
          <input
            type="number"
            min={0}
            value={config.budgetLYX}
            onChange={(e) => set({ budgetLYX: Number(e.target.value) })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p className="text-xs text-neutral-400 mt-1">
            Suggested: {defaults.budgetHint} LYX
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            {t('missions.create.period_label')}
          </label>
          <select
            value={config.period}
            onChange={(e) => set({ period: e.target.value as MissionConfig['period'] })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="DAILY">{t('missions.create.period.daily')}</option>
            <option value="WEEKLY">{t('missions.create.period.weekly')}</option>
            <option value="MONTHLY">{t('missions.create.period.monthly')}</option>
            <option value="HOURLY">{t('missions.create.period.hourly')}</option>
            <option value="FIVE_MINUTES">{t('missions.create.period.five_minutes')}</option>
          </select>
        </div>
      </div>

      {/* Advanced: show LSP6 permission bits */}
      {isAdvanced && (
        <details className="group">
          <summary className="text-xs text-neutral-500 cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-300">
            {t('missions.create.advanced_mode')}
          </summary>
          <div className="mt-3 space-y-2 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-700/30 border border-neutral-200 dark:border-neutral-600">
            <div>
              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">LSP6 Permission bits</p>
              <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                0x{MISSION_PERMISSIONS[missionType].toString(16).padStart(64, '0')}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Risk</p>
              <p className="text-xs text-orange-600 dark:text-orange-400">{preset.riskLabel}</p>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

// ─── Step 3: Key generation + passphrase ──────────────────────────────────────

function Step3Key({
  passphrase,
  confirm,
  onChange,
}: {
  passphrase: string;
  confirm: string;
  onChange: (p: string, c: string) => void;
}) {
  const { t } = useI18n();
  const mismatch = confirm.length > 0 && passphrase !== confirm;
  const tooShort = passphrase.length > 0 && passphrase.length < 8;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
        {t('missions.create.step3')}
      </h2>
      <Alert variant="info">
        <AlertDescription>
          A fresh controller keypair will be generated in your browser and encrypted with your password.
          The private key never leaves your device unencrypted.
        </AlertDescription>
      </Alert>

      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          {t('missions.create.passphrase_label')}
        </label>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => onChange(e.target.value, confirm)}
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <p className="text-xs text-neutral-400 mt-1">
          {t('missions.create.passphrase_hint')}
        </p>
        {tooShort && (
          <p className="text-xs text-amber-500 mt-1">Minimum 8 characters required.</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          {t('missions.create.passphrase_confirm')}
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => onChange(passphrase, e.target.value)}
          className={cn(
            'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2',
            mismatch
              ? 'border-red-400 focus:ring-red-400'
              : 'border-neutral-300 dark:border-neutral-600 focus:ring-primary-500'
          )}
        />
        {mismatch && (
          <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>
        )}
      </div>

      <p className="text-xs text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5">
        <span>🔒</span>
        <span>{t('missions.trust_copy')}</span>
      </p>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function MissionCreateWizard() {
  const { t } = useI18n();
  const router = useRouter();
  const { signer, account, registry } = useWeb3();
  const { isAdvanced } = useMode();
  const { createMission, creating, error } = useMissionActions();
  const { vaults } = useVaults(registry, account);

  const [step, setStep] = useState(0);
  const [missionType, setMissionType] = useState<MissionType | null>(null);
  const [config, setConfig] = useState<MissionConfig>({
    label: '',
    vaultSafe: '',
    allowedTargets: '',
    budgetLYX: 200,
    period: 'MONTHLY',
  });
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');

  const canNextStep0 = !!missionType;
  const canNextStep1 =
    config.label.trim() !== '' &&
    config.vaultSafe !== '' &&
    config.allowedTargets.trim() !== '' &&
    config.budgetLYX > 0;
  const canNextStep2 =
    passphrase.length >= 8 && passphrase === passphraseConfirm;

  const handleDeploy = async () => {
    if (!signer || !missionType) return;
    // Find the keyManager for the selected vault
    const vaultRecord = vaults.find((v) => v.safe === config.vaultSafe);
    if (!vaultRecord) return;

    const targets = config.allowedTargets
      .split('\n')
      .map((a) => a.trim())
      .filter((a) => a.startsWith('0x'));

    const result = await createMission(
      config.vaultSafe,
      vaultRecord.keyManager,
      {
        label: config.label,
        type: missionType,
        allowedTargets: targets,
        budgetLYX: config.budgetLYX,
        period: config.period,
        vaultLabel: vaultRecord.label,
      },
      passphrase,
      signer
    );

    if (result) router.push('/missions');
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => step > 0 ? setStep(step - 1) : router.push('/missions')}
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          ← {t('common.back')}
        </button>
        <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
          {t('missions.create_cta')}
        </h1>
      </div>

      <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm p-6">
        <StepIndicator current={step} />

        {step === 0 && (
          <Step1TypeSelect selected={missionType} onSelect={setMissionType} />
        )}

        {step === 1 && missionType && (
          <Step2Config
            missionType={missionType}
            config={config}
            onChange={setConfig}
            vaults={vaults}
            isAdvanced={isAdvanced}
          />
        )}

        {step === 2 && (
          <Step3Key
            passphrase={passphrase}
            confirm={passphraseConfirm}
            onChange={(p, c) => { setPassphrase(p); setPassphraseConfirm(c); }}
          />
        )}

        {step === 3 && missionType && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {t('missions.create.step4')}
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Mission type</dt>
                <dd className="font-medium">{MISSION_PRESETS[missionType].emoji} {MISSION_PRESETS[missionType].label}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Name</dt>
                <dd className="font-medium">{config.label}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Budget</dt>
                <dd className="font-medium">{config.budgetLYX} LYX / {config.period.toLowerCase()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Targets</dt>
                <dd className="font-medium">
                  {config.allowedTargets.split('\n').filter((a) => a.trim().startsWith('0x')).length} address(es)
                </dd>
              </div>
            </dl>
            <Alert variant="info">
              <AlertDescription>
                A new controller keypair will be generated and permissions written to your vault.
                Signing required from your connected wallet.
              </AlertDescription>
            </Alert>
            {error && (
              <Alert variant="error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-3 mt-8">
          {step > 0 && (
            <Button variant="secondary" size="md" className="flex-1" onClick={() => setStep(step - 1)}>
              {t('common.back')}
            </Button>
          )}
          {step < 3 && (
            <Button
              variant="primary"
              size="md"
              className="flex-1"
              disabled={
                (step === 0 && !canNextStep0) ||
                (step === 1 && !canNextStep1) ||
                (step === 2 && !canNextStep2)
              }
              onClick={() => setStep(step + 1)}
            >
              {t('common.next')}
            </Button>
          )}
          {step === 3 && (
            <Button
              variant="primary"
              size="md"
              className="flex-1"
              disabled={creating || !signer}
              onClick={handleDeploy}
            >
              {creating ? 'Creating…' : 'Create Mission'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
