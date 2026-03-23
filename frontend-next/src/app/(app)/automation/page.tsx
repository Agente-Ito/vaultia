'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Interface, ethers } from 'ethers';
import { Button } from '@/components/common/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { TaskTimeline, type TaskRecord } from '@/components/automation/TaskTimeline';
import { NewTaskWizardModal, type NewTaskDraft } from '@/components/automation/NewTaskWizardModal';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { useMode } from '@/context/ModeContext';
import { useI18n } from '@/context/I18nContext';
import { getLocalizedErrorMessage, localizeErrorMessage } from '@/lib/errorMap';
import { loadVaultAutomationConstraints, minBigInt, minNumber } from '@/lib/automation/vaultConstraints';
import { getSchedulerContract } from '@/lib/web3/contracts';
import { getReadOnlyProvider } from '@/lib/web3/provider';
import { AP_ARRAY_KEY, apArrayElementKey, apPermissionsKey } from '@/lib/missions/permissionCompiler';

const SCHEDULER_ADDRESS = process.env.NEXT_PUBLIC_TASK_SCHEDULER_ADDRESS ?? '';
const keyManagerInterface = new Interface(['function execute(bytes _data)']);
const safeInterface = new Interface(['function execute(uint256 operation, address to, uint256 value, bytes data)']);
const safePermissionsInterface = new Interface([
  'function getData(bytes32 dataKey) view returns (bytes memory)',
  'function setDataBatch(bytes32[] dataKeys, bytes[] dataValues) external',
]);
const PERM_POWER_USER = '0x0000000000000000000000000000000000000000000000000000000000000500';

