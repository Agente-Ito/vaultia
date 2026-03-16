import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-xs py-xs text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      variant: {
        primary: 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
        success: 'bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-200',
        warning: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200',
        danger: 'bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-200',
        neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
);

Badge.displayName = 'Badge';

export { Badge, badgeVariants };
export type { BadgeProps };
