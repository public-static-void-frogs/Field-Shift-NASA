import type { ReactNode } from 'react';
import type { Navigate } from '../shared/navigation.types.ts';

export type AppLayoutProps = {
  path: string;
  navigate: Navigate;
  children: ReactNode;
};
