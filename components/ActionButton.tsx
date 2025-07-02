import React from 'react';
import { cn } from '../lib/utils';
import LoadingSpinner from './LoadingSpinner';

export interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'link' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactElement;
  iconPosition?: 'left' | 'right';
}

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ children, variant = 'primary', size = 'md', className, icon, iconPosition = 'left', disabled, ...props }, ref) => {
    
    const baseStyle = "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none ring-offset-background active:animate-subtlePress shadow-fluid-sm hover:shadow-fluid-md hover:-translate-y-px";
    const sizeStyles = { sm: "h-9 px-3 text-xs", md: "h-10 px-4 py-2 text-sm", lg: "h-11 px-8 text-base" };
    const variantStyles = {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary-hover",
        outline: "border border-input bg-card hover:bg-muted text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
        link: "text-primary hover:text-primary-hover underline-offset-4 hover:underline shadow-none hover:shadow-none",
    };
    
    const iconComponent = icon && React.isValidElement(icon) ? React.cloneElement(icon, {
        ...(icon.props as any),
        className: cn(
            (icon.props as any).className,
            "h-4 w-4", // Apply consistent sizing
            children ? (iconPosition === 'left' ? "mr-2" : "ml-2") : "" // Apply margin only if there's text
        )
    }) : null;

    return (
      <button className={cn(baseStyle, sizeStyles[size], variantStyles[variant], className)} disabled={disabled} ref={ref} {...props}>
        {iconPosition === 'left' && iconComponent}
        {children}
        {iconPosition === 'right' && iconComponent}
      </button>
    );
  }
);

ActionButton.displayName = 'ActionButton';

export default ActionButton;