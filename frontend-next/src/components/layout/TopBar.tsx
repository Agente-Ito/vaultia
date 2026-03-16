'use client';

import React from 'react';
import { useMode } from '@/context/ModeContext';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { cn } from '@/lib/utils/cn';

interface TopBarProps {
  account: string | null;
  chainId: number | null;
  onMenuClick?: () => void;
  onConnect?: () => void;
}

export function TopBar({ account, chainId, onMenuClick, onConnect }: TopBarProps) {
  const { mode, setMode } = useMode();

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
      <div className="px-lg py-md flex items-center justify-between gap-md">
        {/* Left: Menu button */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-xs hover:bg-neutral-100 rounded-md dark:hover:bg-neutral-700"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Center: Title */}
        <div className="flex-1">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            Financial Operating System
          </h2>
        </div>

        {/* Right: Mode toggle, account, connect button */}
        <div className="flex items-center gap-md">
          {/* Mode toggle */}
          <div className="hidden sm:flex items-center gap-xs bg-neutral-100 rounded-md p-xs dark:bg-neutral-700">
            <button
              onClick={() => setMode('simple')}
              className={cn(
                'px-sm py-xs text-xs font-medium rounded transition-colors',
                mode === 'simple'
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-white'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
              )}
            >
              Simple
            </button>
            <button
              onClick={() => setMode('advanced')}
              className={cn(
                'px-sm py-xs text-xs font-medium rounded transition-colors',
                mode === 'advanced'
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-white'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
              )}
            >
              Advanced
            </button>
          </div>

          {/* Chain info */}
          {chainId && (
            <Badge variant={chainId === 4201 || chainId === 42 ? 'success' : 'danger'}>
              {chainId === 4201 ? 'LUKSO Testnet' : chainId === 42 ? 'LUKSO Mainnet' : `Wrong chain ${chainId}`}
            </Badge>
          )}

          {/* Account */}
          {account ? (
            <div className="flex items-center gap-sm">
              <div className="hidden sm:block">
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Connected</p>
                <p className="text-sm font-mono font-medium text-neutral-900 dark:text-neutral-50">
                  {formatAddress(account)}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                {account[2] || '?'}
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={onConnect}
            >
              Connect Wallet
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
