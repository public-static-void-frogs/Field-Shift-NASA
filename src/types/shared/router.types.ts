export interface FieldRouteData {
  fieldId: number;
}
export interface ParcelRouteData {
  parcelId: number;
}
export interface AppRouteHandle {
  navigationKey?: string;
  workspace?: 'map' | 'calendar' | 'fields';
  preserveScroll?: boolean;
}
