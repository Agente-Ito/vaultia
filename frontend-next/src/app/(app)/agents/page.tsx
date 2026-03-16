'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/common/Alert';
import { useWeb3 } from '@/context/Web3Context';
import { getCoordinatorContract } from '@/lib/web3/contracts';
import { SkeletonCard } from '@/components/common/Skeleton';
import { getProvider } from '@/lib/web3/provider';

const COORDINATOR_ADDRESS = process.env.NEXT_PUBLIC_COORDINATOR_ADDRESS ?? '';

interface AgentRecord {
  address: string;
  isContract: boolean;
  maxGasPerCall: bigint;
  allowedAutomation: boolean;
  roles: string[];
}

interface AgentRegisteredLog {
  args?: {
    agent?: string;
    isContract?: boolean;
    maxGasPerCall?: bigint;
    allowedAutomation?: boolean;
  };
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as { reason?: unknown; message?: unknown };

    if (typeof maybeError.reason === 'string' && maybeError.reason) {
      return maybeError.reason;
    }

    if (typeof maybeError.message === 'string' && maybeError.message) {
      return maybeError.message;
    }
  }

  return String(error);
}

function short(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export default function AgentsPage() {
  const { signer, isConnected } = useWeb3();
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Register form state
  const [newAgent, setNewAgent] = useState('');
  const [allowAutomation, setAllowAutomation] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerStatus, setRegisterStatus] = useState('');

  const isConfigured = !!COORDINATOR_ADDRESS;

  const load = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const provider = getProvider();
      const coordinator = getCoordinatorContract(COORDINATOR_ADDRESS, provider);
      const logs = await coordinator.queryFilter(coordinator.filters.AgentRegistered());
      const records: AgentRecord[] = await Promise.all(
        logs.map(async (raw) => {
          const event = raw as AgentRegisteredLog;
          const addr = event.args?.agent ?? '';
          let roles: string[] = [];
          try {
            const rawRoles: string[] = await coordinator.getAgentRoles(addr);
            roles = rawRoles;
          } catch {}
          return {
            address: addr,
            isContract: event.args?.isContract ?? false,
            maxGasPerCall: event.args?.maxGasPerCall ?? BigInt(0),
            allowedAutomation: event.args?.allowedAutomation ?? false,
            roles,
          };
        })
      );
      setAgents(records);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => { load(); }, [load]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signer || !isConfigured) return;
    setRegistering(true);
    setRegisterStatus('');
    try {
      const coordinator = getCoordinatorContract(COORDINATOR_ADDRESS, signer);
      const tx = await coordinator.registerAgent(newAgent.trim(), 0, allowAutomation);
      setRegisterStatus('Waiting for confirmation…');
      await tx.wait();
      setNewAgent('');
      setRegisterStatus('Agent registered!');
      await load();
    } catch (err: unknown) {
      setRegisterStatus('Error: ' + getErrorMessage(err));
    } finally {
      setRegistering(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className="space-y-lg">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">Agents</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-xs">Manage AI agents and their capabilities</p>
        </div>
        <Alert variant="warning">
          <AlertTitle>AgentCoordinator not configured</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-xs bg-neutral-100 dark:bg-neutral-700 px-1 rounded">NEXT_PUBLIC_COORDINATOR_ADDRESS</code> in your <code className="font-mono text-xs bg-neutral-100 dark:bg-neutral-700 px-1 rounded">.env.local</code> to enable this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-lg">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">Agents</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-xs">
          Registered AI agents and their capabilities
        </p>
      </div>

      {!isConnected && (
        <Alert variant="info">
          <AlertDescription>Connect your wallet to register agents.</AlertDescription>
        </Alert>
      )}

      {/* Register form */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Register Agent</CardTitle>
            <CardDescription>Add a new agent address to the coordinator</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-md">
              <div>
                <label className="label">Agent Address</label>
                <input
                  className="input"
                  value={newAgent}
                  onChange={(e) => setNewAgent(e.target.value)}
                  placeholder="0x…"
                  required
                />
              </div>
              <label className="flex items-center gap-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowAutomation}
                  onChange={(e) => setAllowAutomation(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-neutral-700 dark:text-neutral-300">Allow in TaskScheduler automation</span>
              </label>
              <div className="flex items-center gap-md">
                <Button type="submit" variant="primary" disabled={registering}>
                  {registering ? 'Registering…' : 'Register Agent'}
                </Button>
                {registerStatus && (
                  <p className={`text-sm ${registerStatus.startsWith('Error') ? 'text-danger' : 'text-success'}`}>
                    {registerStatus}
                  </p>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Agents list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Registered Agents</CardTitle>
              <CardDescription>{agents.length} agent(s) found</CardDescription>
            </div>
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
              {loading ? '…' : 'Refresh'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="space-y-sm">
              <SkeletonCard /><SkeletonCard />
            </div>
          )}
          {error && <p className="text-danger text-sm">Error: {error}</p>}
          {!loading && !error && agents.length === 0 && (
            <p className="text-neutral-600 dark:text-neutral-400">No agents registered yet.</p>
          )}
          {agents.length > 0 && (
            <div className="space-y-sm">
              {agents.map((agent) => (
                <div
                  key={agent.address}
                  className="p-md rounded-md border border-neutral-200 dark:border-neutral-700 space-y-sm"
                >
                  <div className="flex items-start justify-between gap-md">
                    <p className="font-mono text-sm text-neutral-900 dark:text-neutral-100 break-all">
                      {short(agent.address)}
                    </p>
                    <div className="flex gap-xs shrink-0">
                      <Badge variant={agent.isContract ? 'primary' : 'neutral'}>
                        {agent.isContract ? 'Contract' : 'EOA'}
                      </Badge>
                      {agent.allowedAutomation && (
                        <Badge variant="success">Auto</Badge>
                      )}
                    </div>
                  </div>
                  {agent.roles.length > 0 && (
                    <div className="flex flex-wrap gap-xs">
                      {agent.roles.map((r) => (
                        <Badge key={r} variant="neutral" className="font-mono text-xs">
                          {r.slice(0, 10)}…
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
