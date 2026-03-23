'use client';

import { useEffect, useState } from 'react';
import { decodeRevertReason } from '@/lib/errorMap';
import type { VerifiedRun } from '@/lib/verified-runs/types';

export function useVerifiedRuns() {
  const [runs, setRuns] = useState<VerifiedRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/verified-runs', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const payload = await response.json() as { runs?: VerifiedRun[] };
        if (!cancelled) {
          setRuns(payload.runs ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(decodeRevertReason(err));
          setRuns([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { runs, loading, error };
}