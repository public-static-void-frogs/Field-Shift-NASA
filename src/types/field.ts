export type FieldStatus = 'Healthy' | 'Needs attention' | 'Critical';

export interface Field {
  id: number;
  name: string;
  crop: string;
  area: number;
  health: number;
  moisture: number;
  nitrogen: number;
  status: FieldStatus;
  planted: string;
}
