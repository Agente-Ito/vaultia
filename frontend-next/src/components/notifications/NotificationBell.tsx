'use client';

import { useEffect, useRef, useState } from 'react';
import { useNotifications, type UPNotification } from '@/hooks/useNotifications';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/utils/cn';

// ─── Icons ────────────────────────────────────────────────────────────────────

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// ─── Notification type config ─────────────────────────────────────────────────

function getNotifMeta(type: UPNotification['type'], amount?: string) {
  switch (type) {
    case 'lyx':   return { emoji: '⚡', titleKey: 'notifications.lyx_received'   as const, detail: amount ? `${parseFloat(amount).toFixed(4)} LYX` : '' };
    case 'token': return { emoji: '🪙', titleKey: 'notifications.token_received' as const, detail: '' };
    case 'nft':   return { emoji: '🖼️', titleKey: 'notifications.nft_received'   as const, detail: '' };
    default:      return { emoji: '📡', titleKey: 'notifications.other'          as const, detail: '' };
  }
}

// ─── Single notification row ──────────────────────────────────────────────────

function NotifRow({
  notif,
  isRead,
  onRead,
}: {
  notif: UPNotification;
  isRead: boolean;
  onRead: () => void;
}) {
  const { t } = useI18n();
  const { emoji, titleKey, detail } = getNotifMeta(notif.type, notif.amount);

  return (
    <button
      type="button"
      onClick={onRead}
      className={cn(
        'w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-700/50',
        !isRead && 'bg-primary-50/60 dark:bg-primary-900/10'
      )}
    >
      {/* Unread dot + emoji */}
      <div className="relative flex-shrink-0 mt-0.5">
        <span className="text-lg leading-none">{emoji}</span>
        {!isRead && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary-500" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm leading-snug', !isRead ? 'font-semibold text-neutral-900 dark:text-neutral-50' : 'font-medium text-neutral-700 dark:text-neutral-300')}>
          {t(titleKey)}{detail ? ` — ${detail}` : ''}
        </p>
        <p className="text-xs text-neutral-400 mt-0.5 truncate">
          {t('notifications.from')} {notif.from.slice(0, 8)}…{notif.from.slice(-6)}
        </p>
        <p className="text-xs text-neutral-400">{t('notifications.block')} {notif.blockNumber.toLocaleString()}</p>
      </div>
    </button>
  );
}

// ─── NotificationBell ─────────────────────────────────────────────────────────

interface NotificationBellProps {
  upAddress: string | null;
  chainId: number | null;
}

export function NotificationBell({ upAddress, chainId }: NotificationBellProps) {
  const { t } = useI18n();
  const { notifications, unreadCount, loading, error, readSet, markAllRead, markRead } =
    useNotifications(upAddress, chainId);

  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('notifications.title')}
        className="relative p-1.5 rounded-md text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
      >
        <BellIcon className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            key={unreadCount}
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center leading-none animate-bounce-in"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 dark:border-neutral-700">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              {t('notifications.title')}
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium transition-colors"
              >
                {t('notifications.mark_all_read')}
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-700/60">
            {loading && (
              <p className="text-xs text-neutral-400 px-4 py-5 text-center">{t('notifications.loading')}</p>
            )}
            {!loading && error && (
              <p className="text-xs text-red-400 px-4 py-5 text-center">{t('notifications.error')}</p>
            )}
            {!loading && !error && notifications.length === 0 && (
              <p className="text-xs text-neutral-400 px-4 py-5 text-center">{t('notifications.empty')}</p>
            )}
            {!loading && notifications.map((n) => (
              <NotifRow
                key={n.key}
                notif={n}
                isRead={readSet.has(n.key)}
                onRead={() => markRead(n.key)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
