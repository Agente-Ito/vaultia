'use client';

import * as React from 'react';
import { Drawer } from 'vaul';
import { cn } from '@/lib/utils/cn';

const Sheet = Drawer.Root;
const SheetTrigger = Drawer.Trigger;
const SheetClose = Drawer.Close;
const SheetPortal = Drawer.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof Drawer.Overlay>,
  React.ComponentPropsWithoutRef<typeof Drawer.Overlay>
>(({ className, ...props }, ref) => (
  <Drawer.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-black/50', className)}
    {...props}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof Drawer.Content> {
  side?: 'right' | 'left' | 'top' | 'bottom';
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof Drawer.Content>,
  SheetContentProps
>(({ side = 'right', className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <Drawer.Content
      ref={ref}
      className={cn(
        'fixed z-50 shadow-xl flex flex-col',
        side === 'right' && 'inset-y-0 right-0 w-full max-w-md border-l',
        side === 'left' && 'inset-y-0 left-0 w-full max-w-md border-r',
        side === 'bottom' && 'inset-x-0 bottom-0 max-h-[85vh] border-t rounded-t-xl',
        side === 'top' && 'inset-x-0 top-0 max-h-[85vh] border-b rounded-b-xl',
        className
      )}
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      {...props}
    >
      {children}
    </Drawer.Content>
  </SheetPortal>
));
SheetContent.displayName = 'SheetContent';

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center justify-between p-6 pb-0', className)} {...props} />
);
SheetHeader.displayName = 'SheetHeader';

const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn('text-lg font-semibold', className)}
      style={{ color: 'var(--text)' }}
      {...props}
    />
  )
);
SheetTitle.displayName = 'SheetTitle';

const SheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex-1 overflow-y-auto p-6', className)} {...props} />
);
SheetBody.displayName = 'SheetBody';

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex gap-3 p-6 pt-0 border-t', className)} style={{ borderColor: 'var(--border)' }} {...props} />
);
SheetFooter.displayName = 'SheetFooter';

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
};
