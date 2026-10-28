import type { FarmProfile } from '../../types/farm/farm.types.ts';
import { mockResponse } from '../core/mock-response.ts';
import { farmProfile } from './mocks/farm.mock.ts';

export const farmApi = {
  getProfile: (signal?: AbortSignal): Promise<FarmProfile> =>
    mockResponse(() => farmProfile, signal),
};
