'use client';
export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/common/Alert';
import { Button } from '@/components/common/Button';
import { AgentCard } from '@/components/agents/AgentCard';
import { AgentRulesDrawer } from '@/components/agents/AgentRulesDrawer';
import { useI18n } from '@/context/I18nContext';
import { useWeb3 } from '@/context/Web3Context';
import { useAgents, useCoordinatorAdmin } from '@/hooks/useAgents';
import { useRegisterAgent } from '@/hooks/useRegisterAgent';
import type { AgentRecord } from '@/components/agents/types';

export default function AgentsPage() {
  const { t } = useI18n();
  const { account, isConnected, isCoordinatorConfigured } = useWeb3();
  const { data: agents = [], isLoading, error } = useAgents();
  const { data: roleAdmin, isLoading: isRoleAdminLoading } = useCoordinatorAdmin();
  const registerAgent = useRegisterAgent();
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [newAgentAddress, setNewAgentAddress] = useState('');
  const [maxGasPerCall, setMaxGasPerCall] = useState('0');
  const [allowedAutomation, setAllowedAutomation] = useState(true);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [drawerAgent, setDrawerAgent] = useState<AgentRecord | null>(null);

  const isRoleAdmin = useMemo(() => {
    if (!account || !roleAdmin) {
      return false;
    }

    return account.toLowerCase() === roleAdmin.toLowerCase();
  }, [account, roleAdmin]);

  const canRegisterAgents = isCoordinatorConfigured && isConnected && isRoleAdmin;

  const adminStateLabel = !isCoordinatorConfigured
    ? t('agents.admin.state_not_configured')
    : isRoleAdminLoading
      ? t('agents.admin.state_checking')
      : canRegisterAgents
        ? t('agents.admin.state_admin')
        : t('agents.admin.state_view_only');

  const handleRegisterAgent = async () => {
    setSubmitMessage(null);

    try {
      await registerAgent.mutateAsync({
        agent: newAgentAddress.trim(),
        maxGasPerCall: Number(maxGasPerCall || '0'),
        allowedAutomation,
      });

      setSubmitMessage(t('agents.register.success'));
      setNewAgentAddress('');
      setMaxGasPerCall('0');
      setAllowedAutomation(true);
      setShowRegisterForm(false);
    } catch (err) {
      setSubmitMessage(err instanceof Error ? err.message : t('agents.register.error'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{t('agents.title')}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {isCoordinatorConfigured ? `${agents.length} ${t('agents.list.count')}` : t('agents.manage_subtitle')}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowRegisterForm((current) => !current)}
          disabled={!canRegisterAgents}
          title={!canRegisterAgents ? adminStateLabel : undefined}
        >
          {showRegisterForm ? t('agents.register.cancel') : t('agents.add')}
        </Button>
      </div>

      {!isCoordinatorConfigured && (
        <Alert variant="warning">
          <AlertTitle>{t('agents.not_configured.title')}</AlertTitle>
          <AlertDescription>{t('agents.not_configured.desc')}</AlertDescription>
        </Alert>
      )}

      <Alert variant="info">
        <AlertTitle>{t('agents.beta.title')}</AlertTitle>
        <AlertDescription>{t('agents.beta.desc')}</AlertDescription>
      </Alert>

      <Alert variant={canRegisterAgents ? 'success' : 'info'}>
        <AlertTitle>{t('agents.admin.title')}</AlertTitle>
        <AlertDescription>
          <p>{t('agents.admin.desc')}</p>
          <p className="mt-2 text-xs font-mono">
            {t('agents.admin.role_admin')}: {roleAdmin ?? t('agents.admin.unknown')}
          </p>
          <p className="mt-1 text-xs">
            {t('agents.admin.current_state')}: {adminStateLabel}
          </p>
        </AlertDescription>
      </Alert>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{t('agents.skill.title')}</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{t('agents.skill.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              title: t('agents.skill.card.path.title'),
              desc: t('agents.skill.card.path.desc'),
            },
            {
              title: t('agents.skill.card.coordinator.title'),
              desc: t('agents.skill.card.coordinator.desc'),
            },
            {
              title: t('agents.skill.card.automation.title'),
              desc: t('agents.skill.card.automation.desc'),
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-lg p-4"
              style={{ background: 'var(--card-mid)', border: '1px solid var(--border)' }}
            >
              <h3 className="text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text)' }}>
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-muted)' }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {showRegisterForm && canRegisterAgents && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{t('agents.register.title')}</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{t('agents.register.desc')}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('agents.register.address_label')}</label>
            <input
              type="text"
              value={newAgentAddress}
              onChange={(event) => setNewAgentAddress(event.target.value)}
              placeholder={t('agents.register.address_placeholder')}
              className="w-full h-10 rounded-md border border-neutral-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('agents.register.max_gas_label')}</label>
            <input
              type="number"
              min="0"
              value={maxGasPerCall}
              onChange={(event) => setMaxGasPerCall(event.target.value)}
              placeholder="0"
              className="w-full h-10 rounded-md border border-neutral-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
            />
          </div>

          <label className="flex items-center gap-3 text-sm" style={{ color: 'var(--text)' }}>
            <input
              type="checkbox"
              checked={allowedAutomation}
              onChange={(event) => setAllowedAutomation(event.target.checked)}
            />
            <span>{t('agents.register.allow_automation')}</span>
          </label>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setShowRegisterForm(false)}>
              {t('agents.register.cancel')}
            </Button>
            <Button onClick={handleRegisterAgent} disabled={registerAgent.isPending}>
              {registerAgent.isPending ? t('agents.register.btn_loading') : t('agents.register.btn')}
            </Button>
          </div>

          {submitMessage && (
            <Alert variant={registerAgent.isError ? 'error' : 'success'}>
              <AlertDescription>{submitMessage}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {error && (
        <Alert variant="error">
          <AlertTitle>Unable to load agents</AlertTitle>
          <AlertDescription>{String(error)}</AlertDescription>
        </Alert>
      )}

      {isCoordinatorConfigured && isLoading ? (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-6 text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('agents.loading')}
        </div>
      ) : isCoordinatorConfigured && agents.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-3xl">🤖</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('agents.list.empty')}</p>
        </div>
      ) : isCoordinatorConfigured ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {agents.map((agent, i) => (
            <div key={agent.address} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <AgentCard
                agent={agent}
                onClick={() => setDrawerAgent(agent)}
              />
            </div>
          ))}
        </div>
      ) : null}

      <AgentRulesDrawer
        agent={drawerAgent}
        open={drawerAgent !== null}
        onClose={() => setDrawerAgent(null)}
        isRoleAdmin={isRoleAdmin}
      />
    </div>
  );
}
