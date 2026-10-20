import type { Field } from '../types/field';

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
    planted: 'September 18, 2025'
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
    planted: 'April 12, 2026'
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
    planted: 'April 21, 2026'
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
    planted: 'September 22, 2025'
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
    planted: 'April 16, 2026'
  },
];

export const parcels = [
  {
    points: '235,68 435,95 417,225 205,202',
    x: 320,
    y: 146
  },
  {
    points: '450,99 617,122 591,281 428,237',
    x: 523,
    y: 191
  },
  {
    points: '198,219 408,243 383,394 159,352',
    x: 281,
    y: 305
  },
  {
    points: '630,125 768,146 730,315 604,283',
    x: 681,
    y: 218
  },
  {
    points: '425,257 585,299 549,430 397,401',
    x: 489,
    y: 360
  },
  {
    points: '619,313 727,339 686,456 584,436',
    x: 656,
    y: 386
  },
];

export const cropOptions = ["Winter wheat", "Corn", "Soybeans"].map(value => ({ value, label: value }));