function getErrorMessage(error: unknown) {
  return getLocalizedErrorMessage(error, t => t);
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatLyxAmount(amount: bigint) {
  const normalized = ethers.formatEther(amount).replace(/\.0+$|(?<=\.[0-9]*?)0+$/u, '').replace(/\.$/u, '');
  return `${normalized} LYX`;
}

function hasNonZeroValue(value: string) {
  const normalized = value.toLowerCase().replace(/^0x/, '');
  return normalized.length > 0 && /[1-9a-f]/.test(normalized);
}

function getIntervalLabel(interval: number, triggerType: 'timestamp' | 'block', locale: 'en' | 'es', t: (key: string) => string) {
  if (triggerType === 'block') {
    const formatted = interval.toLocaleString(locale === 'es' ? 'es-MX' : 'en-US');
    return locale === 'es' ? `Cada ${formatted} bloques` : `Every ${formatted} blocks`;
  }

  if (interval === 300) return t('task_wizard.freq.five_minutes');
  if (interval === 3600) return t('task_wizard.freq.hourly');
  if (interval === 86400) return t('task_wizard.freq.daily');
  if (interval === 604800) return t('task_wizard.freq.weekly');
  if (interval === 2592000) return t('task_wizard.freq.monthly');

  const formatted = interval.toLocaleString(locale === 'es' ? 'es-MX' : 'en-US');
  return locale === 'es' ? `Cada ${formatted} s` : `Every ${formatted}s`;
}

function buildTaskRecord(
  taskId: string,
  task: [string, string, string, number, bigint, bigint, boolean, bigint],
  vaultLabel: string,
  locale: 'en' | 'es',
  t: (key: string) => string,
  limitActive?: boolean,
): TaskRecord {
  const [vault, , executeCalldata, triggerTypeValue, nextExecution, interval, enabled] = task;
  const triggerType = triggerTypeValue === 1 ? 'block' : 'timestamp';
  let recipientLabel = shortenAddress(vault);
  let amountLabel: string | undefined;

  try {
    const decodedKeyManager = keyManagerInterface.decodeFunctionData('execute', executeCalldata);
    const vaultExecutePayload = decodedKeyManager[0] as string;
    const decodedSafe = safeInterface.decodeFunctionData('execute', vaultExecutePayload);
    const recipient = decodedSafe[1] as string;
    const value = decodedSafe[2] as bigint;
    recipientLabel = shortenAddress(recipient);
    amountLabel = formatLyxAmount(value);
  } catch {
    amountLabel = undefined;
  }

  const nextExecutionDate = triggerType === 'timestamp'
    ? new Date(Number(nextExecution) * 1000)
    : new Date(Date.now() + Number(interval) * 12 * 1000);

  return {
    id: taskId,
    label: t('task_wizard.action.fixed_payment.title'),
    description: recipientLabel,
    botName: 'TaskScheduler',
    vaultLabel,
    nextExecution: nextExecutionDate,
    intervalLabel: getIntervalLabel(Number(interval), triggerType, locale, t),
    triggerType,
    enabled,
    amountLabel,
    limitActive,
  };
}

export default function AutomationPage() {
  const { registry, account, signer, isConnected } = useWeb3();
  const { vaults } = useVaults(registry, account);
  const { isAdvanced } = useMode();
  const { t, locale } = useI18n();

  const scheduler = useMemo(() => {
    if (!SCHEDULER_ADDRESS) return null;
    return getSchedulerContract(SCHEDULER_ADDRESS, signer ?? getReadOnlyProvider());
  }, [signer]);

  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [schedulerOwner, setSchedulerOwner] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [authorizedVaults, setAuthorizedVaults] = useState<Record<string, boolean>>({});

  const enabledCount = tasks.filter((task) => task.enabled).length;
  const isSchedulerConfigured = Boolean(SCHEDULER_ADDRESS);
  const schedulerBlockedReason = !isSchedulerConfigured
    ? t('automation.scheduler.not_configured')
    : !isConnected
      ? t('automation.scheduler.connect_wallet')
      : undefined;

  const loadAuthorizationState = useCallback(async () => {
    if (!signer || !SCHEDULER_ADDRESS || vaults.length === 0) {
      setAuthorizedVaults({});
      return;
    }

    const results = await Promise.all(vaults.map(async (vault) => {
      const safe = new ethers.Contract(vault.safe, safePermissionsInterface.fragments, signer);
      try {
        const permissions = await safe.getData(apPermissionsKey(SCHEDULER_ADDRESS));
        return [vault.safe.toLowerCase(), hasNonZeroValue(permissions)] as const;
      } catch {
        return [vault.safe.toLowerCase(), false] as const;
      }
    }));

    setAuthorizedVaults(Object.fromEntries(results));
  }, [signer, vaults]);

  const ensureSchedulerAuthorized = useCallback(async (vaultSafe: string) => {
    if (!signer || !SCHEDULER_ADDRESS) {
      throw new Error(t('automation.scheduler.connect_wallet'));
    }

    const safe = new ethers.Contract(vaultSafe, safePermissionsInterface.fragments, signer);
    const permissionKey = apPermissionsKey(SCHEDULER_ADDRESS);
    const existingPermissions: string = await safe.getData(permissionKey);

    if (hasNonZeroValue(existingPermissions)) {
      setAuthorizedVaults((previous) => ({ ...previous, [vaultSafe.toLowerCase()]: true }));
      return;
    }

    setTxStatus(t('automation.status.authorizing'));

    const lengthRaw: string = await safe.getData(AP_ARRAY_KEY);
    const currentLength = lengthRaw && lengthRaw !== '0x' ? Number(BigInt(lengthRaw)) : 0;
    const newLengthHex = `0x${(currentLength + 1).toString(16).padStart(32, '0')}`;

    const tx = await safe.setDataBatch(
      [permissionKey, apArrayElementKey(currentLength), AP_ARRAY_KEY],
      [PERM_POWER_USER, SCHEDULER_ADDRESS.toLowerCase(), newLengthHex],
    );
    await tx.wait();

    const verifiedPermissions: string = await safe.getData(permissionKey);
    if (!hasNonZeroValue(verifiedPermissions)) {
      throw new Error(t('automation.error.authorization_failed'));
    }

    setAuthorizedVaults((previous) => ({ ...previous, [vaultSafe.toLowerCase()]: true }));
    setTxStatus(t('automation.status.authorized'));
  }, [signer, t]);

  const loadTasks = useCallback(async () => {
    if (!scheduler) {
      setTasks([]);
      setTasksLoading(false);
      setTasksError(isSchedulerConfigured ? null : t('automation.scheduler.not_configured'));
      setSchedulerOwner(null);
      return;
    }

    setTasksLoading(true);
    setTasksError(null);

    try {
      const owner = await scheduler.owner();
      setSchedulerOwner(owner);

      if (!account || vaults.length === 0) {
        setTasks([]);
        return;
      }

      const taskIdGroups = await Promise.all(vaults.map((vault) => scheduler.getTasksForVault(vault.safe)));
      const uniqueTaskIds = [...new Set(taskIdGroups.flat())];

      if (uniqueTaskIds.length === 0) {
        setTasks([]);
        return;
      }

      const constraintsEntries = await Promise.all(vaults.map(async (vault) => {
        try {
          return [vault.safe.toLowerCase(), await loadVaultAutomationConstraints(vault)] as const;
        } catch {
          return [vault.safe.toLowerCase(), null] as const;
        }
      }));
      const constraintsMap = Object.fromEntries(constraintsEntries);

      const records = await Promise.all(uniqueTaskIds.map(async (taskId) => {
        const task = await scheduler.getTask(taskId);
        const vault = vaults.find((entry) => entry.safe.toLowerCase() === task[0].toLowerCase());
        let limitActive = false;

        try {
          const decodedKeyManager = keyManagerInterface.decodeFunctionData('execute', task[2]);
          const vaultExecutePayload = decodedKeyManager[0] as string;
          const decodedSafe = safeInterface.decodeFunctionData('execute', vaultExecutePayload);
          const recipient = (decodedSafe[1] as string).toLowerCase();
          const value = decodedSafe[2] as bigint;
          const triggerType = task[3] === 1 ? 'block' : 'timestamp';
          const intervalSeconds = triggerType === 'block' ? Number(task[5]) * 12 : Number(task[5]);
          const constraints = constraintsMap[task[0].toLowerCase()];
          if (constraints) {
            const recipientOption = constraints.recipientOptions.find((option) => option.address.toLowerCase() === recipient) ?? null;
            const effectiveRemaining = minBigInt(constraints.globalRemainingWei, recipientOption?.remainingWei ?? null);
            const effectivePeriod = minNumber(constraints.maxPeriodSeconds, recipientOption?.periodSeconds ?? null);
            limitActive = Boolean(
              constraints.hasRecipientRestrictions ||
              effectiveRemaining !== null ||
              effectivePeriod !== null
            ) && (
              constraints.hasRecipientRestrictions ||
              (effectiveRemaining !== null && value <= effectiveRemaining) ||
              (effectivePeriod !== null && intervalSeconds <= effectivePeriod)
            );
          }
        } catch {
          // ignore decode issues; fallback to task without limit badge
        }

        return buildTaskRecord(taskId, task, vault?.label || shortenAddress(task[0]), locale, t, limitActive);
      }));

      setTasks(records.sort((left, right) => left.nextExecution.getTime() - right.nextExecution.getTime()));
    } catch (error) {
      setTasks([]);
      setTasksError(getErrorMessage(error));
    } finally {
      setTasksLoading(false);
    }
  }, [account, isSchedulerConfigured, locale, scheduler, t, vaults]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadAuthorizationState();
  }, [loadAuthorizationState]);

  const handleToggle = useCallback(async (taskId: string) => {
    if (!scheduler || !isConnected) {
      setTasksError(t('automation.scheduler.connect_wallet'));
      return;
    }

    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask) {
      return;
    }

    setIsMutating(true);
    setTxStatus(currentTask.enabled ? t('automation.status.disabling') : t('automation.status.enabling'));

    try {
      const tx = currentTask.enabled
        ? await scheduler.disableTask(taskId)
        : await scheduler.enableTask(taskId);
      await tx.wait();
      setTxStatus(currentTask.enabled ? t('automation.status.disabled') : t('automation.status.enabled'));
      await loadTasks();
    } catch (error) {
      setTasksError(getErrorMessage(error));
      setTxStatus(null);
    } finally {
      setIsMutating(false);
    }
  }, [isConnected, loadTasks, scheduler, t, tasks]);

  const handleNewTask = useCallback(async (draft: NewTaskDraft) => {
    if (!scheduler || !signer) {
      throw new Error(t('automation.scheduler.connect_wallet'));
    }

    const vault = vaults.find((entry) => entry.safe === draft.vaultSafe);
    if (!vault) {
      throw new Error(t('automation.error.vault_not_found'));
    }

    setIsMutating(true);
    setTxStatus(t('automation.status.creating'));
    setTasksError(null);

    try {
      await ensureSchedulerAuthorized(vault.safe);

      const amountWei = ethers.parseEther(draft.amount);
      const vaultExecutePayload = safeInterface.encodeFunctionData('execute', [0, draft.recipient, amountWei, '0x']);
      const keyManagerCalldata = keyManagerInterface.encodeFunctionData('execute', [vaultExecutePayload]);
      const provider = signer.provider ?? getReadOnlyProvider();
      const firstExecution = draft.triggerType === 'timestamp'
        ? Math.floor(Date.now() / 1000) + draft.interval
        : await provider.getBlockNumber() + draft.interval;
      const taskId = ethers.id([
        'vaultia-task',
        draft.vaultSafe,
        draft.recipient,
        draft.amount,
        draft.triggerType,
        String(draft.interval),
        String(Date.now()),
      ].join(':'));

      const tx = await scheduler.createTask(
        taskId,
        vault.safe,
        vault.keyManager,
        keyManagerCalldata,
        draft.triggerType === 'timestamp' ? 0 : 1,
        firstExecution,
        draft.interval,
      );
      await tx.wait();
      setTxStatus(t('automation.status.created'));
      await loadAuthorizationState();
      await loadTasks();
    } catch (error) {
      setTasksError(getErrorMessage(error));
      setTxStatus(null);
      throw error;
    } finally {
      setIsMutating(false);
    }
  }, [ensureSchedulerAuthorized, loadAuthorizationState, loadTasks, scheduler, signer, t, vaults]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{t('automation.title')}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {tasksLoading ? t('automation.loading') : `${tasks.length} ${t('automation.subtitle_tasks')} · ${enabledCount} ${t('automation.subtitle_active')}`}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowWizard(true)} disabled={!isConnected || isMutating || !isSchedulerConfigured}>
          {t('automation.new_task')}
        </Button>
      </div>

      <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('automation.ops_title')}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('automation.ops_desc')}</p>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          {schedulerOwner ? `${t('automation.scheduler.owner')}: ${shortenAddress(schedulerOwner)}` : t('automation.scheduler.owner_loading')}
        </p>
        {vaults.length > 0 && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            {Object.values(authorizedVaults).some(Boolean)
              ? t('automation.scheduler.vault_authorized')
              : t('automation.scheduler.vault_authorize_needed')}
          </p>
        )}
        {schedulerBlockedReason && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{schedulerBlockedReason}</p>
        )}
        {txStatus && (
          <p className="text-xs mt-2" style={{ color: 'var(--text)' }}>{txStatus}</p>
        )}
        {tasksError && (
          <p className="text-xs mt-2 text-red-500 break-words leading-relaxed">{localizeErrorMessage(tasksError, t)}</p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { tone: 'var(--success)', label: t('automation.summary.active'), value: enabledCount },
          { tone: 'var(--accent)', label: t('automation.summary.timestamp'), value: tasks.filter((task) => task.triggerType === 'timestamp').length },
          { tone: 'var(--primary)', label: t('automation.summary.block'), value: tasks.filter((task) => task.triggerType === 'block').length },
        ].map((summary) => (
          <div
            key={summary.label}
            className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <span
              className="h-3.5 w-3.5 rounded-full flex-shrink-0"
              style={{ background: summary.tone }}
            />
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{summary.label}</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{summary.value}</p>
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>{t('automation.calendar.title')}</CardTitle></CardHeader>
        <CardContent>
          <TaskTimeline tasks={tasks} onToggle={handleToggle} toggleDisabled={!isConnected || isMutating} />
        </CardContent>
      </Card>

      <NewTaskWizardModal
        open={showWizard}
        onClose={() => setShowWizard(false)}
        vaults={vaults}
        isAdvanced={isAdvanced}
        canCreateOnChain={isConnected && isSchedulerConfigured}
        blockedReason={schedulerBlockedReason}
        onSave={handleNewTask}
      />
    </div>
  );
}
