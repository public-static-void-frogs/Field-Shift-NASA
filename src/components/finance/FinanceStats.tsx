import { Card, Statistic, Typography } from 'antd';
import { Banknote, CircleDollarSign, TrendingUp, Wallet } from 'lucide-react';
import { money } from './format';

interface FinanceStatsProps {
  revenue: number;
  operatingCosts: number;
  margin: number;
  marginRate: number;
  scope: string;
}
export function FinanceStats({ revenue, operatingCosts, margin, marginRate, scope }: FinanceStatsProps) {
  const metrics = [
    {
      title: 'Estimated crop revenue',
      value: revenue,
      icon: Banknote,
      note: 'After transport deductions',
      currency: true
    },
    {
      title: 'Operating budget',
      value: operatingCosts,
      icon: Wallet,
      note: 'Seed through harvest & storage',
      currency: true
    },
    {
      title: 'Operating margin',
      value: margin,
      icon: CircleDollarSign,
      note: 'Revenue less operating costs',
      currency: true
    },
    {
      title: 'Margin on revenue',
      value: marginRate,
      icon: TrendingUp,
      note: scope,
      currency: false
    },
  ];
  return (
    <section className="stat-grid" aria-label="Financial estimates">
      {metrics.map(({ title, value, icon: Icon, note, currency }) => (
        <Card key={title} className="stat-card">
          <Statistic
            title={<span className="stat-title">
              {title}
              <Icon size={20} />
            </span>}
            value={value}
            precision={currency ? 0 : 1}
            formatter={currency ? value => money(Number(value)) : undefined}
            suffix={currency ? undefined : '%'}
            styles={{ content: { color: value < 0 ? '#923a2e' : '#303b2c' } }}
          />
          <Typography.Text type="secondary">
            {note}
          </Typography.Text>
        </Card>
      ))}
    </section>
  );
}
