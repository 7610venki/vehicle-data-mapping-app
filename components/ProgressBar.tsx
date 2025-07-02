
import React from 'react';

interface ProgressBarProps {
  value: number; // 0 to 100
  label?: string;
  size?: 'sm' | 'md' | 'lg'; 
}

const ProgressBar: React.FC<ProgressBarProps> = ({ value, label, size = 'md' }) => {
  const percentage = Math.max(0, Math.min(100, value));
  // Shadcn progress bar heights are often h-2, h-4
  const heightClasses = {
    sm: 'h-1.5', // ~6px
    md: 'h-2',   // ~8px
    lg: 'h-2.5'  // ~10px
  };

  return (
    <div className="w-full space-y-2">
      {label && <p className="text-xs font-medium text-muted-foreground text-center tracking-wide">{label}</p>}
      <div 
        className={`w-full bg-muted rounded-full ${heightClasses[size]} overflow-hidden shadow-inner`}
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || "Progress"}
      >
        <div
          className={`bg-primary h-full rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${percentage}%` }}
        >
        </div>
      </div>
    </div>
  );
};

export default ProgressBar;
