import { useState } from 'react';
import type { Key } from 'react';
import { Button, Card, Empty, Flex, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { ArrowUpRight, Search } from 'lucide-react';
import { getFieldFinance } from '../../data/finance';
import { cropOptions } from '../../data/fields';
import type { Field } from '../../types/field';
import type { Navigate } from '../../types/navigation';
import { money } from './format';

interface FinanceFieldsTableProps {
  fields: Field[];
  selectedKeys: Key[];
  onSelectionChange: (keys: Key[]) => void;
  navigate: Navigate;
}
export function FinanceFieldsTable({ fields, selectedKeys, onSelectionChange, navigate }: FinanceFieldsTableProps) {
  const [query, setQuery] = useState('');
  const [crop, setCrop] = useState('All crops');
  const visible = fields.filter(field => (
    field.name.toLowerCase().includes(query.toLowerCase()) &&
    (crop === 'All crops' || field.crop === crop)
  ));
  const columns: TableColumnsType<Field> = [
    {
      title: 'Field',
      dataIndex: 'name',
      width: 240,
      render: (name: string, field) => (
        <Space size={12}>
          <span className={`field-thumb thumb-${field.id % 5}`} />
          <div>
            <Button
              type="link"
              className="field-name-link"
              href={`#/finance/fields/${field.id}`}
            >
              {name}
            </Button>
            <Typography.Text type="secondary" className="field-id">
              {`${field.crop} · ${field.area} ha`}
            </Typography.Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Yield estimate',
      key: 'yield',
      render: (_, field) => `${getFieldFinance(field).yieldPerHectare.toFixed(1)} t/ha`,
    },
    {
      title: 'Crop revenue',
      key: 'revenue',
      render: (_, field) => money(getFieldFinance(field).revenue),
    },
    {
      title: 'Operating costs',
      key: 'costs',
      render: (_, field) => money(getFieldFinance(field).operatingCosts),
    },
    {
      title: 'Operating margin',
      key: 'margin',
      sorter: (a, b) => getFieldFinance(a).margin - getFieldFinance(b).margin,
      render: (_, field) => {
        const estimate = getFieldFinance(field);
        return (
          <div>
            <Typography.Text strong className={estimate.margin < 0 ? 'finance-negative' : 'finance-positive'}>
              {money(estimate.margin)}
            </Typography.Text>
            <Typography.Text type="secondary" className="field-id">
              {`${money(estimate.marginPerHectare)} / ha`}
            </Typography.Text>
          </div>
        );
      },
    },
    {
      title: 'Outlook',
      key: 'outlook',
      render: (_, field) => {
        const estimate = getFieldFinance(field);
        return (
          <Tag color={estimate.margin < 0 ? 'error' : estimate.marginRate < 20 ? 'warning' : 'success'}>
            {estimate.margin < 0 ? 'Below break-even' : estimate.marginRate < 20 ? 'Narrow margin' : 'Positive margin'}
          </Tag>
        );
      },
    },
    {
      title: '',
      key: 'open',
      width: 60,
      render: (_, field) => (
        <Button
          type="text"
          aria-label={`View finances for ${field.name}`}
          icon={<ArrowUpRight size={20} />}
          onClick={() => navigate(`/finance/fields/${field.id}`)}
        />
      ),
    },
  ];
  return (
    <Card title="Your fields, by the numbers" className="finance-fields-card">
      <Flex
        justify="space-between"
        align="center"
        gap={16}
        wrap
        className="table-toolbar"
      >
        <Typography.Text type="secondary">Choose fields to compare totals. Open a field for the full picture.</Typography.Text>
        <Flex
          gap={10}
          wrap
          className="table-filters"
        >
          <Input
            aria-label="Find a financial field"
            prefix={<Search size={18} />}
            placeholder="Find a field…"
            allowClear
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
          <Select
            aria-label="Filter financial fields by crop"
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
        pagination={false}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: onSelectionChange,
          getTitleCheckboxProps: () => ({ 'aria-label': 'Select all financial fields' }),
          getCheckboxProps: field => ({ 'aria-label': `Select ${field.name}` }),
          columnWidth: 50
        }}
        scroll={{ x: 1180 }}
        onRow={field => ({
          className: 'clickable-row',
          onClick: event => {
            if (!(event.target as HTMLElement).closest('button, a, input, .ant-table-selection-column')) {
              navigate(`/finance/fields/${field.id}`);
            }
          },
        })}
        locale={{ emptyText: <Empty description="No fields match this search." /> }}
      />
      <Flex
        justify="space-between"
        gap={12}
        wrap
        className="table-footer"
      >
        <Typography.Text type="secondary">
          {`Showing ${visible.length} of ${fields.length} fields`}
        </Typography.Text>
        <Typography.Text type="secondary">USD · 2026 growing season</Typography.Text>
      </Flex>
    </Card>
  );
}
