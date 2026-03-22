'use client';

import { useState } from 'react';
import { ethers } from 'ethers';
import { useI18n } from '@/context/I18nContext';
import { useWeb3 } from '@/context/Web3Context';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { KillSwitch } from './KillSwitch';
import { ExecutionLog } from './ExecutionLog';
import { useMissionActions } from '@/hooks/useMissionActions';
import { useExecutionLogs } from '@/hooks/useExecutionLogs';
import { useControllerKey } from '@/hooks/useControllerKey';
import { MissionRecord } from '@/lib/missions/missionStore';
import { MISSION_PRESETS, MissionType } from '@/lib/missions/missionTypes';
import { getReadOnlyProvider } from '@/lib/web3/provider';
import { cn } from '@/lib/utils/cn';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─── ABIs for browser-side runner ────────────────────────────────────────────

const KM_RUN_ABI = [
  'function execute(uint256 operationType, address target, uint256 value, bytes calldata data) external payable returns (bytes memory)',
];
const SAFE_RUN_ABI = [
  'function agentExecute(address payable to, uint256 amount, bytes calldata data) external',
  'function policyEngine() view returns (address)',
];
const PE_RUN_ABI = [
  'function simulateExecution(address agent, address token, address to, uint256 amount, bytes calldata data) external',
];
const SAFE_RUN_IFACE = new ethers.Interface(SAFE_RUN_ABI);

function StatusBadge({ status }: { status: MissionRecord['status'] }) {
  const variant =
    status === 'active' ? 'success' :
    status === 'paused' ? 'warning' :
    status === 'revoked' ? 'danger' : 'neutral';
  return (
    <Badge variant={variant}>
      {status === 'active' && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 animate-status-pulse"
          style={{ background: 'currentColor' }}
        />
      )}
      {status === 'active' ? 'Active' :
       status === 'paused' ? '⏸ Paused' :
       status === 'revoked' ? '✕ Revoked' : '⚠ Error'}
    </Badge>
  );
}

// ─── Agent Run button (browser-side execution) ───────────────────────────────

type RunStep = 'idle' | 'unlock' | 'form' | 'running' | 'done' | 'error';

interface RunButtonProps {
  mission: MissionRecord;
  disabled: boolean;
}

