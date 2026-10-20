export type HealthLevel = 'Critical' | 'Struggling' | 'Fair' | 'Thriving';

export interface HealthPatch {
  x: number;
  y: number;
  radius: number;
  score: number;
}

export interface HealthZone {
  id: string;
  name: string;
  x: number;
  y: number;
  score: number;
  level: HealthLevel;
  description: string;
}
