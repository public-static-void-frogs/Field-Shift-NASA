import type { CreateFieldInput } from '../../../types/fields/api.types.ts';
import type { Field } from '../../../types/fields/field.types.ts';
import { cropOptions, initialFields, parcels } from './fields.mock.ts';

let fields = structuredClone(initialFields);
export function getMockFields() {
  return fields;
}
export function getMockField(id: number) {
  return fields.find((field) => field.id === id);
}
export function createMockField(input: CreateFieldInput): Field {
  const parcel = parcels.find((item) => item.id === input.parcelId);
  if (!parcel || getMockField(input.parcelId)) {
    throw new Error('Parcel is unavailable');
  }
  if (!input.name.trim() || input.name.trim().length > 60) {
    throw new Error('Invalid field name');
  }
  if (!cropOptions.some((option) => option.value === input.crop)) {
    throw new Error('Invalid crop');
  }
  const field: Field = {
    id: parcel.id,
    name: input.name.trim(),
    crop: input.crop,
    area: parcel.area,
    health: 86,
    moisture: 59,
    nitrogen: 40,
    status: 'Healthy',
    planted: 'May 1, 2026',
  };
  fields = [...fields, field];
  return field;
}
export function removeMockField(id: number) {
  if (!getMockField(id)) {
    throw new Error('Field not found');
  }
  fields = fields.filter((field) => field.id !== id);
  return id;
}
