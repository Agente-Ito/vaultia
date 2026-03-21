import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

// Structural classes only — colors via inline styles for CSS var support
const buttonBase = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded font-light transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 text-xs',
        lg: 'h-11 px-6 text-sm',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

// Vaultia strict state logic: Grey (inactive) → Amber (pending) → Green (active)
const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  // Primary — black/white: main action
  primary:   { background: 'var(--text)',     color: 'var(--bg)',       letterSpacing: '0.07em', textTransform: 'uppercase' },
  // Secondary — grey border: default inactive state
  secondary: { background: 'transparent',    color: 'var(--text-muted)', border: '1px solid var(--border)', letterSpacing: '0.07em', textTransform: 'uppercase' },
  // Ghost — no bg: low-emphasis
  ghost:     { background: 'transparent',    color: 'var(--text-muted)', letterSpacing: '0.05em' },
  // Danger — blocked state
  danger:    { background: 'var(--blocked)', color: '#fff',            letterSpacing: '0.07em', textTransform: 'uppercase' },
  // Success / Active state
  success:   { background: 'var(--active)',  color: '#fff',            letterSpacing: '0.07em', textTransform: 'uppercase' },
  // Pending — amber: simulation / processing
  pending:   { background: 'var(--pending)', color: '#fff',            letterSpacing: '0.07em', textTransform: 'uppercase' },
  // Outline grey — inactive state
  outline:   { background: 'transparent',    color: 'var(--text-muted)', border: '1px solid var(--inactive)', letterSpacing: '0.05em' },
};

const HOVER_STYLES: Record<string, string> = {
  primary:   'hover:opacity-80',
  secondary: 'hover:border-[#FFB000] hover:text-[#FFB000]',
  ghost:     'hover:text-[var(--text)]',
  danger:    'hover:opacity-85',
  success:   'hover:opacity-85',
  pending:   'hover:opacity-85',
  outline:   'hover:border-[#FFB000] hover:text-[#FFB000]',
};

type Variant = keyof typeof VARIANT_STYLES;

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonBase> {
  variant?: Variant;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size, fullWidth, style, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonBase({ size, fullWidth }), HOVER_STYLES[variant] ?? '', className)}
      style={{ ...VARIANT_STYLES[variant], ...style }}
      {...props}
    />
  )
);

Button.displayName = 'Button';

const buttonVariants = buttonBase;

export { Button, buttonVariants };
export type { ButtonProps };
