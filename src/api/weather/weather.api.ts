import type { CurrentWeather, WeatherRecord } from '../../types/weather/weather.types.ts';
import { request } from '../core/http.ts';

export type HistoryRange = '7 days' | '30 days' | '90 days';

export const weatherApi = {
  getCurrent: (signal?: AbortSignal): Promise<CurrentWeather> =>
    request('/weather/current', { signal }),
  getHistory: (range: HistoryRange, signal?: AbortSignal): Promise<WeatherRecord[]> =>
    request(`/weather/history?days=${Number.parseInt(range)}`, { signal }),
};
