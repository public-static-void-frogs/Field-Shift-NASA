import type { Navigate } from '../shared/navigation.types.ts';

export type MapCardProps = {
  navigate: Navigate;
  expanded?: boolean;
  adding?: boolean;
};
