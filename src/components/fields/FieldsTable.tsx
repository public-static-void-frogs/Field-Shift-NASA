import { useState } from 'react';
import { Badge, Button, Card, Empty, Flex, Input, Progress, Segmented, Select, Space, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { ArrowUpRight, Droplets, Search, Wheat } from 'lucide-react';
import { useFarm } from '../../hooks/useFarm';
import { cropOptions } from '../../data/fields';
import type { Field } from '../../types/field';
import type { Navigate } from '../../types/navigation';
import { FieldStatus } from './FieldStatus';

export function FieldsTable({ navigate, overview = false }: { navigate: Navigate; overview?: boolean; }) {
  const { fields } = useFarm();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All fields');
  const [crop, setCrop] = useState('All crops');
  const attention = fields.filter(field => field.status !== 'Healthy').length;
  const visible = fields.filter(field =>
    field.name.toLowerCase().includes(query.toLowerCase()) &&
    (status === 'All fields' || (status === 'Needs attention' ? field.status !== 'Healthy' : field.status === status)) &&
    (crop === 'All crops' || field.crop === crop),
  );
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
    <Card
      className="fields-card"
      title={<Space wrap>
        Your fields
        <Badge count={fields.length} color="#476b3c" />
        <Badge status="success" text="Live overview" />
      </Space>}
      extra={<Button type="link" onClick={() => navigate(overview ? '/fields' : '/map')}>
        {overview ? 'View all fields' : 'View on map'}
        <ArrowUpRight size={17} />
      </Button>}
    >
      <Flex
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
      </Flex>
      <Table<Field>
        rowKey="id"
        columns={columns}
        dataSource={visible}
        scroll={{ x: 1080 }}
        pagination={false}
        onRow={field => ({ onClick: () => navigate(`/fields/${field.id}`), className: 'clickable-row' })}
        locale={{
          emptyText: <Empty description="No fields match your filters">
            <Button onClick={() => {
              setQuery('');
              setStatus('All fields');
              setCrop('All crops');
            }}>Clear filters</Button>
          </Empty>
        }}
      />
      <Flex
        className="table-footer"
        justify="space-between"
        gap={12}
        wrap
      >
        <Typography.Text type="secondary">
          Showing
          {visible.length}
          of
          {fields.length}
          fields
        </Typography.Text>
        <Badge status="success" text="Last synced just now" />
      </Flex>
    </Card>
  );
}
