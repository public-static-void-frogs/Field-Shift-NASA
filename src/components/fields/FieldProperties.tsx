import { useTranslation } from 'react-i18next';
import { Card, Descriptions, Space, Tag, Typography } from 'antd';
import { Droplets, Mountain, Sprout } from 'lucide-react';
import { getCropProperties, getFieldProperties } from '../../data/fieldProperties';
import type { Field } from '../../types/field';

export function FieldProperties({ field }: { field: Field }) {
  const { t } = useTranslation();
  const properties = getFieldProperties(field.id);
  const isWheat = field.crop === 'Winter wheat';
  const crop = getCropProperties(field);
  return (
    <section aria-labelledby="field-properties-heading" className="field-properties-section">
      <Typography.Title level={3} id="field-properties-heading">
        {t('Field properties')}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        {t('The soil, crop, and water conditions behind your field’s performance.')}{' '}
      </Typography.Paragraph>
      <div className="field-properties-stack">
        <Card
          title={
            <Space>
              <Sprout size={22} />
              {t('Crop & growing season')}{' '}
            </Space>
          }
        >
          <Descriptions
            bordered
            layout="vertical"
            column={{
              xs: 1,
              sm: 2,
              lg: 3,
            }}
            items={[
              {
                key: 'crop',
                label: t('Current crop'),
                children: field.crop,
              },
              {
                key: 'variety',
                label: t('Seed variety'),
                children: crop.variety,
              },
              {
                key: 'planted',
                label: t('Planting date'),
                children: field.planted,
              },
              {
                key: 'stage',
                label: t('Growth stage'),
                children: isWheat
                  ? 'Heading · BBCH 55'
                  : field.crop === 'Corn'
                    ? 'Vegetative · V6'
                    : 'Vegetative · V3',
              },
              {
                key: 'emergence',
                label: t('Crop establishment'),
                children: t('{{value0}}% of planted area', { value0: crop.emergence }),
              },
              {
                key: 'density',
                label: t('Plant population'),
                children: t('{{value0}} plants/m²', { value0: crop.plantDensity }),
              },
              {
                key: 'ndvi',
                label: t('Vegetation index (NDVI)'),
                children: (
                  <Space wrap>
                    {properties.vegetationIndex.toFixed(2)}
                    <Tag color={properties.vegetationIndex < 0.5 ? 'warning' : 'success'}>
                      {properties.vegetationIndex < 0.5 ? t('Sparse growth') : t('Good coverage')}
                    </Tag>
                  </Space>
                ),
              },
              {
                key: 'yield',
                label: t('Target yield'),
                children: t('{{value0}} t/ha', { value0: crop.yieldTarget.toFixed(1) }),
              },
              {
                key: 'harvest',
                label: t('Expected harvest'),
                children: crop.harvestWindow,
              },
            ]}
          />
        </Card>
        <Card
          title={
            <Space>
              <Mountain size={22} />
              {t('Soil & nutrients')}{' '}
            </Space>
          }
        >
          <Descriptions
            bordered
            layout="vertical"
            column={{
              xs: 1,
              sm: 2,
              lg: 3,
            }}
            items={[
              {
                key: 'texture',
                label: t('Soil texture'),
                children: properties.soilType,
              },
              {
                key: 'ph',
                label: t('Soil pH'),
                children: (
                  <Space wrap>
                    {properties.soilPh.toFixed(1)}
                    <Tag color={properties.soilPh < 6 ? 'warning' : 'success'}>
                      {properties.soilPh < 6 ? t('Acidic · Review liming') : t('Balanced')}
                    </Tag>
                  </Space>
                ),
              },
              {
                key: 'organic',
                label: t('Organic matter'),
                children: `${properties.organicMatter.toFixed(1)}%`,
              },
              {
                key: 'nitrogen',
                label: t('Available nitrogen (N)'),
                children: (
                  <Space wrap>
                    {field.nitrogen}
                    {t('mg/kg')}
                    <Tag
                      color={
                        field.nitrogen < 20 ? 'error' : field.nitrogen < 30 ? 'warning' : 'success'
                      }
                    >
                      {field.nitrogen < 20
                        ? t('Very low')
                        : field.nitrogen < 30
                          ? t('Low')
                          : t('Adequate')}
                    </Tag>
                  </Space>
                ),
              },
              {
                key: 'phosphorus',
                label: t('Phosphorus (P)'),
                children: t('{{value0}} mg/kg', { value0: properties.phosphorus }),
              },
              {
                key: 'potassium',
                label: t('Potassium (K)'),
                children: t('{{value0}} mg/kg', { value0: properties.potassium }),
              },
              {
                key: 'temp',
                label: t('Soil temperature · 10 cm'),
                children: t('{{value0}}°C', { value0: properties.soilTemperature.toFixed(1) }),
              },
              {
                key: 'ec',
                label: t('Salinity (electrical conductivity)'),
                children: t('{{value0}} dS/m · Low salt content', {
                  value0: properties.conductivity.toFixed(1),
                }),
              },
              {
                key: 'cec',
                label: t('Nutrient holding capacity (CEC)'),
                children: t('{{value0}} cmol/kg', { value0: properties.cationExchange.toFixed(1) }),
              },
              {
                key: 'density',
                label: t('Bulk density'),
                children: t('{{value0}} g/cm³', { value0: properties.bulkDensity.toFixed(2) }),
              },
              {
                key: 'root',
                label: t('Effective rooting depth'),
                children: t('{{value0}} cm', { value0: properties.rootingDepth }),
              },
              {
                key: 'sample',
                label: t('Last soil sample'),
                children: 'May 23, 2026 · 0–30 cm depth',
              },
            ]}
          />
        </Card>
        <Card
          title={
            <Space>
              <Droplets size={22} />
              {t('Land & water')}{' '}
            </Space>
          }
        >
          <Descriptions
            bordered
            layout="vertical"
            column={{
              xs: 1,
              sm: 2,
              lg: 3,
            }}
            items={[
              {
                key: 'area',
                label: t('Field area'),
                children: t('{{value0}} hectares', { value0: field.area }),
              },
              {
                key: 'elevation',
                label: t('Elevation'),
                children: t('{{value0}} m above sea level', { value0: properties.elevation }),
              },
              {
                key: 'slope',
                label: t('Average slope'),
                children: `${properties.slope.toFixed(1)}%`,
              },
              {
                key: 'drainage',
                label: t('Drainage'),
                children: properties.drainage,
              },
              {
                key: 'irrigation',
                label: t('Irrigation system'),
                children: properties.irrigation,
              },
              {
                key: 'moisture',
                label: t('Current soil moisture'),
                children: `${field.moisture}%`,
              },
              {
                key: 'last',
                label: t('Last irrigation'),
                children: properties.lastIrrigation,
              },
              {
                key: 'water',
                label: t('Irrigation this season'),
                children: t('{{value0}} mm', { value0: properties.waterApplied }),
              },
              {
                key: 'rain',
                label: t('Rainfall · last 30 days'),
                children: t('{{value0}} mm', { value0: properties.rainfall.toFixed(1) }),
              },
              {
                key: 'capacity',
                label: t('Available water capacity'),
                children: t('{{value0}} mm per metre of soil', {
                  value0: properties.waterCapacity,
                }),
              },
              {
                key: 'management',
                label: t('Cultivation practice'),
                children: 'Reduced tillage',
              },
              {
                key: 'ownership',
                label: t('Tenure'),
                children: 'Owner operated',
              },
            ]}
          />
        </Card>
      </div>
    </section>
  );
}
