import { Alert, Card, Collapse, Typography } from 'antd';
import { PageHeading } from '../components/common/PageHeading';

export function HelpPage() {
  return (
    <><PageHeading
      title="A helping hand for your farm."
      description="Find your way around your workspace and make the most of every field."
      eyebrow="HELP & RESOURCES"
    /><Card title="Start with the land you know">
        <Alert
          type="success"
          showIcon
          title="Your farm, all in one place"
          description="Use the map for a bird’s-eye view, or open My fields to compare health and growing conditions."
        />
        <Typography.Title level={3}>Frequently asked questions</Typography.Title>
        <Collapse
          defaultActiveKey={['fields']}
          items={[
            {
              key: 'fields',
              label: 'How do I open a field?',
              children: 'Select a field on the map or click its name in the fields table. Its page shows crop health, soil moisture, nitrogen, recommendations, and notes.'
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
      </Card></>
  );
}
