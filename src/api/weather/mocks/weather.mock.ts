import type { CurrentWeather, WeatherRecord } from '../../../types/weather/weather.types.ts';
export const weatherHistory: WeatherRecord[] = Array.from({ length: 90 }, (_, index) => ({
  key: index,
  date: new Date(2026, 4, 24 - index).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
  today: index === 0,
  conditions: index % 4 === 2 ? 'Light rain' : index % 3 === 1 ? 'Partly cloudy' : 'Mostly sunny',
  temperature: 24 - (index % 6),
  low: 16 - (index % 4),
  rainfall: index % 4 === 2 ? 6.4 : 0,
  humidity: 62 + (index % 5) * 3,
  wind: 12 + (index % 4),
  moisture: 48 + (index % 5) * 2,
}));

export const currentWeather: CurrentWeather = {
  condition: 'sunny',
  location: 'Iowa, US',
  temperature: 24,
  conditions: 'Mostly sunny',
  feelsLike: 26,
  high: 27,
  low: 16,
  humidity: 62,
  wind: 12,
  rainChance: 10,
  forecast: [
    { day: 'Today', temperature: 24, condition: 'sunny' },
    { day: 'Mon', temperature: 26, condition: 'sunny' },
    { day: 'Tue', temperature: 22, condition: 'cloudy' },
    { day: 'Wed', temperature: 23, condition: 'cloudy' },
    { day: 'Thu', temperature: 19, condition: 'rain' },
  ],
};
