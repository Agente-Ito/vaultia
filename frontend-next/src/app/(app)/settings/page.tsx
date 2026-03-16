'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { useMode } from '@/context/ModeContext';
import { Badge } from '@/components/common/Badge';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const { mode, setMode } = useMode();

  return (
    <div className="space-y-lg max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">Settings</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-xs">
          Configure your financial OS preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Interface Mode</CardTitle>
          <CardDescription>Choose your experience level</CardDescription>
        </CardHeader>
        <CardContent className="space-y-md">
          <div className="space-y-sm">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              Current Mode: <Badge variant={mode === 'simple' ? 'success' : 'primary'}>{mode}</Badge>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            {/* Simple Mode */}
            <div className={`rounded-lg border-2 p-md transition-colors cursor-pointer ${
              mode === 'simple'
                ? 'border-primary bg-blue-50 dark:bg-blue-900/20'
                : 'border-neutral-200 dark:border-neutral-700'
            }`}
            onClick={() => setMode('simple')}
            >
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-50">Simple Mode</h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-sm">
                For day-to-day users. Shows high-level information and core features.
              </p>
              <ul className="text-xs text-neutral-600 dark:text-neutral-400 mt-sm space-y-xs">
                <li>✓ Balance overview</li>
                <li>✓ Simple budget visualization</li>
                <li>✓ Core vaults and rules</li>
                <li>✓ Transaction history</li>
              </ul>
              {mode === 'simple' && (
                <Button size="sm" variant="primary" className="mt-md w-full">
                  Active
                </Button>
              )}
              {mode !== 'simple' && (
                <Button size="sm" variant="secondary" className="mt-md w-full" onClick={() => setMode('simple')}>
                  Switch to Simple
                </Button>
              )}
            </div>

            {/* Advanced Mode */}
            <div className={`rounded-lg border-2 p-md transition-colors cursor-pointer ${
              mode === 'advanced'
                ? 'border-primary bg-blue-50 dark:bg-blue-900/20'
                : 'border-neutral-200 dark:border-neutral-700'
            }`}
            onClick={() => setMode('advanced')}
            >
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-50">Advanced Mode <Badge variant="primary">Pro</Badge></h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-sm">
                For developers. Full technical details and advanced features.
              </p>
              <ul className="text-xs text-neutral-600 dark:text-neutral-400 mt-sm space-y-xs">
                <li>✓ Contract addresses</li>
                <li>✓ Raw policy configs</li>
                <li>✓ All pages & features</li>
                <li>✓ Technical details</li>
              </ul>
              {mode === 'advanced' && (
                <Button size="sm" variant="primary" className="mt-md w-full">
                  Active
                </Button>
              )}
              {mode !== 'advanced' && (
                <Button size="sm" variant="secondary" className="mt-md w-full" onClick={() => setMode('advanced')}>
                  Switch to Advanced
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Network</CardTitle>
          <CardDescription>Blockchain network information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-sm">
            <div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">Network</p>
              <p className="font-semibold text-neutral-900 dark:text-neutral-50">LUKSO Testnet (4201)</p>
            </div>
            <div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">Registry Address</p>
              <p className="font-mono text-sm text-neutral-700 dark:text-neutral-300">
                {process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || 'Not configured'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
