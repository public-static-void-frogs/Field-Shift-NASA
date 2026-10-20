export const historyRanges = ['7 days', '30 days', '90 days'] as const;

export type HistoryRange = typeof historyRanges[number];

export interface WeatherRecord {
  key: number;
  date: string;
  today: boolean;
  conditions: string;
  temperature: number;
  low: number;
  rainfall: number;
  humidity: number;
  wind: number;
  moisture: number;
}
export const weatherHistory: WeatherRecord[] = Array.from({ length: 90 }, (_, index) => ({
  key: index,
  date: new Date(2026, 4, 24 - index).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }),
  today: index === 0,
  conditions: index % 4 === 2 ? 'Light rain' : index % 3 === 1 ? 'Partly cloudy' : 'Mostly sunny',
  temperature: 24 - index % 6,
  low: 16 - index % 4,
  rainfall: index % 4 === 2 ? 6.4 : 0,
  humidity: 62 + index % 5 * 3,
  wind: 12 + index % 4,
  moisture: 48 + index % 5 * 2,
}));
