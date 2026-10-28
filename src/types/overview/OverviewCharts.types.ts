import type { ReactNode } from 'react';

export type ChartCardProps = {
  title: string;
  controls?: ReactNode;
  children: (animate: boolean) => ReactNode;
  className?: string;
};
