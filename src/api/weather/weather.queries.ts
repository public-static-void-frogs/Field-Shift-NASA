import { queryOptions } from '@tanstack/react-query';
import type { UserSettings } from '../../types/auth/auth.types.ts';
import type { HistoryPeriod } from './weather.api.ts';
import { weatherApi } from './weather.api.ts';

export type WeatherLocation = Pick<
  UserSettings,
  'latitude' | 'longitude' | 'location' | 'timeZone' | 'units'
>;

function locationKey(location: WeatherLocation) {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    location: location.location,
    timeZone: location.timeZone,
    units: location.units,
  };
}

export const weatherQueryKeys = {
  all: () => ['weather'] as const,
  current: (location: WeatherLocation) => ['weather', locationKey(location), 'current'] as const,
  forecast: (location: WeatherLocation) => ['weather', locationKey(location), 'forecast'] as const,
  history: (location: WeatherLocation, period: HistoryPeriod) =>
    ['weather', locationKey(location), 'history', period] as const,
};

const pollingOptions = {
  staleTime: 5 * 60_000,
  refetchInterval: 10 * 60_000,
  retry: false,
};

export const weatherQueries = {
  current: (location: WeatherLocation) =>
    queryOptions({
      ...pollingOptions,
      queryKey: weatherQueryKeys.current(location),
      queryFn: ({ signal }) => weatherApi.getCurrent(signal),
      enabled: location.latitude !== null && location.longitude !== null,
    }),
  forecast: (location: WeatherLocation) =>
    queryOptions({
      ...pollingOptions,
      queryKey: weatherQueryKeys.forecast(location),
      queryFn: ({ signal }) => weatherApi.getForecast(signal),
      enabled: location.latitude !== null && location.longitude !== null,
    }),
  history: (location: WeatherLocation, period: HistoryPeriod) =>
    queryOptions({
      queryKey: weatherQueryKeys.history(location, period),
      queryFn: ({ signal }) => weatherApi.getHistory(period, signal),
      staleTime: 30 * 60_000,
      retry: false,
      enabled: location.latitude !== null && location.longitude !== null,
    }),
};
