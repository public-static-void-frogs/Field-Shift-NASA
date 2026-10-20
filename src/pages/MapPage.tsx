import { Alert, Button } from 'antd';
import { Plus } from 'lucide-react';
import { useFarm } from '../hooks/useFarm';
import { PageHeading } from '../components/common/PageHeading';
import { FarmStats } from '../components/common/FarmStats';
import { MapCard } from '../components/map/MapCard';
import { parcels } from '../data/fields';
import type { Navigate } from '../types/navigation';

export function MapPage({ navigate, adding = false }: { navigate: Navigate; adding?: boolean; }) {
  const { fields } = useFarm();
  const allOwned = fields.length >= parcels.length;
  return (
    <>
      <PageHeading
        title={adding ? 'Make room for your next harvest.' : 'See the bigger picture.'}
        description={adding ? 'Choose an available outlined parcel on the map to add it to your farm.' : 'Explore your land, check crop health, and manage your fields.'}
        actions={<Button
          type={adding ? 'default' : 'primary'}
          icon={!adding && <Plus size={19} />}
          onClick={() => navigate(adding ? '/map' : '/map/add')}
        >
          {adding ? 'Cancel adding' : 'Add field'}
        </Button>}
      />
      {adding && <Alert
        className="section-gap"
        type={allOwned ? 'warning' : 'info'}
        showIcon
        title={allOwned ? 'All mapped parcels are part of your farm.' : 'Select an available parcel to get started.'}
        description={allOwned ? 'Open an existing field to manage or remove it.' : 'Available parcels have a dashed outline. Select one to enter its name and crop.'}
      />}
      <FarmStats />
      <MapCard
        navigate={navigate}
        expanded
        adding={adding}
      />
    </>
  );
}
