'use client';

import { useI18n } from '@/context/I18nContext';
import type { ExecutionLogEntry } from '@/hooks/useExecutionLogs';
import { cn } from '@/lib/utils/cn';
import { ethers } from 'ethers';
import { AddressDisplay } from '@/components/common/AddressDisplay';

function truncateHash(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatAmount(wei: string, token: string) {
  const isLYX = token === ethers.ZeroAddress || token === '0x0000000000000000000000000000000000000000';
  try {
    const formatted = ethers.formatEther(BigInt(wei));
    return `${formatted} ${isLYX ? 'LYX' : truncateHash(token)}`;
  } catch {
    return `${wei} wei`;
  }
}

interface ExecutionLogProps {
  logs: ExecutionLogEntry[];
}

export function ExecutionLog({ logs }: ExecutionLogProps) {
  const { t } = useI18n();

  if (logs.length === 0) {
    return (
      <p className="text-xs text-neutral-400 dark:text-neutral-500 italic">
        {t('missions.log.empty')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
      <table className="w-full text-xs">
        <thead className="bg-neutral-50 dark:bg-neutral-700/50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-neutral-600 dark:text-neutral-300">
              {t('missions.log.result')}
            </th>
            <th className="px-3 py-2 text-left font-semibold text-neutral-600 dark:text-neutral-300">
              {t('missions.log.controller')}
            </th>
            <th className="px-3 py-2 text-left font-semibold text-neutral-600 dark:text-neutral-300">
              {t('missions.log.target')}
            </th>
            <th className="px-3 py-2 text-left font-semibold text-neutral-600 dark:text-neutral-300">
              {t('missions.log.amount')}
            </th>
            <th className="px-3 py-2 text-left font-semibold text-neutral-600 dark:text-neutral-300">
              Reason / Tx
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
              <td className="px-3 py-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                    log.result === 'success'
                      ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                  )}
                >
                  {log.result === 'success' ? '✅' : '🚫'}
                  {log.result === 'success' ? 'OK' : 'Blocked'}
                </span>
              </td>
              <td className="px-3 py-2 text-neutral-600 dark:text-neutral-300">
                <AddressDisplay address={log.controller} />
              </td>
              <td className="px-3 py-2 text-neutral-600 dark:text-neutral-300">
                <AddressDisplay address={log.target} />
              </td>
              <td className="px-3 py-2 text-neutral-700 dark:text-neutral-200 tabular-nums">
                {formatAmount(log.amount, log.token)}
              </td>
              <td className="px-3 py-2 text-neutral-500 dark:text-neutral-400 max-w-[160px]">
                {log.result === 'blocked' && log.reason ? (
                  <span className="text-red-600 dark:text-red-400">
                    {t('missions.log.blocked_reason')}
                  </span>
                ) : log.txHash ? (
                  <span className="font-mono truncate block">{truncateHash(log.txHash)}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
