import { useState } from 'react';
import { Card, Flex, Progress, Segmented, Space, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import type { Field } from '../../types/field';
import type { OperatingCost } from '../../types/finance';
import { getFieldFinance } from '../../data/finance';
import { money } from './format';

export function OperatingCosts({ field }: { field: Field; }) {
  const [unit, setUnit] = useState('Whole field');
  const estimate = getFieldFinance(field);
  const factor = unit === 'Per hectare' ? 1 : field.area;
  const costPerHectare = estimate.operatingCosts / field.area;
  const columns: TableColumnsType<OperatingCost> = [
    {
      title: 'Cost category',
      dataIndex: 'category',
      width: 290,
      render: (category: string, cost) => (
        <div>
          <Typography.Text strong>
            {category}
          </Typography.Text>
          <Typography.Text type="secondary" className="cost-description">
            {cost.description}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: unit === 'Per hectare' ? 'Budget / ha' : 'Field budget',
      dataIndex: 'perHectare',
      render: (value: number) => money(value * factor),
    },
    {
      title: 'Share of operating costs',
      key: 'share',
      width: 280,
      render: (_, cost) => (
        <Space className="cost-share">
          <Progress
            percent={cost.perHectare / costPerHectare * 100}
            showInfo={false}
            strokeColor="#6f8e50"
          />
          <span>
            {`${(cost.perHectare / costPerHectare * 100).toFixed(1)}%`}
          </span>
        </Space>
      ),
    },
  ];
  return (
    <Card
      title="What it takes to grow this field"
      extra={<Segmented
        options={['Whole field', 'Per hectare']}
        value={unit}
        onChange={setUnit}
      />}
    >
      <Typography.Paragraph type="secondary">The seasonal operating budget includes inputs, field work, and harvest. Buyer transport is already deducted from the crop selling price.</Typography.Paragraph>
      <Table<OperatingCost>
        rowKey="key"
        columns={columns}
        dataSource={estimate.costs}
        pagination={false}
        scroll={{ x: 800 }}
      />
      <Flex
        className="finance-cost-total"
        justify="space-between"
        align="center"
        gap={16}
        wrap
      >
        <Typography.Text strong>
          {unit === 'Per hectare' ? 'Total operating cost per hectare' : 'Total field operating budget'}
        </Typography.Text>
        <Typography.Title level={3} className="no-margin">
          {money(costPerHectare * factor)}
        </Typography.Title>
      </Flex>
    </Card>
  );
}
