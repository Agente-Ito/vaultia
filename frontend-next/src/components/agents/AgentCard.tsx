'use client';

import React from 'react';
import { Badge } from '@/components/common/Badge';
import { InfoTooltip } from '@/components/common/Tooltip';
import { useI18n } from '@/context/I18nContext';
import { AddressDisplay } from '@/components/common/AddressDisplay';
import type { AgentRecord } from './types';

interface AgentCardProps {
  agent: AgentRecord;
  onClick?: () => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const { t } = useI18n();

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        cursor: onClick ? 'pointer' : undefined,
      }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              <AddressDisplay address={agent.address} />
            </h3>
            <p className="text-xs font-mono break-all" style={{ color: 'var(--text-muted)' }}>{agent.address}</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <span className="inline-flex items-center gap-1">
            <Badge variant={agent.isContract ? 'warning' : 'neutral'}>
              {agent.isContract ? t('agents.badge.contract') : t('agents.badge.eoa')}
            </Badge>
            <InfoTooltip content={agent.isContract ? t('agents.tooltip.contract') : t('agents.tooltip.eoa')} />
          </span>
          <span className="inline-flex items-center gap-1">
            <Badge variant={agent.allowedAutomation ? 'success' : 'neutral'}>
              {agent.allowedAutomation ? t('agents.badge.auto') : t('agents.card.automation_disabled')}
            </Badge>
            <InfoTooltip content={t('agents.tooltip.automation')} />
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="inline-flex items-center gap-1 mr-1">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('agents.drawer.roles')}</span>
          <InfoTooltip content={t('agents.tooltip.role')} />
        </span>
        {agent.roles.map((r) => (
          <span
            key={r}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--border)', color: 'var(--text)' }}
          >
            {r}
          </span>
        ))}
        {agent.roles.length === 0 && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('agents.card.no_roles')}</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg px-3 py-2" style={{ border: '1px solid var(--border)' }}>
          <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            {t('agents.card.automation')}
            <InfoTooltip content={t('agents.tooltip.automation')} />
          </p>
          <p className="mt-1 font-medium" style={{ color: 'var(--text)' }}>
            {agent.allowedAutomation ? t('agents.card.automation_enabled') : t('agents.card.automation_disabled')}
          </p>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ border: '1px solid var(--border)' }}>
          <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            {t('agents.card.max_gas')}
            <InfoTooltip content={t('agents.tooltip.max_gas')} />
          </p>
          <p className="mt-1 font-medium" style={{ color: 'var(--text)' }}>
            {agent.maxGasPerCall > 0 ? agent.maxGasPerCall.toLocaleString() : '0'}
          </p>
        </div>
      </div>
    </div>
  );
}
