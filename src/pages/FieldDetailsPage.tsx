import { useSuspenseQueries } from '@tanstack/react-query';
import { Alert, Button, Card, Flex, Result, Space, Typography } from 'antd';
import { ArrowLeft, Sprout, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLoaderData, useNavigate } from 'react-router-dom';
import { farmQueries } from '../api/farm/farm.queries.ts';
import { fieldQueries } from '../api/fields/fields.queries.ts';
import type { FieldRouteData } from '../app/route-loaders.ts';
import { PageHeading } from '../components/common/PageHeading';
import { RouterButton } from '../components/common/RouterButton';
import { CropRotationPlan } from '../features/fields/components/CropRotationPlan';
import { FieldProperties } from '../features/fields/components/FieldProperties';
import { FieldRecommendation } from '../features/fields/components/FieldRecommendation';
import { FieldStatus } from '../features/fields/components/FieldStatus';
import { LandHistory } from '../features/fields/components/LandHistory';
import { useFieldRemoval } from '../features/fields/hooks/useFieldRemoval.ts';
import { FieldMap } from '../features/maps/components/FieldMap';
import { useFieldBoundary } from '../features/maps/hooks/useFieldBoundary.ts';

export function FieldDetailsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { fieldId } = useLoaderData<FieldRouteData>();
  const [{ data: field }, { data: propertyData }, { data: preferences }] = useSuspenseQueries({
    queries: [fieldQueries.byId(fieldId), fieldQueries.properties(fieldId), farmQueries.profile()],
  });
  const geojson = useFieldBoundary(fieldId);
  const { confirmRemove, setConfirmRemove, isRemovingField, handleRemove } =
    useFieldRemoval(fieldId);
  if (!field || !propertyData) {
    return <FieldNotFound />;
  }

  return (
    <>
      <RouterButton type="text" icon={<ArrowLeft size={20} />} to="/fields">
        {t('Back to my fields')}
      </RouterButton>
      <PageHeading
        title={field.name}
        description={t('{{value0}} · {{value1}} hectares · {{value2}}', {
          value0: field.crop,
          value1: field.area,
          value2: propertyData.soil.soilType,
        })}
        eyebrow={t('{{value0}} · FIELD {{value1}}', {
          value0: preferences.farmName.toUpperCase(),
          value1: String(field.id).padStart(2, '0'),
        })}
        actions={
          <Space wrap>
            <FieldStatus status={field.status} />
            <RouterButton
              type="primary"
              icon={<Sprout size={19} />}
              to={`/fields/${field.id}/strategy`}
            >
              {t('Rotation strategy')}
            </RouterButton>
          </Space>
        }
      />
      <div
        className="field-detail-map"
        aria-label={t('{{value0}} location map', { value0: field.name })}
      >
        <FieldMap
          fields={[field]}
          geojson={geojson}
          boundaryOnly
          adding={false}
          onSelect={(selected) => navigate(`/fields/${selected.id}`)}
          onAdd={() => navigate('/map/add')}
        />
      </div>
      <div className="field-detail-stack">
        <CropRotationPlan field={field} />
        <FieldRecommendation field={field} />
        <FieldProperties field={field} />
        <LandHistory field={field} />
        <Card title={t('Manage this field')}>
          <Flex justify="space-between" align="center" gap={20} wrap>
            <Typography.Paragraph type="secondary" className="no-margin">
              {t(
                'Remove this field from your farm list. You can add the parcel again from the map.',
              )}{' '}
            </Typography.Paragraph>
            <Space wrap>
              <RouterButton to="/map">{t('Explore farm map')}</RouterButton>
              {!confirmRemove && (
                <Button danger icon={<Trash2 size={18} />} onClick={() => setConfirmRemove(true)}>
                  {t('Remove field')}{' '}
                </Button>
              )}
            </Space>
          </Flex>
          {confirmRemove && (
            <Alert
              className="field-remove-confirmation"
              type="warning"
              showIcon
              title={t('Remove {{value0}}?', { value0: field.name })}
              description={
                <>
                  <Typography.Paragraph>
                    {t('Your field will leave the farm list.')}
                  </Typography.Paragraph>
                  <Space wrap>
                    <Button danger loading={isRemovingField} onClick={handleRemove}>
                      {t('Confirm removal')}{' '}
                    </Button>
                    <Button onClick={() => setConfirmRemove(false)}>{t('Keep field')}</Button>
                  </Space>
                </>
              }
            />
          )}
        </Card>
      </div>
    </>
  );
}

function FieldNotFound() {
  const { t } = useTranslation();

  return (
    <Result
      status="404"
      title={t('Field not found')}
      subTitle={t('This field may have been removed from your farm.')}
      extra={
        <RouterButton type="primary" to="/fields">
          {t('Back to my fields')}
        </RouterButton>
      }
    />
  );
}
