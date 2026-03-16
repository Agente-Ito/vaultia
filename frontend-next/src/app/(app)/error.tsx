'use client';

import { useEffect } from 'react';
import { Button } from '@/components/common/Button';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[AppError]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-lg text-center px-lg">
      <div className="text-4xl">⚠️</div>
      <div className="space-y-sm">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Something went wrong</h2>
        <p className="text-neutral-600 dark:text-neutral-400 max-w-md">
          {error.message || 'An unexpected error occurred. This may be a network or contract issue.'}
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-neutral-400">Digest: {error.digest}</p>
        )}
      </div>
      <Button variant="primary" onClick={reset}>Try again</Button>
    </div>
  );
}
