export type PlanCategory =
  | 'Crop rotation'
  | 'Soil check'
  | 'Nutrition'
  | 'Irrigation'
  | 'Crop inspection'
  | 'Harvest'
  | 'Field preparation';

export type PlanPriority = 'Routine' | 'Important' | 'High priority';

export interface RotationPlan {
  fieldId: number;
  currentCrop: string;
  nextCrop: string;
  followingCrop: string;
  confidence: number;
  sowingDate: string;
  windowEnd: string;
  followingDate: string;
  dateExplanation: string;
  reasons: string[];
  inputs: { label: string; value: string }[];
}
export interface PlannedEvent {
  id: string;
  fieldId: number;
  fieldName: string;
  date: string;
  category: PlanCategory;
  title: string;
  description: string;
  priority: PlanPriority;
  duration: string;
  rationale: string;
}

export type EventDecision = 'proposed' | 'accepted' | 'declined';
export interface EventResponse {
  status: Exclude<EventDecision, 'proposed'>;
  fingerprint: string;
}
export type EventResponses = Record<string, EventResponse>;