function RunButton({ mission, disabled }: RunButtonProps) {
  const { t } = useI18n();
  const { registry } = useWeb3();
  const { isUnlocked, hasStoredKey, unlocking, unlockError, unlock, getWallet } =
    useControllerKey(mission.id);

  const [step, setStep] = useState<RunStep>('idle');
  const [passphrase, setPassphrase] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const reset = () => {
    setStep('idle');
    setPassphrase('');
    setTo('');
    setAmount('');
    setRunMsg(null);
    setTxHash(null);
  };

  const handleOpen = () => setStep(isUnlocked ? 'form' : 'unlock');

  const handleUnlock = async () => {
    const ok = await unlock(passphrase);
    if (ok) {
      setPassphrase('');
      setStep('form');
    }
  };

  const handleExecute = async () => {
    setStep('running');
    setRunMsg(t('missions.run.simulating'));
    setTxHash(null);
    try {
      if (!ethers.isAddress(to)) throw new Error('Invalid recipient address');
      const amountWei = ethers.parseEther(amount || '0');
      if (amountWei <= BigInt(0)) throw new Error('Amount must be greater than 0');

      const provider = getReadOnlyProvider();
      const wallet = getWallet(provider);
      if (!wallet) throw new Error('Controller key not available — please unlock again');

      const kmAddress = await (registry as { getKeyManager(s: string): Promise<string> })
        ?.getKeyManager(mission.vaultSafe);
      if (!kmAddress) throw new Error('Could not resolve KeyManager');

      const safeContract = new ethers.Contract(mission.vaultSafe, SAFE_RUN_ABI, provider);
      const policyEngineAddress: string = await safeContract.policyEngine();

      const pe = new ethers.Contract(policyEngineAddress, PE_RUN_ABI, provider);
      await pe.simulateExecution.staticCall(
        mission.controllerAddress,
        ethers.ZeroAddress,
        to,
        amountWei,
        '0x'
      );

      setRunMsg(t('missions.run.executing'));
      const km = new ethers.Contract(kmAddress, KM_RUN_ABI, wallet);
      const calldata = SAFE_RUN_IFACE.encodeFunctionData('agentExecute', [to, amountWei, '0x']);
      const tx = await km.execute(0, mission.vaultSafe, 0, calldata);
      await tx.wait();

      setTxHash(tx.hash);
      setStep('done');
    } catch (err: unknown) {
      setRunMsg(err instanceof Error ? err.message : 'Execution failed');
      setStep('error');
    }
  };

  if (step === 'idle') {
    return (
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || !hasStoredKey}
        onClick={handleOpen}
        title={!hasStoredKey ? 'No controller key stored for this mission' : undefined}
      >
        {`▶ ${t('missions.run_agent')}`}
      </Button>
    );
  }

  if (step === 'unlock') {
    return (
      <div className="flex flex-col gap-2 min-w-[220px]">
        <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {t('missions.unlock_title')}
        </p>
        <input
          type="password"
          className="text-xs rounded-lg px-3 py-1.5 focus:outline-none"
          style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
          placeholder={t('missions.unlock_placeholder')}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
          autoFocus
        />
        {unlockError && <p className="text-xs text-red-500">{unlockError}</p>}
        <div className="flex gap-2">
          <Button size="sm" disabled={unlocking || !passphrase} onClick={handleUnlock}>
            {unlocking ? '…' : t('missions.unlock_cta')}
          </Button>
          <Button variant="ghost" size="sm" onClick={reset}>{t('common.cancel')}</Button>
        </div>
      </div>
    );
  }

  if (step === 'form') {
    return (
      <div className="flex flex-col gap-2 min-w-[220px]">
        <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {t('missions.run.title')}
        </p>
        <input
          type="text"
          className="text-xs rounded-lg px-3 py-1.5 focus:outline-none font-mono"
          style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
          placeholder={t('missions.run.to_placeholder')}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <input
          type="number"
          min="0"
          step="any"
          className="text-xs rounded-lg px-3 py-1.5 focus:outline-none"
          style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
          placeholder={t('missions.run.amount_placeholder')}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <div className="flex gap-2">
          <Button size="sm" disabled={!to || !amount} onClick={handleExecute}>
            {t('missions.run.execute_cta')}
          </Button>
          <Button variant="ghost" size="sm" onClick={reset}>{t('common.cancel')}</Button>
        </div>
      </div>
    );
  }

  if (step === 'running') {
    return (
      <p className="text-xs text-neutral-500 animate-pulse">{runMsg}</p>
    );
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs text-green-600 dark:text-green-400 font-medium">
          {t('missions.run.success')}
        </p>
        {txHash && (
          <p
            className="text-xs font-mono text-neutral-400 truncate max-w-[220px] cursor-pointer hover:text-neutral-600"
            title={txHash}
            onClick={() => navigator.clipboard.writeText(txHash)}
          >
            {truncate(txHash)}
          </p>
        )}
        <Button variant="ghost" size="sm" onClick={reset}>{t('common.back')}</Button>
      </div>
    );
  }

  // error
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-red-500 truncate max-w-[220px]">{runMsg}</p>
      <Button variant="ghost" size="sm" onClick={reset}>{t('common.back')}</Button>
    </div>
  );
}

// ─── MissionCard ─────────────────────────────────────────────────────────────

interface MissionCardProps {
  mission: MissionRecord;
  onUpdate: () => void;
}

