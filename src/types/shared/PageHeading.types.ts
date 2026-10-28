import type { ReactNode } from 'react';

export interface PageHeadingProps {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
}
