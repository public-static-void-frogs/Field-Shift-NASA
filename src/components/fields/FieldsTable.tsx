import { useSuspenseQuery } from '@tanstack/react-query';
import type { TableColumnsType } from 'antd';
import {
  Badge,
  Button,
  Card,
  ConfigProvider,
  Dropdown,
  Empty,
  Flex,
  Input,
  Pagination,
  Progress,
  Segmented,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { ArrowUpRight, Droplets, ListFilter, Plus, Search, Wheat } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { fieldQueries } from '../../api/fields/fields.queries.ts';
import { useFarm } from '../../hooks/useFarm.ts';
import type { Field } from '../../types/fields/field.types.ts';
import type { FieldsTableProps } from '../../types/fields/FieldsTable.types.ts';
import { FieldStatus } from './FieldStatus';

export function FieldsTable({ navigate, overview = false }: FieldsTableProps) {
  const { t } = useTranslation();
  const { fields } = useFarm();
  const { data: cropOptions } = useSuspenseQuery(fieldQueries.crops());
  const tableViewport = useRef<HTMLDivElement>(null);
  const [tableBodyHeight, setTableBodyHeight] = useState(300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    const viewport = tableViewport.current;
    if (overview || !viewport) return;
    const header = viewport.querySelector('.ant-table-thead');
    const resize = () =>
      setTableBodyHeight(
        Math.max(80, viewport.clientHeight - (header?.getBoundingClientRect().height ?? 58) - 2),
      );
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    if (header) observer.observe(header);
    resize();
    return () => observer.disconnect();
  }, [overview]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All fields');
  const [crop, setCrop] = useState('All crops');
  const [filters, setFilters] = useState<string[]>([]);
  const filterOptions = [
    ...Array.from(
      new Set([...cropOptions.map((option) => option.value), ...fields.map((field) => field.crop)]),
    ).map((value) => ({ key: `crop:${value}`, label: t('Crop: {{value0}}', { value0: value }) })),
    { key: 'moisture:low', label: t('Soil moisture: below 40%') },
    { key: 'health:low', label: t('Crop health: below 70') },
    { key: 'area:large', label: t('Area: 25 ha or more') },
  ];
  const selectedCrops = filters.filter((key) => key.startsWith('crop:')).map((key) => key.slice(5));
  const attention = fields.filter((field) => field.status !== 'Healthy').length;
  const visible = fields.filter(
    (field) =>
      (overview
        ? field.name
        : `${field.name} ${field.crop} Field${String(field.id).padStart(2, '0')}`
      )
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (status === 'All fields' ||
        (status === 'Needs attention' ? field.status !== 'Healthy' : field.status === status)) &&
      (overview
        ? crop === 'All crops' || field.crop === crop
        : (!selectedCrops.length || selectedCrops.includes(field.crop)) &&
          (!filters.includes('moisture:low') || field.moisture < 40) &&
          (!filters.includes('health:low') || field.health < 70) &&
          (!filters.includes('area:large') || field.area >= 25)),
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / pageSize)));
  const columns: TableColumnsType<Field> = [
    {
      title: t('Field name'),
      dataIndex: 'name',
      key: 'name',
      width: 235,
      render: (name: string, field) => (
        <Space size={12}>
          <span className={`field-thumb thumb-${field.id % 5}`} />
          <div>
            <Button type="link" className="field-name-link" href={`#/fields/${field.id}`}>
              {name}
            </Button>
            <Typography.Text type="secondary" className="field-id">
              {t('Field')} {String(field.id).padStart(2, '0')}
            </Typography.Text>
          </div>
        </Space>
      ),
    },
    {
      title: t('Crop type'),
      dataIndex: 'crop',
      key: 'crop',
      render: (value: string) => (
        <Space>
          <Wheat size={17} className="muted-icon" />
          {value}
        </Space>
      ),
    },
    {
      title: t('Area'),
      dataIndex: 'area',
      key: 'area',
      sorter: (a, b) => a.area - b.area,
      render: (value: number) => t('{{value0}} ha', { value0: value }),
    },
    {
      title: t('Crop health'),
      dataIndex: 'health',
      key: 'health',
      width: 165,
      sorter: (a, b) => a.health - b.health,
      render: (value: number, field) => (
        <div className="health-cell">
          <span>
            {value}
            <Typography.Text type="secondary">/100</Typography.Text>
          </span>
          <Progress
            percent={value}
            showInfo={false}
            size="small"
            strokeColor={
              field.status === 'Healthy'
                ? '#7a9b63'
                : field.status === 'Critical'
                  ? '#b75f4e'
                  : '#b8954d'
            }
          />
        </div>
      ),
    },
    {
      title: t('Soil moisture'),
      dataIndex: 'moisture',
      key: 'moisture',
      render: (value: number) => (
        <Space>
          <Droplets size={17} className="muted-icon" />
          {value}%
        </Space>
      ),
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      render: (value: Field['status']) => <FieldStatus status={value} />,
    },
    {
      title: '',
      key: 'open',
      width: 60,
      render: (_, field) => (
        <Button
          type="text"
          aria-label={t('Open {{value0}}', { value0: field.name })}
          icon={<ArrowUpRight size={19} />}
          onClick={() => navigate(`/fields/${field.id}`)}
        />
      ),
    },
  ];
  return (
    <div className={overview ? undefined : 'fields-workspace'}>
      {!overview && (
        <Tabs
          className="fields-view-tabs"
          activeKey={status}
          onChange={setStatus}
          items={[
            { key: 'All fields', label: t('All fields ({{value0}})', { value0: fields.length }) },
            {
              key: 'Needs attention',
              label: t('Needs attention ({{value0}})', { value0: attention }),
            },
            {
              key: 'Healthy',
              label: t('Healthy ({{value0}})', {
                value0: fields.filter((field) => field.status === 'Healthy').length,
              }),
            },
            {
              key: 'Critical',
              label: t('Critical ({{value0}})', {
                value0: fields.filter((field) => field.status === 'Critical').length,
              }),
            },
          ]}
          tabBarExtraContent={
            <Button type="primary" icon={<Plus size={18} />} onClick={() => navigate('/map/add')}>
              {t('Add field')}
            </Button>
          }
        />
      )}
      {!overview && (
        <div className="fields-controls">
          <Flex className="fields-filter-row" gap={12} align="center">
            <Input
              className="fields-search"
              aria-label={t('Search fields')}
              prefix={<Search size={18} />}
              placeholder={t('Search by field name, ID or crop…')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              allowClear
            />
            <Dropdown
              trigger={['click']}
              menu={{
                items: filterOptions.map((option) => ({
                  ...option,
                  disabled: filters.includes(option.key),
                })),
                onClick: ({ key }) =>
                  setFilters((current) => (current.includes(key) ? current : [...current, key])),
              }}
            >
              <Button icon={<ListFilter size={18} />}>{t('Add filter')}</Button>
            </Dropdown>
            {filters.length > 0 && (
              <Flex
                className="field-filter-chips"
                gap={12}
                align="center"
                aria-label={t('Active field filters')}
              >
                {filters.map((key) => (
                  <Tag
                    key={key}
                    closable
                    onClose={() =>
                      setFilters((current) => current.filter((filter) => filter !== key))
                    }
                  >
                    {filterOptions.find((option) => option.key === key)?.label}
                  </Tag>
                ))}
                <Button type="text" onClick={() => setFilters([])}>
                  {t('Clear filters')}
                </Button>
              </Flex>
            )}
          </Flex>
        </div>
      )}
      <Card
        className="fields-card"
        title={
          overview ? (
            <Space wrap>
              {t('Your fields')} <Badge count={fields.length} color="#476b3c" />
              <Badge status="success" text={t('Live overview')} />
            </Space>
          ) : undefined
        }
        extra={
          overview ? (
            <Button type="link" onClick={() => navigate('/fields')}>
              {t('View all fields')} <ArrowUpRight size={17} />
            </Button>
          ) : undefined
        }
      >
        {overview && (
          <Flex className="table-toolbar" justify="space-between" align="center" gap={16} wrap>
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: 'All fields', label: t('All fields') },
                {
                  label: t('Needs attention ({{value0}})', { value0: attention }),
                  value: 'Needs attention',
                },
                { value: 'Healthy', label: t('Healthy') },
              ]}
            />
            <Flex gap={10} wrap className="table-filters">
              <Input
                aria-label={t('Find a field')}
                prefix={<Search size={18} />}
                placeholder={t('Find a field…')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                allowClear
              />
              <Select
                aria-label={t('Filter by crop')}
                value={crop}
                onChange={setCrop}
                options={[{ value: 'All crops', label: t('All crops') }, ...cropOptions]}
              />
            </Flex>
          </Flex>
        )}
        <div
          ref={tableViewport}
          className={overview ? undefined : 'fields-table-viewport'}
          style={
            overview
              ? undefined
              : ({ '--fields-table-body-height': `${tableBodyHeight}px` } as CSSProperties)
          }
        >
          <ConfigProvider
            theme={{
              components: {
                Table: {
                  headerBg: '#ffffff',
                  headerColor: '#314529',
                  headerSplitColor: '#dfe5d5',
                  headerSortActiveBg: '#ffffff',
                  headerSortHoverBg: '#ffffff',
                  colorTextDescription: '#627653',
                },
              },
            }}
          >
            <Table<Field>
              rowKey="id"
              columns={columns}
              dataSource={visible}
              scroll={{ x: 1080, ...(overview ? {} : { y: tableBodyHeight }) }}
              pagination={overview ? false : { current: currentPage, pageSize, position: [] }}
              onChange={(_, __, ___, extra) => {
                if (extra.action === 'sort') setPage(1);
              }}
              onRow={(field) => ({
                onClick: () => navigate(`/fields/${field.id}`),
                className: 'clickable-row',
              })}
              locale={{
                emptyText: (
                  <Empty description={t('No fields match your filters')}>
                    <Button
                      onClick={() => {
                        setQuery('');
                        setStatus('All fields');
                        setCrop('All crops');
                        setFilters([]);
                      }}
                    >
                      {t('Clear filters')}
                    </Button>
                  </Empty>
                ),
              }}
            />
          </ConfigProvider>
        </div>
        <Flex className="table-footer" justify="space-between" gap={12} wrap>
          <Typography.Text type="secondary">
            {overview
              ? t('Showing {{value0}} of {{value1}} fields', {
                  value0: visible.length,
                  value1: fields.length,
                })
              : t('{{value0}}–{{value1}} of {{value2}} fields', {
                  value0: visible.length ? (currentPage - 1) * pageSize + 1 : 0,
                  value1: Math.min(currentPage * pageSize, visible.length),
                  value2: visible.length,
                })}
          </Typography.Text>
          {overview ? (
            <Badge status="success" text={t('Last synced just now')} />
          ) : (
            <Pagination
              size="small"
              current={currentPage}
              pageSize={pageSize}
              total={visible.length}
              showSizeChanger={{ showSearch: false }}
              pageSizeOptions={[5, 10, 20, 50, 100]}
              onChange={(nextPage, nextSize) => {
                setPage(nextSize === pageSize ? nextPage : 1);
                setPageSize(nextSize);
              }}
            />
          )}
        </Flex>
      </Card>
    </div>
  );
}
