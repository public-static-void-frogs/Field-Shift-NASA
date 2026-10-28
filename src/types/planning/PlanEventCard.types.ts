import type { PlannedEvent } from './planning.types.ts';

export type PlanEventCardProps = {
  event: PlannedEvent;
  highlighted?: boolean;
  onSelect?: () => void;
};
