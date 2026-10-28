import { useTranslation } from 'react-i18next';
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

export function LandHistory({ field }: { field: Field; }) {
  const { t, i18n } = useTranslation();
  const rotationColumns: TableColumnsType<CropSeason> = [
    {
      title: t('Season'),
      dataIndex: 'year',
      render: (year: number) => (
        <Space>
          {year}
          {year === 2026 && <Tag color="success">{t('Current')}</Tag>}
        </Space>
      )
    },
    { title: t('Crop'), dataIndex: 'crop' },
    { title: t('Planted'), dataIndex: 'planted' },
    { title: t('Harvested'), dataIndex: 'harvested' },
    { title: t('Yield'), dataIndex: 'yield' },
    {
      title: t('Soil after the season'),
      dataIndex: 'soilCondition',
      width: 270
    },
  ];

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
           {t('Land history')} </Typography.Title>
        <Tag>{t('{{value0}} records · 2023–2026', { value0: events.length })}</Tag>
      </Flex>
      <Typography.Paragraph type="secondary">
         {t('Follow the story of this field: crop rotations, soil changes, field work, and weather through the seasons.')} </Typography.Paragraph>
      <Card className="land-history-card">
        <Tabs
          defaultActiveKey="timeline"
          items={[
            {
              key: 'timeline',
              label: t('Activity timeline'),
              children: (
                <>
                  <Flex
                    gap={12}
                    wrap
                    className="land-history-filters"
                  >
                    <Input
                      aria-label={t('Search land history')}
                      prefix={<Search size={18} />}
                      placeholder={t('Search field history…')}
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                      allowClear
                    />
                    <Select
                      aria-label={t('Filter history by activity')}
                      value={category}
                      onChange={setCategory}
                      options={['All activities', ...Object.keys(categoryColors)].map(value => ({ value, label: t(value) }))}
                    />
                    <Select
                      aria-label={t('Filter history by year')}
                      value={year}
                      onChange={setYear}
                      options={['All years', '2026', '2025', '2024', '2023'].map(value => ({ value, label: t(value) }))}
                    />
                    {(query || category !== 'All activities' || year !== 'All years') && <Button onClick={resetFilters}>{t('Clear filters')}</Button>}
                  </Flex>
                  <Flex
                    justify="space-between"
                    wrap
                    gap={8}
                    className="section-gap"
                  >
                    <Typography.Text type="secondary">
                      {t('Showing {{value0}} of {{value1}} records', { value0: visible.length, value1: events.length })}
                    </Typography.Text>
                    <Typography.Text type="secondary">{t('Newest first · Scroll to explore earlier seasons')}</Typography.Text>
                  </Flex>
                  <div
                    className="land-history-scroll"
                    role="region"
                    aria-label={t('{{value0}} activity timeline', { value0: field.name })}
                    tabIndex={0}
                  >
                    {visible.length ? <Timeline
                      items={visible.map(event => ({
                        key: event.id,
                        color: event.attention ? '#923a2e' : '#476b3c',
                        content: (
                          <article className="land-history-event">
                            <Typography.Text type="secondary" className="land-history-date">
                              {new Date(`${event.date}T12:00:00`).toLocaleDateString(i18n.resolvedLanguage, {
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
                              {event.attention && <Tag color="error">{t('Needs follow-up')}</Tag>}
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
                    /> : <Empty description={t('No history matches these filters.')}>
                      <Button onClick={resetFilters}>{t('Clear filters')}</Button>
                    </Empty>}
                  </div>
                </>
              ),
            },
            {
              key: 'rotations',
              label: t('Crop rotations'),
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
