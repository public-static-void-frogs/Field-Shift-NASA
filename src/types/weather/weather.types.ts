export type HistoryRange = '7 days' | '30 days' | '90 days';

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
export type WeatherMetric = 'temperature' | 'rainfall' | 'moisture' | 'humidity' | 'wind';

export type WeatherCondition = 'sunny' | 'cloudy' | 'rain';
export interface ForecastDay {
  day: string;
  temperature: number;
  condition: WeatherCondition;
}
export interface CurrentWeather {
  condition: WeatherCondition;
  location: string;
  temperature: number;
  conditions: string;
  feelsLike: number;
  high: number;
  low: number;
  humidity: number;
  wind: number;
  rainChance: number;
  forecast: ForecastDay[];
}
export interface WeatherMetricConfig {
  title: string;
  unit: string;
  color: string;
  description: string;
}
