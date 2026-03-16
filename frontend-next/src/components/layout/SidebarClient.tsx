'use client';

import { Sidebar } from './Sidebar';

export function SidebarClient({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return <Sidebar isOpen={isOpen} onClose={onClose} />;
}