export function MissionCard({ mission, onUpdate }: MissionCardProps) {
  const { signer, registry } = useWeb3();
  const { revokeMission, revoking, pauseMission, pausing } = useMissionActions();
  const { logs } = useExecutionLogs(mission.vaultSafe, mission.controllerAddress);
  const [showLog, setShowLog] = useState(false);

  const preset = MISSION_PRESETS[mission.type as MissionType] ?? null;
  const isRevoked = mission.status === 'revoked';
  const isPaused = mission.status === 'paused';
  const canAct = !!signer && !isRevoked;

  const getKeyManagerAddress = async (): Promise<string> => {
    try {
      return await (registry as { getKeyManager(s: string): Promise<string> })?.getKeyManager(mission.vaultSafe) ?? '';
    } catch { return ''; }
  };

  const handlePause = async () => {
    if (!signer) return;
    const keyManagerAddress = await getKeyManagerAddress();
    if (!keyManagerAddress) return;
    const ok = await pauseMission(mission, !isPaused, keyManagerAddress, signer);
    if (ok) onUpdate();
  };

  const handleKillSwitch = async () => {
    if (!signer) return;
    const keyManagerAddress = await getKeyManagerAddress();
    if (!keyManagerAddress) return;
    const ok = await revokeMission(mission, keyManagerAddress, signer);
    if (ok) onUpdate();
  };

  return (
    <div
      className={cn('rounded-xl p-5 space-y-4 overflow-hidden', isRevoked && 'opacity-60')}
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      {/* Top row */}
      <div className="flex items-start gap-3 min-w-0">
        <div
          className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-xl"
          style={{ background: 'var(--card-mid)' }}
        >
          {preset?.emoji ?? '🎯'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
              {mission.label}
            </h3>
            <StatusBadge status={mission.status} />
            {preset && !preset.stable && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--card-mid)', color: 'var(--text-muted)' }}
              >
                Beta
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {preset?.tagline ?? mission.type}
          </p>
        </div>
      </div>

      {/* Meta */}
      <div
        className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs pt-3"
        style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-1">
          <span className="font-medium" style={{ color: 'var(--text)' }}>Controller</span>
          <span className="font-mono">{truncate(mission.controllerAddress)}</span>
          <button
            onClick={() => navigator.clipboard.writeText(mission.controllerAddress)}
            className="transition-opacity hover:opacity-100 opacity-50"
            title="Copy address"
          >
            ⎘
          </button>
        </div>
        {mission.vaultLabel && (
          <div>
            <span className="font-medium" style={{ color: 'var(--text)' }}>Vault</span>
            <span className="ml-1">{mission.vaultLabel}</span>
          </div>
        )}
        <div>
          <span className="font-medium" style={{ color: 'var(--text)' }}>Created</span>
          <span className="ml-1">{new Date(mission.createdAt).toLocaleDateString()}</span>
        </div>
        {preset && (
          <div>
            <span className="font-medium" style={{ color: 'var(--text)' }}>Risk</span>
            <span
              className="ml-1"
              style={{
                color: preset.riskLevel === 'high' ? 'var(--blocked)' :
                       preset.riskLevel === 'medium' ? 'var(--warning)' : 'var(--success)',
              }}
            >
              {preset.riskLabel}
            </span>
          </div>
        )}
      </div>

      {/* Execution log toggle */}
      {logs.length > 0 && (
        <button
          className="text-xs transition-opacity hover:opacity-80"
          style={{ color: 'var(--accent)' }}
          onClick={() => setShowLog(!showLog)}
        >
          {showLog ? '▲ Hide logs' : `▼ ${logs.length} execution log${logs.length > 1 ? 's' : ''}`}
        </button>
      )}
      {showLog && <ExecutionLog logs={logs} />}

      {/* Actions */}
      {!isRevoked && (
        <div className="flex items-center gap-3 pt-1 flex-wrap" style={{ borderTop: '1px solid var(--border)' }}>
          <RunButton mission={mission} disabled={!canAct || isPaused} />
          <Button
            variant="secondary"
            size="sm"
            disabled={!canAct || pausing}
            onClick={handlePause}
          >
            {pausing
              ? isPaused ? 'Resuming…' : 'Pausing…'
              : isPaused ? '▶ Resume' : '⏸ Pause'}
          </Button>
          <KillSwitch
            missionLabel={mission.label}
            disabled={!canAct || revoking}
            onConfirm={handleKillSwitch}
          />
        </div>
      )}
    </div>
  );
}
