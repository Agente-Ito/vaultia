'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMode } from '@/context/ModeContext';
import { cn } from '@/lib/utils/cn';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/vaults', label: 'Vaults', icon: '🔐' },
  { href: '/rules', label: 'Rules', icon: '🛡️' },
  { href: '/activity', label: 'Activity', icon: '📈' },
  { href: '/agents', label: 'Agents', icon: '🤖', advanced: true },
  { href: '/automation', label: 'Automation', icon: '⏰', advanced: true },
  { href: '/budgets', label: 'Budgets', icon: '💰', advanced: true },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { isAdvanced } = useMode();

  // Filter nav items based on mode
  const visibleItems = navItems.filter((item) => !item.advanced || isAdvanced);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-64 bg-neutral-900 text-neutral-50 border-r border-neutral-800 overflow-y-auto transition-transform duration-300 md:relative md:translate-x-0 md:w-64',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Sidebar header */}
        <div className="p-lg border-b border-neutral-800">
          <h1 className="text-xl font-bold text-white">
            💰 AI Finance OS
          </h1>
          <p className="text-xs text-neutral-400 mt-xs">
            {isAdvanced ? 'Advanced Mode' : 'Simple Mode'}
          </p>
        </div>

        {/* Navigation */}
        <nav className="space-y-xs p-md">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-md px-md py-xs rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                )}
              >
                <span className="text-lg" aria-hidden="true">{item.icon}</span>
                {item.label}
                {item.advanced && (
                  <span className="ml-auto text-xs bg-blue-600 px-xs py-xs rounded">
                    Pro
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="absolute bottom-0 left-0 right-0 p-md border-t border-neutral-800 bg-neutral-950">
          <p className="text-xs text-neutral-400">
            LUKSO Testnet 4201
          </p>
        </div>
      </div>
    </>
  );
}
