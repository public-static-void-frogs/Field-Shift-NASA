import { Card, Descriptions, Space, Tag, Typography } from 'antd';
import { Droplets, Mountain, Sprout } from 'lucide-react';
import { getCropProperties, getFieldProperties } from '../../data/fieldProperties';
import type { Field } from '../../types/field';

export function FieldProperties({ field }: { field: Field; }) {
  const properties = getFieldProperties(field.id);
  const isWheat = field.crop === 'Winter wheat';
  const crop = getCropProperties(field);
  return (
    <section aria-labelledby="field-properties-heading" className="field-properties-section">
      <Typography.Title level={3} id="field-properties-heading">Field properties</Typography.Title>
      <Typography.Paragraph type="secondary">
        The soil, crop, and water conditions behind your field’s performance.
      </Typography.Paragraph>
      <div className="field-properties-stack">
        <Card title={<Space>
          <Sprout size={22} />
          Crop & growing season
        </Space>}>
          <Descriptions
            bordered
            layout="vertical"
            column={{
              xs: 1,
              sm: 2,
              lg: 3
            }}
            items={[
              {
                key: 'crop',
                label: 'Current crop',
                children: field.crop
              },
              {
                key: 'variety',
                label: 'Seed variety',
                children: crop.variety
              },
              {
                key: 'planted',
                label: 'Planting date',
                children: field.planted
              },
              {
                key: 'stage',
                label: 'Growth stage',
                children: isWheat ? 'Heading · BBCH 55' : field.crop === 'Corn' ? 'Vegetative · V6' : 'Vegetative · V3'
              },
              {
                key: 'emergence',
                label: 'Crop establishment',
                children: `${crop.emergence}% of planted area`
              },
              {
                key: 'density',
                label: 'Plant population',
                children: `${crop.plantDensity} plants/m²`
              },
              {
                key: 'ndvi',
                label: 'Vegetation index (NDVI)',
                children: <Space wrap>
                  {properties.vegetationIndex.toFixed(2)}
                  <Tag color={properties.vegetationIndex < 0.5 ? 'warning' : 'success'}>
                    {properties.vegetationIndex < 0.5 ? 'Sparse growth' : 'Good coverage'}
                  </Tag>
                </Space>
              },
              {
                key: 'yield',
                label: 'Target yield',
                children: `${crop.yieldTarget.toFixed(1)} t/ha`
              },
              {
                key: 'harvest',
                label: 'Expected harvest',
                children: crop.harvestWindow
              },
            ]}
          />
        </Card>
        <Card title={<Space>
          <Mountain size={22} />
          Soil & nutrients
        </Space>}>
          <Descriptions
            bordered
            layout="vertical"
            column={{
              xs: 1,
              sm: 2,
              lg: 3
            }}
            items={[
              {
                key: 'texture',
                label: 'Soil texture',
                children: properties.soilType
              },
              {
                key: 'ph',
                label: 'Soil pH',
                children: <Space wrap>
                  {properties.soilPh.toFixed(1)}
                  <Tag color={properties.soilPh < 6 ? 'warning' : 'success'}>
                    {properties.soilPh < 6 ? 'Acidic · Review liming' : 'Balanced'}
                  </Tag>
                </Space>
              },
              {
                key: 'organic',
                label: 'Organic matter',
                children: `${properties.organicMatter.toFixed(1)}%`
              },
              {
                key: 'nitrogen',
                label: 'Available nitrogen (N)',
                children: <Space wrap>
                  {field.nitrogen}
                  mg/kg
                  <Tag color={field.nitrogen < 20 ? 'error' : field.nitrogen < 30 ? 'warning' : 'success'}>
                    {field.nitrogen < 20 ? 'Very low' : field.nitrogen < 30 ? 'Low' : 'Adequate'}
                  </Tag>
                </Space>
              },
              {
                key: 'phosphorus',
                label: 'Phosphorus (P)',
                children: `${properties.phosphorus} mg/kg`
              },
              {
                key: 'potassium',
                label: 'Potassium (K)',
                children: `${properties.potassium} mg/kg`
              },
              {
                key: 'temp',
                label: 'Soil temperature · 10 cm',
                children: `${properties.soilTemperature.toFixed(1)}°C`
              },
              {
                key: 'ec',
                label: 'Salinity (electrical conductivity)',
                children: `${properties.conductivity.toFixed(1)} dS/m · Low salt content`
              },
              {
                key: 'cec',
                label: 'Nutrient holding capacity (CEC)',
                children: `${properties.cationExchange.toFixed(1)} cmol/kg`
              },
              {
                key: 'density',
                label: 'Bulk density',
                children: `${properties.bulkDensity.toFixed(2)} g/cm³`
              },
              {
                key: 'root',
                label: 'Effective rooting depth',
                children: `${properties.rootingDepth} cm`
              },
              {
                key: 'sample',
                label: 'Last soil sample',
                children: 'May 23, 2026 · 0–30 cm depth'
              },
            ]}
          />
        </Card>
        <Card title={<Space>
          <Droplets size={22} />
          Land & water
        </Space>}>
          <Descriptions
            bordered
            layout="vertical"
            column={{
              xs: 1,
              sm: 2,
              lg: 3
            }}
            items={[
              {
                key: 'area',
                label: 'Field area',
                children: `${field.area} hectares`
              },
              {
                key: 'elevation',
                label: 'Elevation',
                children: `${properties.elevation} m above sea level`
              },
              {
                key: 'slope',
                label: 'Average slope',
                children: `${properties.slope.toFixed(1)}%`
              },
              {
                key: 'drainage',
                label: 'Drainage',
                children: properties.drainage
              },
              {
                key: 'irrigation',
                label: 'Irrigation system',
                children: properties.irrigation
              },
              {
                key: 'moisture',
                label: 'Current soil moisture',
                children: `${field.moisture}%`
              },
              {
                key: 'last',
                label: 'Last irrigation',
                children: properties.lastIrrigation
              },
              {
                key: 'water',
                label: 'Irrigation this season',
                children: `${properties.waterApplied} mm`
              },
              {
                key: 'rain',
                label: 'Rainfall · last 30 days',
                children: `${properties.rainfall.toFixed(1)} mm`
              },
              {
                key: 'capacity',
                label: 'Available water capacity',
                children: `${properties.waterCapacity} mm per metre of soil`
              },
              {
                key: 'management',
                label: 'Cultivation practice',
                children: 'Reduced tillage'
              },
              {
                key: 'ownership',
                label: 'Tenure',
                children: 'Owner operated'
              },
            ]}
          />
        </Card>
      </div>
    </section>
  );
}
