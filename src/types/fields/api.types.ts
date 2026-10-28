import type { CropSeason, LandEvent } from './history.types.ts';
import type { FieldProperties } from './properties.types.ts';

export interface CreateFieldInput {
  parcelId: number;
  name: string;
  crop: string;
}
export interface FieldFormValues {
  name: string;
  crop: string;
}
export interface Parcel {
  id: number;
  name: string;
  crop: string;
  area: number;
  soilType: string;
}
export interface CropOption {
  value: string;
  label: string;
}
export interface FieldPropertyData {
  soil: FieldProperties;
  crop: FieldProperties;
  growthStage: string;
  lastSample: string;
  cultivationPractice: string;
  tenure: string;
}
export interface FieldHistory {
  events: LandEvent[];
  seasons: CropSeason[];
}
export interface FieldRecommendationData {
  title: string;
  description: string;
}
