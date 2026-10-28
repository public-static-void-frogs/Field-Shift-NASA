import type { DemoSource } from '../../../types/help/help.types.ts';

export const demoSources: DemoSource[] = [
  {
    key: 'weather',
    name: 'Example weather archive',
    data: 'Daily temperature, rainfall, and humidity',
    format: 'CSV',
  },
  {
    key: 'soil',
    name: 'Sample soil survey',
    data: 'Soil pH, moisture, nutrients, and organic matter',
    format: 'GeoJSON',
  },
  {
    key: 'crop',
    name: 'Demo crop reference',
    data: 'Crop characteristics, planting windows, and rotation sequences',
    format: 'JSON',
  },
];
