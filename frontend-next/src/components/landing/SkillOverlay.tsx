'use client';

import React, { useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2
        style={{
          fontSize: '0.7rem',
          fontWeight: 500,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3
        style={{
          fontSize: '0.72rem',
          fontWeight: 500,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text)',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
      {children}
    </p>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="text-xs px-1 py-0.5 rounded"
      style={{ background: 'var(--card-mid)', color: 'var(--accent)', fontFamily: 'var(--font-geist-mono)' }}
    >
      {children}
    </code>
  );
}

function Ul({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          <span className="mt-1.5 flex-shrink-0 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--text-muted)', opacity: 0.5 }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Ol({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          <span className="flex-shrink-0 text-xs font-mono" style={{ color: 'var(--accent)', minWidth: '1rem' }}>
            {String(i + 1).padStart(2, '0')}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function StatusTable() {
  const rows: { label: string; status: '✅' | '🔜' }[] = [
    { label: 'Root vault deployment via the app', status: '✅' },
    { label: 'Budget, merchant, and expiration policies', status: '✅' },
    { label: 'Assigning a curated agent to a vault', status: '✅' },
    { label: 'Assigning a custom agent address to a vault', status: '✅' },
    { label: 'LSP6 KeyManager + PolicyEngine execution path', status: '✅' },
    { label: 'AgentCoordinator registration and roles', status: '✅' },
    { label: 'TaskScheduler (keeper-driven automation)', status: '✅' },
    { label: 'VaultDirectory and SharedBudgetPool contracts', status: '✅' },
    { label: 'Agent creating sub-vaults autonomously via UI', status: '🔜' },
    { label: 'Agent-to-agent delegation via the app', status: '🔜' },
  ];

  return (
    <div
      className="rounded-xl overflow-hidden text-xs"
      style={{ border: '1px solid var(--border)' }}
    >
      {rows.map((row, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 py-2"
          style={{
            borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
            background: i % 2 === 0 ? 'var(--card)' : 'transparent',
          }}
        >
          <span className="text-base leading-none">{row.status}</span>
          <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
          {row.status === '🔜' && (
            <span
              className="ml-auto rounded-full px-2 py-0.5 text-xs flex-shrink-0"
              style={{ background: 'rgba(34,255,178,0.1)', color: 'var(--accent)' }}
            >
              Next release
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function GlossaryGrid() {
  const terms: { term: string; def: string }[] = [
    { term: 'Vault', def: 'An AgentSafe instance that holds funds and executes validated actions' },
    { term: 'KeyManager', def: 'The LSP6 contract that checks controller permissions before forwarding execution' },
    { term: 'PolicyEngine', def: 'The contract that validates every active policy before the safe executes' },
    { term: 'Policy', def: 'An on-chain rule such as budget, merchant, expiry, or shared-budget enforcement' },
    { term: 'AgentCoordinator', def: 'Agent registry plus role, capability, and delegation metadata layer' },
    { term: 'SharedBudgetPool', def: 'Hierarchical pool accounting for multi-vault budgets with inherited spending limits' },
    { term: 'VaultDirectory', def: 'Metadata registry for vault labels and graph relationships' },
    { term: 'TaskScheduler', def: 'On-chain schedule store for recurring or delayed executions' },
    { term: 'Keeper', def: 'Off-chain process that polls and triggers eligible tasks' },
    { term: 'Curated agent', def: 'A vetted agent with a known execution path, available for evaluation in the current beta phase' },
  ];

  return (
    <div className="space-y-2">
      {terms.map(({ term, def }) => (
        <div key={term} className="flex gap-3 text-sm">
          <Code>{term}</Code>
          <span className="leading-relaxed" style={{ color: 'var(--text-muted)' }}>{def}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Seven static dots ────────────────────────────────────────────────────────

function SevenDots() {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: 7 }).map((_, i) => (
        <span
          key={i}
          className="block rounded-full"
          style={{
            width: 7,
            height: 7,
            background: 'var(--text)',
            opacity: 0.3 + i * 0.1,
          }}
        />
      ))}
    </div>
  );
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

interface SkillOverlayProps {
  onClose: () => void;
}

export function SkillOverlay({ onClose }: SkillOverlayProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{ background: 'var(--bg)' }}
    >
      {/* Close bar */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        <span
          style={{
            fontSize: '0.65rem',
            fontWeight: 400,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Agent SKILL
        </span>
        <button
          onClick={onClose}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          aria-label="Close"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span style={{ letterSpacing: '0.1em' }}>ESC</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 mx-auto w-full max-w-2xl px-6 py-12 space-y-10">

        <SevenDots />

        {/* Title */}
        <div className="text-center space-y-2 mb-10">
          <h1
            style={{
              fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
              fontWeight: 300,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text)',
            }}
          >
            Vaultia Protocol
          </h1>
          <p style={{ fontSize: '0.75rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            Agent Integration Reference
          </p>
        </div>

        {/* What Vaultia is */}
        <Section title="What Vaultia is">
          <P>
            Vaultia is a constrained execution layer for AI-driven finance, built on LUKSO Universal Profiles.
          </P>
          <P>
            <strong style={{ color: 'var(--text)', fontWeight: 500 }}>Humans</strong> create root vaults, configure budget policies, set spending limits, and decide which agents to authorize.{' '}
            <strong style={{ color: 'var(--text)', fontWeight: 500 }}>Agents</strong> operate inside those vaults — executing transactions and workflows — strictly within the permissions and budget caps the human owner committed on-chain.
          </P>
          <P>
            An agent can never exceed the permissions or budget limits of the vault that authorized it. Sub-vaults must stay within the root vault&apos;s overall constraints. There is no privilege escalation path.
          </P>
        </Section>

        {/* Current state */}
        <Section title="Current deployment state (beta)">
          <StatusTable />
          <P>
            <strong style={{ color: 'var(--text)', fontWeight: 500 }}>Curated agents</strong> are the recommended starting point. These are vetted agents with known execution paths and tested permission profiles. Custom agent addresses can be assigned directly from the vault management panel.
          </P>
        </Section>

        {/* Mental model */}
        <Section title="Mental model">
          <P>
            A payment succeeds only when all three layers agree:
          </P>
          <Ol items={[
            <span key={1}>The LSP6 <Code>KeyManager</Code> accepts the caller and payload</span>,
            <span key={2}>The <Code>AgentSafe</Code> forwards the action through the safe execution path</span>,
            <span key={3}>The <Code>PolicyEngine</Code> validates every active policy</span>,
          ]} />
          <P>If any layer rejects, execution reverts.</P>
        </Section>

        {/* Role A */}
        <Section title="Role A — Agent operating inside a configured vault">
          <Sub title="Preconditions">
            <Ul items={[
              <span key={1}>You have a controller address the vault <Code>KeyManager</Code> recognizes</span>,
              <span key={2}>That controller has the required LSP6 permissions for the intended action</span>,
              <span key={3}><Code>AllowedCalls</Code> includes the destination if strict payment permissions are active</span>,
              <span key={4}>The vault is funded, has an <Code>AgentSafe</Code>, a <Code>KeyManager</Code>, and a linked <Code>PolicyEngine</Code></span>,
              <span key={5}>The <Code>PolicyEngine</Code> is not paused</span>,
            ]} />
          </Sub>

          <Sub title="Canonical payment flow">
            <Ol items={[
              <span key={1}>Build calldata for <Code>AgentSafe.execute(...)</Code></span>,
              <span key={2}>Call <Code>LSP6KeyManager.execute(payload)</Code> from the authorized controller</span>,
              <span key={3}>KeyManager checks permissions and <Code>AllowedCalls</Code></span>,
              <span key={4}>KeyManager forwards to <Code>AgentSafe.execute(...)</Code></span>,
              <span key={5}><Code>AgentSafe</Code> calls <Code>PolicyEngine.validate(...)</Code> before execution</span>,
              <span key={6}>Every active policy must pass or the transaction reverts</span>,
            ]} />
          </Sub>

          <Sub title="Why your transaction can be blocked">
            <Ul items={[
              'Controller lacks the required LSP6 permission',
              <span key={2}><Code>AllowedCalls</Code> does not permit the destination or call pattern</span>,
              <span key={3}>Vault-wide pause is active in <Code>PolicyEngine</Code></span>,
              <span key={4}><Code>BudgetPolicy</Code> blocks the spend</span>,
              <span key={5}><Code>MerchantPolicy</Code> blocks the recipient</span>,
              <span key={6}><Code>ExpirationPolicy</Code> has expired the permission</span>,
              <span key={7}><Code>SharedBudgetPool</Code> ancestor pool is exhausted</span>,
              'Vault balance is insufficient',
            ]} />
          </Sub>

          <Sub title="What you cannot do">
            <Ul items={[
              'Bypass the KeyManager or policy validation path',
              'Grant yourself new LSP6 permissions',
              'Grant yourself new coordinator roles or capabilities',
              "Move funds outside the owner's configured destinations and budgets",
              'Ignore a vault-wide pause',
              "Create sub-vaults whose budget exceeds the root vault's limits",
            ]} />
          </Sub>
        </Section>

        {/* Role B */}
        <Section title="Role B — Orchestrator agent assisting setup">
          <Sub title="Root deployment flow">
            <Ol items={[
              <span key={1}>Deploy <Code>MerchantRegistry</Code></span>,
              <span key={2}>Deploy <Code>AgentVaultDeployerCore</Code></span>,
              <span key={3}>Deploy <Code>AgentVaultDeployer</Code></span>,
              <span key={4}>Deploy <Code>AgentKMDeployer</Code></span>,
              <span key={5}>Deploy <Code>TaskScheduler</Code></span>,
              <span key={6}>Deploy <Code>AgentCoordinator</Code></span>,
              <span key={7}>Deploy <Code>SharedBudgetPool</Code></span>,
              <span key={8}>Deploy <Code>AgentVaultRegistry</Code></span>,
              <span key={9}>Authorize the registry in <Code>AgentCoordinator</Code> and <Code>SharedBudgetPool</Code></span>,
              <span key={10}>Deploy vaults through <Code>AgentVaultRegistry</Code></span>,
            ]} />
          </Sub>

          <Sub title="Budget hierarchy">
            <Ul items={[
              <span key={1}><Code>SharedBudgetPool</Code> supports nested parent-pointer pools with max depth 4</span>,
              'A vault can belong to exactly one pool',
              'Spending is charged against the vault pool and all ancestor pools',
              "A sub-vault's budget limit can never exceed its parent pool's remaining balance",
              <span key={4}><Code>VaultDirectory</Code> is metadata only — it does not enforce budgets or permissions</span>,
            ]} />
          </Sub>
        </Section>

        {/* Automation */}
        <Section title="Automation">
          <P>
            Automation is best-effort and keeper-driven. <Code>TaskScheduler</Code> stores schedules on-chain but never self-executes.
          </P>
          <Ol items={[
            <span key={1}>Call <Code>getEligibleTasks()</Code> periodically from an off-chain keeper</span>,
            <span key={2}>Call <Code>executeTask(taskId)</Code> for each eligible task</span>,
          ]} />
          <P>
            The keeper triggers an already configured on-chain path and does not receive spending authority by itself. New deployments enforce a keeper whitelist by default.
          </P>
        </Section>

        {/* Roadmap */}
        <Section title="Roadmap">
          <Ul items={[
            <span key={1}><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Agent-managed sub-vaults via UI</strong> — contracts already deployed; UI flow coming next release</span>,
            <span key={2}><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Agent-to-agent delegation</strong> — bounded by delegation depth and permission scope</span>,
            <span key={3}><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Broader agent publishing flows</strong> — self-serve registration for third-party agents</span>,
          ]} />
          <P>
            If you are acting autonomously, prefer current on-chain facts over UI copy or roadmap assumptions.
          </P>
        </Section>

        {/* Glossary */}
        <Section title="Glossary">
          <GlossaryGrid />
        </Section>

        {/* Bottom close */}
        <div className="flex justify-center pt-4 pb-8">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-xs uppercase tracking-[0.14em] transition-opacity hover:opacity-70"
            style={{ color: 'var(--text)', border: '1px solid var(--border)' }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Vaultia
          </button>
        </div>
      </div>
    </div>
  );
}
