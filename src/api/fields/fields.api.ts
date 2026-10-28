import type {
  CropOption,
  FieldHistory,
  FieldPropertyData,
  FieldRecommendationData,
  Parcel,
} from '../../types/fields/api.types.ts';
import type { Field } from '../../types/fields/field.types.ts';
import { mockResponse } from '../core/mock-response.ts';
import { getMockResponses, saveMockResponses } from '../planning/mocks/responses.store.ts';
import { cropOptions, parcels } from './mocks/fields.mock.ts';
import {
  createMockField,
  getMockField,
  getMockFields,
  removeMockField,
} from './mocks/fields.store.ts';
import { getCropSeasons, getLandHistory } from './mocks/history.mock.ts';
import { getCropProperties, getFieldProperties } from './mocks/properties.mock.ts';
import { getRecommendation } from './mocks/recommendations.mock.ts';

const cropGrowthStages: Record<string, string> = {
  'Winter wheat': 'Heading · BBCH 55',
  Corn: 'Vegetative · V6',
};
export type CreateFieldInput = {
  parcelId: number;
  name: string;
  crop: string;
};

export const fieldsApi = {
  getAll: (signal?: AbortSignal): Promise<Field[]> => mockResponse(getMockFields, signal),
  getById: (id: number, signal?: AbortSignal): Promise<Field | null> =>
    mockResponse(() => getMockField(id) ?? null, signal),
  getParcel: (id: number, signal?: AbortSignal): Promise<Parcel | null> =>
    mockResponse(() => parcels.find((parcel) => parcel.id === id) ?? null, signal),
  getCrops: (signal?: AbortSignal): Promise<CropOption[]> =>
    mockResponse(() => cropOptions, signal),
  getProperties: (id: number, signal?: AbortSignal): Promise<FieldPropertyData | null> =>
    mockResponse(() => {
      const field = getMockField(id);
      return field
        ? {
            soil: getFieldProperties(id),
            crop: getCropProperties(field),
            growthStage: cropGrowthStages[field.crop] ?? 'Vegetative · V3',
            lastSample: 'May 23, 2026 · 0–30 cm depth',
            cultivationPractice: 'Reduced tillage',
            tenure: 'Owner operated',
          }
        : null;
    }, signal),
  getHistory: (id: number, signal?: AbortSignal): Promise<FieldHistory | null> =>
    mockResponse(() => {
      const field = getMockField(id);
      return field ? { events: getLandHistory(field), seasons: getCropSeasons(field) } : null;
    }, signal),
  getRecommendation: (id: number, signal?: AbortSignal): Promise<FieldRecommendationData | null> =>
    mockResponse(() => {
      const field = getMockField(id);
      return field ? getRecommendation(field) : null;
    }, signal),
  create: (input: CreateFieldInput): Promise<Field> => mockResponse(() => createMockField(input)),
  remove: (id: number): Promise<number> =>
    mockResponse(() => {
      removeMockField(id);
      saveMockResponses(
        Object.fromEntries(
          Object.entries(getMockResponses()).filter(([key]) => !key.startsWith(`field-${id}-`)),
        ),
      );
      return id;
    }),
};
