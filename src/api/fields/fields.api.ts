import type {
  CropOption,
  FieldHistory,
  FieldPropertyData,
  FieldRecommendationData,
  Parcel,
} from '../../types/fields/api.types.ts';
import type { Field } from '../../types/fields/field.types.ts';
import { request } from '../core/http.ts';

export type CreateFieldInput = {
  parcelId: number;
  name: string;
  crop: string;
};

export const fieldsApi = {
  getAll: (signal?: AbortSignal): Promise<Field[]> => request('/fields', { signal }),
  getById: (id: number, signal?: AbortSignal): Promise<Field | null> =>
    request(`/fields/${id}`, { signal, allowMissing: true }),
  getParcel: (id: number, signal?: AbortSignal): Promise<Parcel | null> =>
    request(`/parcels/${id}`, { signal, allowMissing: true }),
  getCrops: (signal?: AbortSignal): Promise<CropOption[]> => request('/crops', { signal }),
  getProperties: (id: number, signal?: AbortSignal): Promise<FieldPropertyData | null> =>
    request(`/fields/${id}/properties`, { signal, allowMissing: true }),
  getHistory: (id: number, signal?: AbortSignal): Promise<FieldHistory | null> =>
    request(`/fields/${id}/history`, { signal, allowMissing: true }),
  getRecommendation: (id: number, signal?: AbortSignal): Promise<FieldRecommendationData | null> =>
    request(`/fields/${id}/recommendation`, { signal, allowMissing: true }),
  create: (input: CreateFieldInput): Promise<Field> =>
    request('/fields', { method: 'POST', body: JSON.stringify(input) }),
  remove: (id: number): Promise<number> => request(`/fields/${id}`, { method: 'DELETE' }),
};
