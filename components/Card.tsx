
import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}
const Card: React.FC<CardProps> = ({ className, children, ...props }) => (
  <div className={`rounded-xl border border-border bg-card text-foreground shadow-fluid-sm transition-all duration-300 ${className || ''}`} {...props}>
    {children}
  </div>
);

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}
const CardHeader: React.FC<CardHeaderProps> = ({ className, children, ...props }) => (
  <div className={`flex flex-col space-y-1.5 p-6 ${className || ''}`} {...props}>
    {children}
  </div>
);

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}
const CardTitle: React.FC<CardTitleProps> = ({ className, children, ...props }) => (
  <h3 className={`text-xl sm:text-2xl font-semibold leading-tight tracking-tight text-foreground ${className || ''}`} {...props}>
    {children}
  </h3>
);

interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}
const CardDescription: React.FC<CardDescriptionProps> = ({ className, children, ...props }) => (
  <p className={`text-sm text-muted-foreground ${className || ''}`} {...props}>
    {children}
  </p>
);

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}
const CardContent: React.FC<CardContentProps> = ({ className, children, ...props }) => (
  <div className={`p-6 ${className || ''}`} {...props}>
    {children}
  </div>
);

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}
const CardFooter: React.FC<CardFooterProps> = ({ className, children, ...props }) => (
  <div className={`flex items-center p-6 border-t border-border ${className || ''}`} {...props}> {/* Added default top border */}
    {children}
  </div>
);

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
