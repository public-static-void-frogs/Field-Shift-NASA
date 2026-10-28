import { FieldsTable } from '../components/fields/FieldsTable';
import type { FieldsPageProps } from '../types/fields/FieldsPage.types.ts';

export function FieldsPage({ navigate }: FieldsPageProps) {
  return <FieldsTable navigate={navigate} />;
}
