import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { Alert, App, Button, Card, Flex, Result, Space, Typography } from 'antd';
import { ArrowLeft, Sprout, Trash2 } from 'lucide-react';
import { useFarm } from '../hooks/useFarm';
import { PageHeading } from '../components/common/PageHeading';
import { FieldRecommendation } from '../components/fields/FieldRecommendation';
import { FieldStatus } from '../components/fields/FieldStatus';
import { FieldProperties } from '../components/fields/FieldProperties';
import { LandHistory } from '../components/fields/LandHistory';
import { CropRotationPlan } from '../components/fields/CropRotationPlan';
import { FieldMap } from '../components/map/FieldMap';
import { fieldGeoJson } from '../data/fieldGeoJson';
import { getFeatureFieldId } from '../utils/mapGeometry';
import type { FieldGeoJson } from '../types/map';
import { getFieldProperties } from '../data/fieldProperties';
import type { Navigate } from '../types/navigation';

export function FieldDetailsPage({ fieldId, navigate }: { fieldId: number; navigate: Navigate }) {
  const { t } = useTranslation();
  const { fields, removeField, preferences } = useFarm();
  const { message } = App.useApp();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const field = fields.find((item) => item.id === fieldId);
  const geojson = useMemo<FieldGeoJson>(
    () => ({
      type: 'FeatureCollection',
      features: fieldGeoJson.features.filter((feature) => getFeatureFieldId(feature) === fieldId),
    }),
    [fieldId],
  );
  if (!field)
    return (
      <Result
        status="404"
        title={t('Field not found')}
        subTitle={t('This field may have been removed from your farm.')}
        extra={
          <Button type="primary" onClick={() => navigate('/fields')}>
            {t('Back to my fields')}
          </Button>
        }
      />
    );
  return (
    <>
      <Button type="text" icon={<ArrowLeft size={20} />} onClick={() => navigate('/fields')}>
        {t('Back to my fields')}
      </Button>
      <PageHeading
        title={field.name}
        description={t('{{value0}} · {{value1}} hectares · {{value2}}', {
          value0: field.crop,
          value1: field.area,
          value2: getFieldProperties(field.id).soilType,
        })}
        eyebrow={t('{{value0}} · FIELD {{value1}}', {
          value0: preferences.farmName.toUpperCase(),
          value1: String(field.id).padStart(2, '0'),
        })}
        actions={
          <Space wrap>
            <FieldStatus status={field.status} />
            <Button
              type="primary"
              icon={<Sprout size={19} />}
              onClick={() => navigate(`/fields/${field.id}/strategy`)}
            >
              {t('Rotation strategy')}
            </Button>
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
              <Button onClick={() => navigate('/map')}>{t('Explore farm map')}</Button>
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
                    <Button
                      danger
                      onClick={() => {
                        removeField(field.id);
                        message.success(t('Field removed'));
                        navigate('/map');
                      }}
                    >
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
