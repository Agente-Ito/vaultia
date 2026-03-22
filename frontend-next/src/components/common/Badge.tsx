import React from 'react';
import { cn } from '@/lib/utils/cn';

// Vaultia state logic: Grey (inactive) → Amber (pending) → Green (active/success)
const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  primary: { background: 'rgba(29,29,31,0.07)',  color: 'var(--text)',         border: '1px solid var(--border)' },
  success: { background: 'rgba(16,185,129,0.1)', color: '#10B981' },
  warning: { background: 'rgba(255,176,0,0.1)',  color: '#FFB000' },
  danger:  { background: 'rgba(239,68,68,0.1)',  color: 'var(--blocked)' },
  neutral: { background: 'var(--inactive)',       color: 'var(--text-muted)',   border: '1px solid var(--border)' },
  // Explicit state aliases
  inactive:{ background: 'var(--inactive)',       color: 'var(--text-muted)' },
  pending: { background: 'rgba(255,176,0,0.1)',  color: '#FFB000' },
  active:  { background: 'rgba(16,185,129,0.1)', color: '#10B981' },
};

type Variant = keyof typeof VARIANT_STYLES;

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  pulse?: boolean;
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'neutral', pulse, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs whitespace-nowrap',
        pulse && 'animate-breathe',
        className,
      )}
      style={{
        fontWeight: 400,
        letterSpacing: '0.04em',
        ...VARIANT_STYLES[variant],
        ...style,
      }}
      {...props}
    />
  )
);

Badge.displayName = 'Badge';

const badgeVariants = () => '';

export { Badge, badgeVariants };
export type { BadgeProps };
