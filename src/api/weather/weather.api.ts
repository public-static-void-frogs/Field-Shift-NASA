import type { CurrentWeather, WeatherRecord } from '../../types/weather/weather.types.ts';
import { mockResponse } from '../core/mock-response.ts';
import { currentWeather, weatherHistory } from './mocks/weather.mock.ts';

export type HistoryRange = '7 days' | '30 days' | '90 days';

export const weatherApi = {
  getCurrent: (signal?: AbortSignal): Promise<CurrentWeather> =>
    mockResponse(() => currentWeather, signal),
  getHistory: (range: HistoryRange, signal?: AbortSignal): Promise<WeatherRecord[]> =>
    mockResponse(() => weatherHistory.slice(0, Number.parseInt(range)), signal),
};
