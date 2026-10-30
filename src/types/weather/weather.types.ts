export interface WeatherRecord {
  key: number;
  date: string;
  today: boolean;
  conditions: string;
  weatherCode: number | null;
  temperature: number | null;
  low: number | null;
  rainfall: number | null;
  humidity: number | null;
  wind: number | null;
  windDirection: number | null;
  moisture: number | null;
  rainChance: number | null;
}

export type WeatherMetric = 'temperature' | 'rainfall' | 'moisture' | 'humidity' | 'wind';

export interface WeatherUnits {
  temperature: string;
  rainfall: string;
  wind: string;
  humidity: string;
  moisture: string;
}

export interface WeatherMetadata {
  location: string;
  latitude: number;
  longitude: number;
  gridLatitude: number;
  gridLongitude: number;
  timeZone: string;
  fetchedAt: string;
  source: string;
  sourceUrl: string;
  units: WeatherUnits;
  soilDepth: string;
  dataKind: 'forecast' | 'historical_model';
}

export interface WeatherSeries extends WeatherMetadata {
  records: WeatherRecord[];
}

export type WeatherCondition = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'fog';

export interface CurrentWeather extends WeatherMetadata {
  observedAt: string;
  condition: WeatherCondition;
  temperature: number | null;
  conditions: string;
  feelsLike: number | null;
  high: number | null;
  low: number | null;
  humidity: number | null;
  wind: number | null;
  windDirection: number | null;
  rainChance: number | null;
  forecast: WeatherRecord[];
}
