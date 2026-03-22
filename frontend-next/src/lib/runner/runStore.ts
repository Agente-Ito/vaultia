/**
 * Shared in-memory run state store.
 * Imported by both the /run and /status API routes so they share the same Map.
 *
 * For production, replace with Redis or a persistent store.
 * Adequate for single-process preview or development environments.
 */

export interface RunState {
  runId: string;
  status: 'running' | 'done' | 'error';
  message: string;
  logs: Array<{ ts: number; level: 'info' | 'warn' | 'error'; msg: string }>;
  startedAt: number;
}

export const runStore = new Map<string, RunState>();
