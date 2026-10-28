import type { DemoSource, TeamMember } from '../../types/help/help.types.ts';
import { mockResponse } from '../core/mock-response.ts';
import { demoSources } from './mocks/demoSources.mock.ts';
import { team } from './mocks/team.mock.ts';

export const helpApi = {
  getTeam: (signal?: AbortSignal): Promise<TeamMember[]> => mockResponse(() => team, signal),
  getSources: (signal?: AbortSignal): Promise<DemoSource[]> =>
    mockResponse(() => demoSources, signal),
};
