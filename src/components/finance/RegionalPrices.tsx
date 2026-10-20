import { Card, Flex, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { MapPin, TrendingDown, TrendingUp } from 'lucide-react';
import { cropMarkets, financePriceDate, financeRegion, getBestOffer, getMarket, netCropPrice } from '../../data/finance';
import type { CropOffer } from '../../types/finance';
import { money } from './format';

function BuyerOffers({ crop }: { crop: string; }) {
  const market = getMarket(crop);
  const best = getBestOffer(crop);
  const columns: TableColumnsType<CropOffer> = [
    {
      title: 'Regional buyer',
      dataIndex: 'buyer',
      render: (buyer: string, offer) => (
        <Flex
          align="center"
          gap={10}
          wrap
        >
          <Typography.Text strong>
            {buyer}
          </Typography.Text>
          {offer.id === best.id && <Tag color="success">Best net price</Tag>}
        </Flex>
      ),
    },
    {
      title: 'Distance',
      dataIndex: 'distance',
      render: (value: number) => `${value} km`
    },
    {
      title: 'Buyer price / t',
      dataIndex: 'price',
      render: money
    },
    {
      title: 'Transport / t',
      dataIndex: 'transport',
      render: (value: number) => `−${money(value)}`
    },
    {
      title: 'Net farm-gate / t',
      key: 'net',
      render: (_, offer) => (
        <Typography.Text strong>
          {money(netCropPrice(offer))}
        </Typography.Text>
      ),
    },
    { title: 'Payment terms', dataIndex: 'payment' },
  ];
  return (
    <Table<CropOffer>
      rowKey="id"
      columns={columns}
      dataSource={[...market.offers].sort((a, b) => netCropPrice(b) - netCropPrice(a))}
      pagination={false}
      scroll={{ x: 1000 }}
    />
  );
}
export function RegionalPrices({ crop }: { crop?: string; }) {
  return (
    <Card
      title={crop ? `${crop} · regional buyer prices` : 'The best price is the one you take home.'}
      extra={<Tag icon={<MapPin size={15} />}>
        {financeRegion}
      </Tag>}
      className="regional-prices-card"
    >
      <Typography.Paragraph type="secondary">
        {`Buyer prices for ${financePriceDate}. Net farm-gate prices include transport deductions. All amounts are USD per metric tonne.`}
      </Typography.Paragraph>
      {!crop && (
        <div className="regional-price-grid">
          {cropMarkets.map(market => {
            const offer = getBestOffer(market.crop);
            const TrendIcon = market.change > 0 ? TrendingUp : TrendingDown;
            return (
              <Card key={market.crop} className="crop-price-card">
                <Flex
                  justify="space-between"
                  align="center"
                  gap={12}
                  wrap
                >
                  <Typography.Text strong>
                    {market.crop}
                  </Typography.Text>
                  <Tag color={market.change > 0 ? 'success' : 'warning'} icon={<TrendIcon size={15} />}>
                    {`${market.change > 0 ? '+' : ''}${market.change}% this week`}
                  </Tag>
                </Flex>
                <Statistic
                  value={netCropPrice(offer)}
                  prefix="$"
                  suffix="/ t"
                />
                <Typography.Text>
                  {offer.buyer}
                </Typography.Text>
                <Typography.Text type="secondary" className="price-caption">Best price after transport</Typography.Text>
              </Card>
            );
          })}
        </div>
      )}
      {crop ? <BuyerOffers crop={crop} /> : (
        <Tabs
          items={cropMarkets.map(market => ({
            key: market.crop,
            label: market.crop,
            children: <BuyerOffers crop={market.crop} />,
          }))}
        />
      )}
    </Card>
  );
}
