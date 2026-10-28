import { updateStrategyResponse } from '../../features/planning/utils/eventResponses.ts';
import type {
  EventResponses,
  FieldStrategy,
  PlannedEvent,
  PlanningContext,
  RotationPlan,
  StrategyResponseInput,
} from '../../types/planning/planning.types.ts';
import { mockResponse } from '../core/mock-response.ts';
import { getMockField, getMockFields } from '../fields/mocks/fields.store.ts';
import { planningToday } from './mocks/agronomy.mock.ts';
import { getFieldPlanEvents, getRotationPlan, getSystemPlanEvents } from './mocks/planning.mock.ts';
import { getMockResponses, saveMockResponses } from './mocks/responses.store.ts';
import { getFieldStrategy } from './mocks/strategy.mock.ts';

export const planningApi = {
  getContext: (signal?: AbortSignal): Promise<PlanningContext> =>
    mockResponse(() => ({ today: planningToday }), signal),
  getEvents: (signal?: AbortSignal): Promise<PlannedEvent[]> =>
    mockResponse(() => getSystemPlanEvents(getMockFields()), signal),
  getFieldEvents: (id: number, signal?: AbortSignal): Promise<PlannedEvent[]> =>
    mockResponse(() => {
      const field = getMockField(id);
      return field ? getFieldPlanEvents(field) : [];
    }, signal),
  getRotation: (id: number, signal?: AbortSignal): Promise<RotationPlan | null> =>
    mockResponse(() => {
      const field = getMockField(id);
      return field ? getRotationPlan(field) : null;
    }, signal),
  getStrategy: (id: number, signal?: AbortSignal): Promise<FieldStrategy | null> =>
    mockResponse(() => {
      const field = getMockField(id);
      return field ? getFieldStrategy(field) : null;
    }, signal),
  getResponses: (signal?: AbortSignal): Promise<EventResponses> =>
    mockResponse(getMockResponses, signal),
  respondToStrategy: ({ fieldId, status }: StrategyResponseInput): Promise<EventResponses> =>
    mockResponse(() => {
      const field = getMockField(fieldId);
      if (!field) {
        throw new Error('Field not found');
      }
      return saveMockResponses(
        updateStrategyResponse(getMockResponses(), getFieldPlanEvents(field), status),
      );
    }),
};
