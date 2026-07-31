import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:bg-brand-navy',
        outline:
          'border-border bg-card text-foreground shadow-xs hover:border-brand-indigo/30 hover:bg-brand-indigo-soft/45 hover:text-brand-indigo-strong aria-expanded:bg-muted',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-brand-indigo-strong',
        ghost:
          'text-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20',
        link: 'text-brand-indigo underline-offset-4 hover:text-brand-indigo-strong hover:underline',
      },
      size: {
        default: 'h-10 gap-2 px-4',
        xs: 'h-7 gap-1 rounded-md px-2 text-xs [&_svg:not([class*=size-])]:size-3',
        sm: 'h-9 gap-1.5 px-3 text-[0.8125rem] [&_svg:not([class*=size-])]:size-3.5',
        lg: 'h-12 gap-2.5 px-6 text-base',
        icon: 'size-10',
        'icon-xs': 'size-7 rounded-md [&_svg:not([class*=size-])]:size-3',
        'icon-sm': 'size-9',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  render,
  nativeButton,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      render={render}
      nativeButton={nativeButton ?? !render}
      {...props}
    />
  );
}

export { Button, buttonVariants };
