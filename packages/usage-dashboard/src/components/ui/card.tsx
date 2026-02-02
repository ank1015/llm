import type React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps): React.ReactElement {
  return (
    <div className={`bg-zinc-800/50 border border-zinc-700/50 rounded-2xl ${className}`}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className = '' }: CardHeaderProps): React.ReactElement {
  return <div className={`px-5 pt-5 ${className}`}>{children}</div>;
}

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function CardTitle({ children, className = '' }: CardTitleProps): React.ReactElement {
  return <h3 className={`text-sm font-medium text-zinc-400 ${className}`}>{children}</h3>;
}

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className = '' }: CardContentProps): React.ReactElement {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>;
}
