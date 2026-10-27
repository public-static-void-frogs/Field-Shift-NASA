import { Card, Collapse, Table, Typography } from 'antd';
import { TeamSection } from '../components/help/TeamSection';
import { ProjectSection } from '../components/help/ProjectSection';

const demoSources = [
  { key: 'weather', name: 'Example weather archive', data: 'Daily temperature, rainfall, and humidity', format: 'CSV' },
  { key: 'soil', name: 'Sample soil survey', data: 'Soil pH, moisture, nutrients, and organic matter', format: 'GeoJSON' },
  { key: 'crop', name: 'Demo crop reference', data: 'Crop characteristics, planting windows, and rotation sequences', format: 'JSON' },
];

export function HelpPage() {
  return (
    <><div className="help-about-sections"><ProjectSection /><TeamSection /></div>
      <div className="help-reference-sections">
      <section aria-label="Q&A"><Card title="Q&A">
        <Collapse
          defaultActiveKey={['fields']}
          items={[
            {
              key: 'fields',
              label: 'How do I open a field?',
              children: 'Select a field on the map or click its name in the fields table. Its page shows the field boundary, crop and soil properties, recommendations, and a rotation strategy.'
            },
            {
              key: 'add',
              label: 'How do I add a field?',
              children: 'Choose Add field, then select an available parcel with a dashed outline on the map. Enter a field name and choose a crop to add it to your farm.'
            },
            {
              key: 'warnings',
              label: 'What do the health indicators mean?',
              children: 'Green means healthy. Amber means a field needs attention. Red marks a critical metric that calls for prompt care. Each indicator includes a plain-language explanation.'
            },
            {
              key: 'history',
              label: 'Where can I find weather history?',
              children: 'Open Environment history and choose a 7-, 30-, or 90-day range to explore temperature, rainfall, soil moisture, and daily conditions.'
            },
            {
              key: 'remove',
              label: 'How do I remove a field?',
              children: 'Open a field’s page and use Remove field in the management card. Confirm inline to remove it. Its parcel stays available to add again from the map.'
            }
          ]}
        />
      </Card></section>
      <section aria-label="Data sources"><Card title="Data sources">
        <Typography.Paragraph type="secondary">Example sources for the demo. These datasets are placeholders and are not connected.</Typography.Paragraph>
        <Table
          rowKey="key"
          dataSource={demoSources}
          pagination={false}
          scroll={{ x: 620 }}
          columns={[
            { title: 'Source', dataIndex: 'name', width: 240 },
            { title: 'Data included', dataIndex: 'data' },
            { title: 'Format', dataIndex: 'format', width: 110 },
          ]}
        />
      </Card></section>
      </div>
    </>
  );
}
