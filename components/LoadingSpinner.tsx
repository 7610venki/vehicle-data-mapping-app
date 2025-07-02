
import React from 'react';

// Props for the main spinner
interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

// Props for the RingSpinner
interface RingSpinnerProps {
  className?: string;
}

// The RingSpinner component - a common pattern in Shadcn for inline loading
const RingSpinner = ({ className }: RingSpinnerProps) => (
    <div className={`animate-spin rounded-full border-2 border-transparent border-b-primary ${className || 'h-5 w-5'}`}></div>
);

// The main LoadingSpinner component
const LoadingSpinnerBase = ({ message, size = 'md' }: LoadingSpinnerProps) => {
  const sizeClasses = {
    sm: 'h-6 w-6 border-2', 
    md: 'h-10 w-10 border-[3px]', // Default size
    lg: 'h-16 w-16 border-4',
  };

  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div 
        className={`animate-spin rounded-full border-transparent border-t-primary ${sizeClasses[size]}`}
        role="status"
        aria-label="Loading"
      >
        <span className="sr-only">Loading...</span>
      </div>
      {message && <p className="mt-5 text-base text-muted-foreground">{message}</p>}
    </div>
  );
};


type LoadingSpinnerComponent = typeof LoadingSpinnerBase & {
  Ring: typeof RingSpinner;
};

const LoadingSpinner = LoadingSpinnerBase as LoadingSpinnerComponent;
LoadingSpinner.Ring = RingSpinner;

export default LoadingSpinner;
