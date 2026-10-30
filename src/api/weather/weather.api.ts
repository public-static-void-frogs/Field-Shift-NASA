import type { CurrentWeather, WeatherSeries } from '../../types/weather/weather.types.ts';
import { request } from '../core/http.ts';

export type HistoryRange = '7 days' | '30 days' | '90 days';
export type HistoryPeriod = { range: HistoryRange } | { startDate: string; endDate: string };

export const weatherApi = {
  getCurrent: (signal?: AbortSignal): Promise<CurrentWeather> =>
    request('/weather/current', { signal }),
  getForecast: (signal?: AbortSignal): Promise<WeatherSeries> =>
    request('/weather/forecast', { signal }),
  getHistory: (period: HistoryPeriod, signal?: AbortSignal): Promise<WeatherSeries> => {
    const params = new URLSearchParams();
    if ('range' in period) {
      params.set('days', String(Number.parseInt(period.range)));
    } else {
      params.set('start_date', period.startDate);
      params.set('end_date', period.endDate);
    }
    return request(`/weather/history?${params}`, { signal });
  },
};
