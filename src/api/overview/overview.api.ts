import type { OverviewData, TrendParams } from '../../types/overview/overview.types.ts';
import { mockResponse } from '../core/mock-response.ts';
import { getMockFields } from '../fields/mocks/fields.store.ts';
import { getCropAreas, getSampleFieldTrends } from './mocks/overview.mock.ts';

export const overviewApi = {
  getCharts: (params: TrendParams, signal?: AbortSignal): Promise<OverviewData> =>
    mockResponse(
      () => ({
        trends: getSampleFieldTrends(getMockFields(), params.days, params.metric),
        cropAreas: getCropAreas(getMockFields()),
      }),
      signal,
    ),
};
