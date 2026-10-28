import type { ReactNode } from 'react';

export interface QueryBoundaryProps {
  children: ReactNode;
  onReset: () => void;
}
export interface QueryBoundaryState {
  hasError: boolean;
}
export interface QueryErrorProps {
  retry: () => void;
}
