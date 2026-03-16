import React from 'react';
import { cn } from '@/lib/utils/cn';

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded bg-neutral-200 dark:bg-neutral-700', className)}
      {...props}
    />
  );
}

// Pre-built skeleton layouts for common patterns
export function SkeletonStatCard() {
  return (
    <div className="space-y-sm">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center justify-between py-sm">
      <div className="space-y-xs flex-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-6 w-16 ml-md" />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="space-y-md p-md border border-neutral-200 dark:border-neutral-700 rounded-md">
      <div className="flex justify-between items-start">
        <div className="space-y-xs">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-sm">
        <div className="space-y-xs">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="space-y-xs">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-24" />
        </div>
      </div>
    </div>
  );
}
