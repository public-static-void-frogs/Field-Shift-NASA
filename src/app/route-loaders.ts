import type { LoaderFunctionArgs } from 'react-router-dom';
import { isGuid } from '../utils/ids.ts';
import { isPlanDate } from '../features/planning/utils/planningDates.ts';

function requirePositiveId(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Response(null, { status: 404 });
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Response(null, { status: 404 });
  }
  return id;
}
export type FieldRouteData = {
  fieldId: string;
};

export function fieldLoader({ params }: LoaderFunctionArgs): FieldRouteData {
  if (!isGuid(params.fieldId)) {
    throw new Response(null, { status: 404 });
  }
  return { fieldId: params.fieldId.toLowerCase() };
}
export type ParcelRouteData = {
  parcelId: number;
};

export function parcelLoader({ params }: LoaderFunctionArgs): ParcelRouteData {
  return { parcelId: requirePositiveId(params.parcelId) };
}
export function calendarLoader({ params }: LoaderFunctionArgs) {
  if (params.date && !isPlanDate(params.date)) {
    throw new Response(null, { status: 404 });
  }
  return null;
}
