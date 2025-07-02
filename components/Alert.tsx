
import React from 'react';
import { AlertTriangleIcon, InfoIcon, CheckIcon } from './Icons';

interface AlertProps {
  variant?: 'default' | 'destructive' | 'info' | 'success';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const Alert: React.FC<AlertProps> = ({ variant = 'default', title, children, className }) => {
  let variantClasses = '';
  let icon: React.ReactNode = null;
  let titleTextClass = 'text-foreground'; 

  // Shadcn-inspired Alert Styles using "Fluid Corporate Pastel"
  switch (variant) {
    case 'destructive':
      variantClasses = 'bg-destructive/10 border-destructive/30 text-destructive'; // Lighter bg, stronger text
      icon = <AlertTriangleIcon className="h-4 w-4 text-destructive flex-shrink-0" />;
      titleTextClass = 'text-destructive font-semibold';
      break;
    case 'info':
      variantClasses = 'bg-primary/10 border-primary/30 text-primary'; 
      icon = <InfoIcon className="h-4 w-4 text-primary flex-shrink-0" />;
      titleTextClass = 'text-primary font-semibold';
      break;
    case 'success':
        const successColor = 'text-green-600'; // Using a distinct green
        variantClasses = `bg-green-600/10 border-green-600/30 ${successColor}`;
        icon = <CheckIcon className={`h-4 w-4 ${successColor} flex-shrink-0`} />;
        titleTextClass = `${successColor} font-semibold`;
        break;
    case 'default':
    default:
      variantClasses = 'bg-muted border-border text-muted-foreground'; 
      icon = <InfoIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />; // Default icon for subtle alerts
      titleTextClass = 'text-foreground font-semibold';
      break;
  }

  return (
    <div role="alert" className={`relative w-full border rounded-lg p-4 shadow-fluid-sm ${variantClasses} ${className || ''}`}>
      <div className="flex items-start">
        {icon && <span className="mr-3 mt-0.5">{icon}</span>}
        <div className="flex-1">
          {title && <h5 className={`mb-1 text-sm leading-none tracking-tight ${titleTextClass}`}>{title}</h5>}
          <div className="text-sm opacity-95">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default Alert;
