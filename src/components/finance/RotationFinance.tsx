import { Card, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { getRotationEstimates } from '../../data/finance';
import type { Field } from '../../types/field';
import type { RotationEstimate } from '../../types/finance';
import { money } from './format';

export function RotationFinance({ field }: { field: Field; }) {
  const rotations = getRotationEstimates(field);
  const columns: TableColumnsType<RotationEstimate> = [
    {
      title: '2027 crop option',
      dataIndex: 'crop',
      width: 280,
      render: (crop: string, row) => (
        <div>
          <Space wrap>
            <Typography.Text strong>
              {crop}
            </Typography.Text>
            {crop === field.crop && <Tag>Current crop</Tag>}
            {row.crop === rotations[0].crop && <Tag color="success">Highest estimate</Tag>}
          </Space>
          <Typography.Text type="secondary" className="cost-description">
            {row.recommendation}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Yield / ha',
      dataIndex: 'yieldPerHectare',
      render: (value: number) => `${value.toFixed(1)} t`
    },
    {
      title: 'Net price / t',
      dataIndex: 'pricePerTonne',
      render: money
    },
    {
      title: 'Operating / ha',
      dataIndex: 'operatingPerHectare',
      render: money
    },
    {
      title: 'Switching cost / ha',
      dataIndex: 'transitionPerHectare',
      render: money
    },
    {
      title: 'Margin / ha',
      dataIndex: 'marginPerHectare',
      render: (value: number) => (
        <Typography.Text strong className={value < 0 ? 'finance-negative' : 'finance-positive'}>
          {money(value)}
        </Typography.Text>
      )
    },
    {
      title: 'Whole-field margin',
      dataIndex: 'totalMargin',
      render: money
    },
    {
      title: 'vs. 2026 margin / ha',
      dataIndex: 'changeFromCurrent',
      render: (value: number) => (
        <Typography.Text className={value < 0 ? 'finance-negative' : 'finance-positive'}>
          {`${value >= 0 ? '+' : ''}${money(value)}`}
        </Typography.Text>
      )
    },
  ];
  return (
    <Card title="What could the next rotation look like?" extra={<Tag>2027 planning</Tag>}>
      <Typography.Paragraph type="secondary">Compare typical next-season yields at today’s regional net prices. Switching costs include seedbed preparation and setup. Changes versus 2026 reflect both the crop choice and the next-season yield assumption.</Typography.Paragraph>
      <Table<RotationEstimate>
        rowKey="crop"
        columns={columns}
        dataSource={rotations}
        pagination={false}
        scroll={{ x: 1460 }}
      />
    </Card>
  );
}
