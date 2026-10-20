import { Card, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { procurementOffers } from '../../data/finance';
import { decimalMoney, money } from './format';

type InputOffer = typeof procurementOffers[number];

const columns: TableColumnsType<InputOffer> = [
  { title: 'Input', dataIndex: 'input' },
  { title: 'Best local supplier', dataIndex: 'supplier' },
  { title: 'Unit', dataIndex: 'unit' },
  {
    title: 'Local price',
    dataIndex: 'localPrice',
    render: decimalMoney
  },
  {
    title: 'Regional average',
    dataIndex: 'regionalAverage',
    render: decimalMoney
  },
  {
    title: 'Potential saving',
    key: 'saving',
    render: (_, offer) => (
      <Tag color="success">
        {`${offer.localPrice < 1 ? decimalMoney(offer.regionalAverage - offer.localPrice) : money(offer.regionalAverage - offer.localPrice)} / ${offer.unit}`}
      </Tag>
    ),
  },
  { title: 'Availability', dataIndex: 'delivery' },
];

export function InputPrices({ crop }: { crop?: string; }) {
  const visible = procurementOffers.filter(offer => !crop || !offer.key.endsWith('-seed') || offer.key === (crop === 'Corn' ? 'corn-seed' : crop === 'Soybeans' ? 'soy-seed' : 'wheat-seed'));
  return (
    <Card title="Buy inputs with a little more confidence." className="finance-section">
      <Typography.Paragraph type="secondary">Compare local purchase prices with the regional average. Savings are per listed unit; field budgets already include their own input allowances.</Typography.Paragraph>
      <Table<InputOffer>
        columns={columns}
        dataSource={visible}
        pagination={false}
        scroll={{ x: 1100 }}
      />
    </Card>
  );
}
