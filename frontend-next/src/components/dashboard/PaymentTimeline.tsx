'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

export interface PaymentEvent {
  id: string;
  date: Date;
  label: string;
  amount: number;
  currency: string;
  botName: string;
  botEmoji: string;
  status: 'scheduled' | 'completed' | 'failed';
}

function formatDate(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  if (days < 0 && days > -2) return 'Ayer';

  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

const STATUS_STYLES: Record<PaymentEvent['status'], string> = {
  scheduled: 'bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
  completed: 'bg-green-50 text-green-600 dark:bg-green-900/40 dark:text-green-300',
  failed: 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-300',
};

const STATUS_LABELS: Record<PaymentEvent['status'], string> = {
  scheduled: 'Programado',
  completed: 'Completado',
  failed: 'Fallido',
};

interface PaymentTimelineProps {
  events: PaymentEvent[];
  className?: string;
}

export function PaymentTimeline({ events, className }: PaymentTimelineProps) {
  if (events.length === 0) {
    return (
      <div className={cn('text-center py-6', className)}>
        <p className="text-2xl mb-1">📅</p>
        <p className="text-xs text-neutral-400">No hay pagos programados</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {events.map((event, i) => (
        <div key={event.id} className="flex items-start gap-3">
          {/* Timeline line */}
          <div className="flex flex-col items-center">
            <div className="w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-sm flex-shrink-0">
              {event.botEmoji}
            </div>
            {i < events.length - 1 && (
              <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700 mt-1" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 pb-1">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {event.label}
                </span>
                <span className="text-xs text-neutral-400 ml-1.5">• {event.botName}</span>
              </div>
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 flex-shrink-0">
                {event.currency}{event.amount.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-neutral-400">{formatDate(event.date)}</span>
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full', STATUS_STYLES[event.status])}>
                {STATUS_LABELS[event.status]}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
