import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Badge, Button, Card, ConfigProvider, Dropdown, Empty, Flex, Input, Pagination, Progress, Segmented, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { ArrowUpRight, Droplets, ListFilter, Plus, Search, Wheat } from 'lucide-react';
import { useFarm } from '../../hooks/useFarm';
import { cropOptions } from '../../data/fields';
import type { Field } from '../../types/field';
import type { Navigate } from '../../types/navigation';
import { FieldStatus } from './FieldStatus';

export function FieldsTable({ navigate, overview = false }: { navigate: Navigate; overview?: boolean; }) {
  const { fields } = useFarm();
  const tableViewport = useRef<HTMLDivElement>(null);
  const [tableBodyHeight, setTableBodyHeight] = useState(300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    const viewport = tableViewport.current;
    if (overview || !viewport) return;
    const header = viewport.querySelector('.ant-table-thead');
    const resize = () => setTableBodyHeight(Math.max(80, viewport.clientHeight - (header?.getBoundingClientRect().height ?? 58) - 2));
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
    ...Array.from(new Set([...cropOptions.map(option => option.value), ...fields.map(field => field.crop)]))
      .map(value => ({ key: `crop:${value}`, label: `Crop: ${value}` })),
    { key: 'moisture:low', label: 'Soil moisture: below 40%' },
    { key: 'health:low', label: 'Crop health: below 70' },
    { key: 'area:large', label: 'Area: 25 ha or more' },
  ];
  const selectedCrops = filters.filter(key => key.startsWith('crop:')).map(key => key.slice(5));
  const attention = fields.filter(field => field.status !== 'Healthy').length;
  const visible = fields.filter(field =>
    (overview ? field.name : `${field.name} ${field.crop} Field${String(field.id).padStart(2, '0')}`).toLowerCase().includes(query.trim().toLowerCase()) &&
    (status === 'All fields' || (status === 'Needs attention' ? field.status !== 'Healthy' : field.status === status)) &&
    (overview ? crop === 'All crops' || field.crop === crop : (
      (!selectedCrops.length || selectedCrops.includes(field.crop)) &&
      (!filters.includes('moisture:low') || field.moisture < 40) &&
      (!filters.includes('health:low') || field.health < 70) &&
      (!filters.includes('area:large') || field.area >= 25)
    )),
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / pageSize)));
  const columns: TableColumnsType<Field> = [
    {
      title: 'Field name',
      dataIndex: 'name',
      key: 'name',
      width: 235,
      render: (name: string, field) => (
        <Space size={12}>
          <span className={`field-thumb thumb-${field.id % 5}`} />
          <div>
            <Button
              type="link"
              className="field-name-link"
              href={`#/fields/${field.id}`}
            >
              {name}
            </Button>
            <Typography.Text type="secondary" className="field-id">
              Field
              {String(field.id).padStart(2, '0')}
            </Typography.Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Crop type',
      dataIndex: 'crop',
      key: 'crop',
      render: (value: string) => (
        <Space>
          <Wheat size={17} className="muted-icon" />
          {value}
        </Space>
      )
    },
    {
      title: 'Area',
      dataIndex: 'area',
      key: 'area',
      sorter: (a, b) => a.area - b.area,
      render: (value: number) => `${value} ha`
    },
    {
      title: 'Crop health',
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
            strokeColor={field.status === 'Healthy' ? '#7a9b63' : field.status === 'Critical' ? '#b75f4e' : '#b8954d'}
          />
        </div>
      ),
    },
    {
      title: 'Soil moisture',
      dataIndex: 'moisture',
      key: 'moisture',
      render: (value: number) => (
        <Space>
          <Droplets size={17} className="muted-icon" />
          {value}
          %
        </Space>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (value: Field['status']) => (
        <FieldStatus status={value} />
      )
    },
    {
      title: '',
      key: 'open',
      width: 60,
      render: (_, field) => (
        <Button
          type="text"
          aria-label={`Open ${field.name}`}
          icon={<ArrowUpRight size={19} />}
          onClick={() => navigate(`/fields/${field.id}`)}
        />
      )
    },
  ];
  return (
    <div className={overview ? undefined : 'fields-workspace'}>
      {!overview && <Tabs
        className="fields-view-tabs"
        activeKey={status}
        onChange={setStatus}
        items={[
          { key: 'All fields', label: `All fields (${fields.length})` },
          { key: 'Needs attention', label: `Needs attention (${attention})` },
          { key: 'Healthy', label: `Healthy (${fields.filter(field => field.status === 'Healthy').length})` },
          { key: 'Critical', label: `Critical (${fields.filter(field => field.status === 'Critical').length})` },
        ]}
        tabBarExtraContent={<Button type="primary" icon={<Plus size={18} />} onClick={() => navigate('/map/add')}>Add field</Button>}
      />}
      {!overview && <div className="fields-controls">
        <Flex className="fields-filter-row" gap={12} align="center">
          <Input
            className="fields-search"
            aria-label="Search fields"
            prefix={<Search size={18} />}
            placeholder="Search by field name, ID or crop…"
            value={query}
            onChange={event => setQuery(event.target.value)}
            allowClear
          />
          <Dropdown
            trigger={['click']}
            menu={{
              items: filterOptions.map(option => ({ ...option, disabled: filters.includes(option.key) })),
              onClick: ({ key }) => setFilters(current => current.includes(key) ? current : [...current, key]),
            }}
          >
            <Button icon={<ListFilter size={18} />}>Add filter</Button>
          </Dropdown>
          {filters.length > 0 && <Flex className="field-filter-chips" gap={12} align="center" aria-label="Active field filters">
          {filters.map(key => <Tag
            key={key}
            closable
            onClose={() => setFilters(current => current.filter(filter => filter !== key))}
          >{filterOptions.find(option => option.key === key)?.label}</Tag>)}
          <Button type="text" onClick={() => setFilters([])}>Clear filters</Button>
          </Flex>}
        </Flex>
      </div>}
      <Card
        className="fields-card"
        title={overview ? <Space wrap>
          Your fields
          <Badge count={fields.length} color="#476b3c" />
          <Badge status="success" text="Live overview" />
        </Space> : undefined}
        extra={overview ? <Button type="link" onClick={() => navigate('/fields')}>
          View all fields
          <ArrowUpRight size={17} />
        </Button> : undefined}
      >
        {overview && <Flex
          className="table-toolbar"
          justify="space-between"
          align="center"
          gap={16}
          wrap
        >
          <Segmented
            value={status}
            onChange={setStatus}
            options={['All fields', { label: `Needs attention (${attention})`, value: 'Needs attention' }, 'Healthy']}
          />
          <Flex
            gap={10}
            wrap
            className="table-filters"
          >
            <Input
              aria-label="Find a field"
              prefix={<Search size={18} />}
              placeholder="Find a field…"
              value={query}
              onChange={event => setQuery(event.target.value)}
              allowClear
            />
            <Select
              aria-label="Filter by crop"
              value={crop}
              onChange={setCrop}
              options={[{ value: 'All crops', label: 'All crops' }, ...cropOptions]}
            />
          </Flex>
        </Flex>}
        <div
          ref={tableViewport}
          className={overview ? undefined : 'fields-table-viewport'}
          style={overview ? undefined : { '--fields-table-body-height': `${tableBodyHeight}px` } as CSSProperties}
        >
          <ConfigProvider theme={{
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
          }}>
            <Table<Field>
              rowKey="id"
              columns={columns}
              dataSource={visible}
              scroll={{ x: 1080, ...(overview ? {} : { y: tableBodyHeight }) }}
              pagination={overview ? false : { current: currentPage, pageSize, position: [] }}
              onChange={(_, __, ___, extra) => {
                if (extra.action === 'sort') setPage(1);
              }}
              onRow={field => ({ onClick: () => navigate(`/fields/${field.id}`), className: 'clickable-row' })}
              locale={{
                emptyText: <Empty description="No fields match your filters">
                  <Button onClick={() => {
                    setQuery('');
                    setStatus('All fields');
                    setCrop('All crops');
                    setFilters([]);
                  }}>Clear filters</Button>
                </Empty>
              }}
            />
          </ConfigProvider>
        </div>
        <Flex
          className="table-footer"
          justify="space-between"
          gap={12}
          wrap
        >
          <Typography.Text type="secondary">
            {overview
              ? `Showing ${visible.length} of ${fields.length} fields`
              : `${visible.length ? (currentPage - 1) * pageSize + 1 : 0}–${Math.min(currentPage * pageSize, visible.length)} of ${visible.length} fields`}
          </Typography.Text>
          {overview ? <Badge status="success" text="Last synced just now" /> : <Pagination
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
          />}
        </Flex>
      </Card>
    </div>
  );
}
