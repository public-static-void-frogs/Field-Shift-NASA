import { FieldsTable } from '../components/fields/FieldsTable';
import type { Navigate } from '../types/navigation';

export function FieldsPage({ navigate }: { navigate: Navigate; }) {
  return <FieldsTable navigate={navigate} />;
}
