import type { LoaderFunctionArgs } from 'react-router-dom';
import type { FieldRouteData, ParcelRouteData } from '../types/shared/router.types.ts';
import { isPlanDate } from '../utils/planningDates.ts';

function requirePositiveId(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) throw new Response(null, { status: 404 });
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Response(null, { status: 404 });
  return id;
}
export function fieldLoader({ params }: LoaderFunctionArgs): FieldRouteData {
  return { fieldId: requirePositiveId(params.fieldId) };
}
export function parcelLoader({ params }: LoaderFunctionArgs): ParcelRouteData {
  return { parcelId: requirePositiveId(params.parcelId) };
}
export function calendarLoader({ params }: LoaderFunctionArgs) {
  if (params.date && !isPlanDate(params.date)) throw new Response(null, { status: 404 });
  return null;
}
