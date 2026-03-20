import React from 'react';
import { cn } from '@/lib/utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hoverable = false, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border p-md',
        hoverable && 'cursor-pointer transition-shadow hover:shadow-card-hover',
        className
      )}
      style={{
        background: 'var(--card)',
        borderColor: 'var(--border)',
        boxShadow: '0 14px 32px rgba(5, 7, 10, 0.08)',
        ...style,
      }}
      {...props}
    />
  )
);

Card.displayName = 'Card';

type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-xs pb-md border-b', className)}
      style={{ borderColor: 'var(--border)', ...style }}
      {...props}
    />
  )
);

CardHeader.displayName = 'CardHeader';

type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>;

const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, style, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-lg font-semibold leading-6', className)}
      style={{ color: 'var(--text)', ...style }}
      {...props}
    />
  )
);

CardTitle.displayName = 'CardTitle';

type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;

const CardDescription = React.forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ className, style, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-sm', className)}
      style={{ color: 'var(--text-muted)', ...style }}
      {...props}
    />
  )
);

CardDescription.displayName = 'CardDescription';

type CardContentProps = React.HTMLAttributes<HTMLDivElement>;

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('pt-md', className)}
      {...props}
    />
  )
);

CardContent.displayName = 'CardContent';

type CardFooterProps = React.HTMLAttributes<HTMLDivElement>;

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center pt-md border-t gap-md', className)}
      style={{ borderColor: 'var(--border)', ...style }}
      {...props}
    />
  )
);

CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
export type { CardProps, CardHeaderProps, CardTitleProps, CardDescriptionProps, CardContentProps, CardFooterProps };
