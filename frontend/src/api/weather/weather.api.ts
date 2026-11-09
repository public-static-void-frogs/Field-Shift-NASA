import type { CurrentWeather, WeatherSeries } from '../../types/weather/weather.types.ts';
import { request } from '../core/http.ts';

export type HistoryRange = '7 days' | '30 days' | '90 days';
export type HistoryPeriod = { range: HistoryRange } | { startDate: string; endDate: string };

export const weatherApi = {
  getCurrent: (signal?: AbortSignal): Promise<CurrentWeather> =>
    request('/weather/current', { signal }),
  getForecast: (signal?: AbortSignal, fieldId?: string): Promise<WeatherSeries> => {
    const params = new URLSearchParams();
    if (fieldId) {
      params.set('field_id', fieldId);
    }
    return request(`/weather/forecast?${params}`, { signal });
  },
  getHistory: (
    period: HistoryPeriod,
    signal?: AbortSignal,
    fieldId?: string,
  ): Promise<WeatherSeries> => {
    const params = new URLSearchParams();
    if (fieldId) {
      params.set('field_id', fieldId);
    }
    if ('range' in period) {
      params.set('days', String(Number.parseInt(period.range)));
    } else {
      params.set('start_date', period.startDate);
      params.set('end_date', period.endDate);
    }
    return request(`/weather/history?${params}`, { signal });
  },
};
