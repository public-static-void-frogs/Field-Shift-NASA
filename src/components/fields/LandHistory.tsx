import { useState } from 'react';
import { Button, Card, Empty, Flex, Input, Select, Space, Table, Tabs, Tag, Timeline, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { History, Search } from 'lucide-react';
import { getCropSeasons, getLandHistory } from '../../data/landHistory';
import type { Field } from '../../types/field';
import type { CropSeason, LandEventCategory } from '../../types/landHistory';

const categoryColors: Record<LandEventCategory, string> = {
  'Crop rotation': 'success',
  'Soil conditions': 'warning',
  'Field work': 'default',
  'Weather & water': 'processing',
};

const rotationColumns: TableColumnsType<CropSeason> = [
  {
    title: 'Season',
    dataIndex: 'year',
    render: (year: number) => (
      <Space>
        {year}
        {year === 2026 && <Tag color="success">Current</Tag>}
      </Space>
    )
  },
  { title: 'Crop', dataIndex: 'crop' },
  { title: 'Planted', dataIndex: 'planted' },
  { title: 'Harvested', dataIndex: 'harvested' },
  { title: 'Yield', dataIndex: 'yield' },
  {
    title: 'Soil after the season',
    dataIndex: 'soilCondition',
    width: 270
  },
];

export function LandHistory({ field }: { field: Field; }) {
  const [category, setCategory] = useState('All activities');
  const [year, setYear] = useState('All years');
  const [query, setQuery] = useState('');
  const events = getLandHistory(field);
  const seasons = getCropSeasons(field);
  const visible = events.filter(event => (
    (category === 'All activities' || event.category === category) &&
    (year === 'All years' || event.date.startsWith(year)) &&
    `${event.title} ${event.description} ${event.measurements?.join(' ')}`.toLowerCase().includes(query.toLowerCase())
  ));
  function resetFilters() {
    setCategory('All activities');
    setYear('All years');
    setQuery('');
  }
  return (
    <section aria-labelledby="land-history-heading" className="land-history-section">
      <Flex
        justify="space-between"
        align="center"
        gap={12}
        wrap
      >
        <Typography.Title level={3} id="land-history-heading">
          <History size={25} />
          Land history
        </Typography.Title>
        <Tag>{`${events.length} records · 2023–2026`}</Tag>
      </Flex>
      <Typography.Paragraph type="secondary">
        Follow the story of this field: crop rotations, soil changes, field work, and weather through the seasons.
      </Typography.Paragraph>
      <Card className="land-history-card">
        <Tabs
          defaultActiveKey="timeline"
          items={[
            {
              key: 'timeline',
              label: 'Activity timeline',
              children: (
                <>
                  <Flex
                    gap={12}
                    wrap
                    className="land-history-filters"
                  >
                    <Input
                      aria-label="Search land history"
                      prefix={<Search size={18} />}
                      placeholder="Search field history…"
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                      allowClear
                    />
                    <Select
                      aria-label="Filter history by activity"
                      value={category}
                      onChange={setCategory}
                      options={['All activities', ...Object.keys(categoryColors)].map(value => ({ value, label: value }))}
                    />
                    <Select
                      aria-label="Filter history by year"
                      value={year}
                      onChange={setYear}
                      options={['All years', '2026', '2025', '2024', '2023'].map(value => ({ value, label: value }))}
                    />
                    {(query || category !== 'All activities' || year !== 'All years') && <Button onClick={resetFilters}>Clear filters</Button>}
                  </Flex>
                  <Flex
                    justify="space-between"
                    wrap
                    gap={8}
                    className="section-gap"
                  >
                    <Typography.Text type="secondary">
                      {`Showing ${visible.length} of ${events.length} records`}
                    </Typography.Text>
                    <Typography.Text type="secondary">Newest first · Scroll to explore earlier seasons</Typography.Text>
                  </Flex>
                  <div
                    className="land-history-scroll"
                    role="region"
                    aria-label={`${field.name} activity timeline`}
                    tabIndex={0}
                  >
                    {visible.length ? <Timeline
                      items={visible.map(event => ({
                        key: event.id,
                        color: event.attention ? '#923a2e' : '#476b3c',
                        content: (
                          <article className="land-history-event">
                            <Typography.Text type="secondary" className="land-history-date">
                              {new Date(`${event.date}T12:00:00`).toLocaleDateString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </Typography.Text>
                            <Space wrap>
                              <Typography.Title level={5}>
                                {event.title}
                              </Typography.Title>
                              <Tag color={categoryColors[event.category]}>
                                {event.category}
                              </Tag>
                              {event.attention && <Tag color="error">Needs follow-up</Tag>}
                            </Space>
                            <Typography.Paragraph>
                              {event.description}
                            </Typography.Paragraph>
                            {event.measurements && <Flex gap={8} wrap>
                              {event.measurements.map(measurement => (
                                <Tag key={measurement}>
                                  {measurement}
                                </Tag>
                              ))}
                            </Flex>}
                          </article>
                        ),
                      }))}
                    /> : <Empty description="No history matches these filters.">
                      <Button onClick={resetFilters}>Clear filters</Button>
                    </Empty>}
                  </div>
                </>
              ),
            },
            {
              key: 'rotations',
              label: 'Crop rotations',
              children: <Table<CropSeason>
                rowKey="year"
                columns={rotationColumns}
                dataSource={seasons}
                pagination={false}
                scroll={{ x: 1150 }}
              />,
            },
          ]}
        />
      </Card>
    </section>
  );
}
