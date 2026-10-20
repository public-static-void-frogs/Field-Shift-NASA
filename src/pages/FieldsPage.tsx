import { Button } from 'antd';
import { Plus } from 'lucide-react';
import { PageHeading } from '../components/common/PageHeading';
import { FarmStats } from '../components/common/FarmStats';
import { FieldsTable } from '../components/fields/FieldsTable';
import type { Navigate } from '../types/navigation';

export function FieldsPage({ navigate }: { navigate: Navigate; }) {
  return (
    <><PageHeading
      title="Every field. In focus."
      description="A closer look at the land you care for, all in one place."
      actions={<Button
        type="primary"
        icon={<Plus size={19} />}
        onClick={() => navigate('/map/add')}
      >Add field</Button>}
    /><FarmStats /><FieldsTable navigate={navigate} /></>
  );
}
