'use client';

import React, { useState, useEffect } from 'react';
import { SidebarClient } from './SidebarClient';
import { TopBar } from './TopBar';
import { CelestialFlash } from '@/components/common/CelestialFlash';
import { SiteFooter } from './SiteFooter';

interface AppShellProps {
  children: React.ReactNode;
  account: string | null;
  chainId: number | null;
  onConnect?: () => void;
}

export function AppShell({ children, account, chainId, onConnect }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  // Mark session as active so landing page knows to redirect returning users
  useEffect(() => {
    sessionStorage.setItem('vaultia-session-active', '1');
  }, []);

  return (
    <div className="relative flex h-screen" style={{ background: 'var(--bg)' }}>
      {/* Celestial Flash — runs once per session */}
      {!splashDone && <CelestialFlash onDone={() => setSplashDone(true)} />}

      {/* Sidebar */}
      <SidebarClient isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="relative z-10 flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <TopBar
          account={account}
          chainId={chainId}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          onConnect={onConnect}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full max-w-7xl flex-col">
            <div className="flex-1 p-lg md:p-xl">
              {children}
            </div>
            <SiteFooter />
          </div>
        </main>
      </div>
    </div>
  );
}

