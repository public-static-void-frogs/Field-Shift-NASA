export type LandEventCategory =
  'Crop rotation' | 'Soil conditions' | 'Field work' | 'Weather & water';

export interface LandEvent {
  id: string;
  date: string;
  category: LandEventCategory;
  title: string;
  description: string;
  measurements?: string[];
  attention?: boolean;
}
export interface CropSeason {
  year: number;
  crop: string;
  planted: string;
  harvested: string;
  yield: string;
  soilCondition: string;
}

export interface CropSeasonDetails {
  planted: string;
  harvested: string;
  yield: number;
}
