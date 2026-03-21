'use client';

import React from 'react';
import { useDisplayName } from '@/hooks/useDisplayName';

interface AddressDisplayProps {
  address: string;
  className?: string;
  /** Use font-mono for the display text (default: true) */
  mono?: boolean;
  /** Show ◎ indicator when a name is resolved (default: true) */
  showResolvedIndicator?: boolean;
}

/**
 * Renders a resolved name for an address (contact alias → UP profile → truncated).
 * Always shows the full address as a tooltip via `title` attribute.
 * Zero layout shift: the element size stays consistent as the name resolves.
 */
export function AddressDisplay({
  address,
  className,
  mono = true,
  showResolvedIndicator = true,
}: AddressDisplayProps) {
  const { name, isResolved } = useDisplayName(address);

  return (
    <span
      className={mono ? `font-mono${className ? ` ${className}` : ''}` : className}
      title={address}
    >
      {name}
      {isResolved && showResolvedIndicator && (
        <span className="ml-0.5 opacity-40 not-italic" aria-hidden="true">◎</span>
      )}
    </span>
  );
}
