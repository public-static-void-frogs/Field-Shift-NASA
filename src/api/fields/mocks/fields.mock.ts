import type { CropOption, Parcel } from '../../../types/fields/api.types.ts';
import type { Field } from '../../../types/fields/field.types.ts';

export const initialFields: Field[] = [
  {
    id: 1,
    name: 'North Meadow',
    crop: 'Winter wheat',
    area: 24.8,
    health: 92,
    moisture: 64,
    nitrogen: 42,
    status: 'Healthy',
    planted: 'September 18, 2025',
  },
  {
    id: 2,
    name: 'Riverside',
    crop: 'Corn',
    area: 18.5,
    health: 68,
    moisture: 38,
    nitrogen: 28,
    status: 'Needs attention',
    planted: 'April 12, 2026',
  },
  {
    id: 3,
    name: 'Oak Valley',
    crop: 'Soybeans',
    area: 32.2,
    health: 88,
    moisture: 58,
    nitrogen: 38,
    status: 'Healthy',
    planted: 'April 21, 2026',
  },
  {
    id: 4,
    name: 'East Ridge',
    crop: 'Winter wheat',
    area: 16.4,
    health: 45,
    moisture: 32,
    nitrogen: 12,
    status: 'Critical',
    planted: 'September 22, 2025',
  },
  {
    id: 5,
    name: 'South Pasture',
    crop: 'Corn',
    area: 28.1,
    health: 94,
    moisture: 67,
    nitrogen: 45,
    status: 'Healthy',
    planted: 'April 16, 2026',
  },
];

export const parcels: Parcel[] = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1,
  name: initialFields[index]?.name ?? 'West Orchard',
  crop: 'Soybeans',
  area: 12.6,
  soilType: 'Loam',
}));

export const cropOptions: CropOption[] = ['Winter wheat', 'Corn', 'Soybeans'].map((value) => ({
  value,
  label: value,
}));
