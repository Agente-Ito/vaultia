'use client';

import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useWeb3 } from '@/context/Web3Context';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { KillSwitch } from './KillSwitch';
import { ExecutionLog } from './ExecutionLog';
import { useMissionActions } from '@/hooks/useMissionActions';
import { useExecutionLogs } from '@/hooks/useExecutionLogs';
import { MissionRecord } from '@/lib/missions/missionStore';
import { MISSION_PRESETS, MissionType } from '@/lib/missions/missionTypes';
import { cn } from '@/lib/utils/cn';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function StatusBadge({ status }: { status: MissionRecord['status'] }) {
  const variant =
    status === 'active' ? 'success' :
    status === 'paused' ? 'warning' :
    status === 'revoked' ? 'danger' : 'neutral';
  const label =
    status === 'active' ? '● Active' :
    status === 'paused' ? '⏸ Paused' :
    status === 'revoked' ? '✕ Revoked' : '⚠ Error';
  return <Badge variant={variant}>{label}</Badge>;
}

// ─── Agent Run button ─────────────────────────────────────────────────────────

interface RunButtonProps {
  mission: MissionRecord;
  disabled: boolean;
}

function RunButton({ mission, disabled }: RunButtonProps) {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);

  const handleRun = async () => {
    setRunning(true);
    setRunStatus('Starting agent…');
    try {
      const res = await fetch('/api/runner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId: mission.id, vaultSafe: mission.vaultSafe }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { runId } = await res.json();

      // Poll status
      let done = false;
      while (!done) {
        await new Promise((r) => setTimeout(r, 2000));
        const statusRes = await fetch(`/api/runner/status/${runId}`);
        const { status, message } = await statusRes.json();
        setRunStatus(message ?? status);
        if (status === 'done' || status === 'error') done = true;
      }
    } catch (err: unknown) {
      setRunStatus(err instanceof Error ? err.message : 'Error');
    } finally {
      setRunning(false);
      setTimeout(() => setRunStatus(null), 5000);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || running}
        onClick={handleRun}
      >
        {running ? '⏳ Running…' : `▶ ${t('missions.run_agent')}`}
      </Button>
      {runStatus && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate max-w-[180px]">
          {runStatus}
        </p>
      )}
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
    <div className={cn(
      'bg-white dark:bg-neutral-800 rounded-xl border shadow-sm p-5 space-y-4',
      isRevoked
        ? 'border-neutral-200 dark:border-neutral-700 opacity-60'
        : 'border-neutral-200 dark:border-neutral-700'
    )}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl flex-shrink-0">
            {preset?.emoji ?? '🎯'}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white truncate">
                {mission.label}
              </h3>
              <StatusBadge status={mission.status} />
              {preset && !preset.stable && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500">
                  Beta
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {preset?.tagline ?? mission.type}
            </p>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        <div>
          <span className="font-medium text-neutral-700 dark:text-neutral-300">Controller</span>
          <span className="ml-1 font-mono">{truncate(mission.controllerAddress)}</span>
          <button
            className="ml-1 text-neutral-400 hover:text-neutral-600"
            onClick={() => navigator.clipboard.writeText(mission.controllerAddress)}
            title="Copy address"
          >
            ⎘
          </button>
        </div>
        {mission.vaultLabel && (
          <div>
            <span className="font-medium text-neutral-700 dark:text-neutral-300">Vault</span>
            <span className="ml-1">{mission.vaultLabel}</span>
          </div>
        )}
        <div>
          <span className="font-medium text-neutral-700 dark:text-neutral-300">Created</span>
          <span className="ml-1">{new Date(mission.createdAt).toLocaleDateString()}</span>
        </div>
        {preset && (
          <div>
            <span className="font-medium text-neutral-700 dark:text-neutral-300">Risk</span>
            <span className={cn(
              'ml-1',
              preset.riskLevel === 'high' ? 'text-red-500' :
              preset.riskLevel === 'medium' ? 'text-yellow-500' : 'text-green-500'
            )}>
              {preset.riskLabel}
            </span>
          </div>
        )}
      </div>

      {/* Execution log toggle */}
      {logs.length > 0 && (
        <button
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
          onClick={() => setShowLog(!showLog)}
        >
          {showLog ? '▲ Hide logs' : `▼ ${logs.length} execution log${logs.length > 1 ? 's' : ''}`}
        </button>
      )}
      {showLog && <ExecutionLog logs={logs} />}

      {/* Actions */}
      {!isRevoked && (
        <div className="flex items-center gap-3 pt-1 flex-wrap">
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
