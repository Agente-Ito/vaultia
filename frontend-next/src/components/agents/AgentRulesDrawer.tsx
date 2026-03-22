'use client';

import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/common/Button';
import { Alert, AlertDescription } from '@/components/common/Alert';
import { InfoTooltip } from '@/components/common/Tooltip';
import { useAssignRole } from '@/hooks/useAssignRole';
import { useI18n } from '@/context/I18nContext';
import type { AgentRecord } from './types';

interface AgentRulesDrawerProps {
  agent: AgentRecord | null;
  open: boolean;
  onClose: () => void;
  isRoleAdmin?: boolean;
}

export function AgentRulesDrawer({ agent, open, onClose, isRoleAdmin }: AgentRulesDrawerProps) {
  const assignRole = useAssignRole();
  const { t } = useI18n();
  const [roleName, setRoleName] = useState('');
  const [capabilities, setCapabilities] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  if (!agent) return null;

  const handleAssignRole = async () => {
    setFeedback(null);
    try {
      await assignRole.mutateAsync({
        agent: agent.address,
        role: roleName,
        capabilities: capabilities.split(',').map((c) => c.trim()).filter(Boolean),
      });
      setFeedback({ ok: true, msg: `Role "${roleName}" assigned successfully.` });
      setRoleName('');
      setCapabilities('');
    } catch (err) {
      setFeedback({ ok: false, msg: err instanceof Error ? err.message : 'Transaction failed.' });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} direction="right">
      <SheetContent side="right">
        <SheetHeader className="px-6 pt-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--accent)' }} />
            <SheetTitle>{t('agents.drawer.title')}</SheetTitle>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity focus:outline-none"
            aria-label={t('agents.drawer.close')}
            style={{ color: 'var(--text-muted)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {/* Address */}
          <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t('agents.drawer.address')}</p>
            </div>
            <p className="text-sm font-mono break-all" style={{ color: 'var(--text)' }}>{agent.address}</p>
          </div>

          {/* Roles */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('agents.drawer.roles')}
              <InfoTooltip content={t('agents.tooltip.role')} />
            </p>
            {agent.roles.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {agent.roles.map((role) => (
                  <span key={role} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ background: 'var(--border)', color: 'var(--text)' }}>
                    {role}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('agents.drawer.no_roles')}</p>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-widest flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                {t('agents.drawer.automation')}
                <InfoTooltip content={t('agents.tooltip.automation')} />
              </p>
              <p className="mt-1 text-sm font-medium" style={{ color: 'var(--text)' }}>
                {agent.allowedAutomation ? t('agents.drawer.enabled') : t('agents.drawer.disabled')}
              </p>
            </div>
            <div className="rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-widest flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                {t('agents.drawer.max_gas')}
                <InfoTooltip content={t('agents.tooltip.max_gas')} />
              </p>
              <p className="mt-1 text-sm font-medium" style={{ color: 'var(--text)' }}>{agent.maxGasPerCall.toLocaleString()}</p>
            </div>
          </div>

          {/* Admin: Assign Role */}
          {isRoleAdmin && (
            <div className="space-y-3 rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t('agents.drawer.assign_role')}</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-widest flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  {t('agents.drawer.role_name')}
                  <InfoTooltip content={t('agents.tooltip.role')} />
                </label>
                <input
                  type="text"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g. PAYMENT_AGENT"
                  className="w-full h-9 rounded-md px-3 text-sm focus:outline-none focus:ring-2"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-widest flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  {t('agents.drawer.capabilities_label')}
                  <InfoTooltip content={t('agents.tooltip.capabilities')} />
                  <span className="font-normal" style={{ color: 'var(--text-muted)' }}>({t('agents.drawer.capabilities_hint')})</span>
                </label>
                <input
                  type="text"
                  value={capabilities}
                  onChange={(e) => setCapabilities(e.target.value)}
                  placeholder="e.g. CAN_PAY, CAN_TRANSFER"
                  className="w-full h-9 rounded-md px-3 text-sm focus:outline-none focus:ring-2"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              <Button
                size="sm"
                onClick={handleAssignRole}
                disabled={!roleName.trim() || assignRole.isPending}
                className="w-full"
              >
                {assignRole.isPending ? t('agents.drawer.assigning') : t('agents.drawer.assign_btn')}
              </Button>

              {feedback && (
                <Alert variant={feedback.ok ? 'success' : 'error'}>
                  <AlertDescription>{feedback.msg}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </SheetBody>

        <SheetFooter>
          <Button onClick={onClose} className="flex-1">
            {t('agents.drawer.close')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
