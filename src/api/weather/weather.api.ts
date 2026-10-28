import type {
  CurrentWeather,
  HistoryRange,
  WeatherRecord,
} from '../../types/weather/weather.types.ts';
import { mockResponse } from '../core/mock-response.ts';
import { currentWeather, weatherHistory } from './mocks/weather.mock.ts';

export const weatherApi = {
  getCurrent: (signal?: AbortSignal): Promise<CurrentWeather> =>
    mockResponse(() => currentWeather, signal),
  getHistory: (range: HistoryRange, signal?: AbortSignal): Promise<WeatherRecord[]> =>
    mockResponse(() => weatherHistory.slice(0, Number.parseInt(range)), signal),
};
