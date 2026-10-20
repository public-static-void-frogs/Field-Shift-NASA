import { Alert, Card, Descriptions, Typography } from 'antd';
import { getLandPurchaseEstimate } from '../../data/finance';
import type { Field } from '../../types/field';
import { money } from './format';

export function LandPurchase({ field }: { field: Field; }) {
  const purchase = getLandPurchaseEstimate(field);
  return (
    <Card
      title="If you were buying this land today"
      extra={<Typography.Text type="secondary">Acquisition scenario</Typography.Text>}
    >
      <Typography.Paragraph type="secondary">A purchase estimate for this parcel, separate from its operating budget. Assumes 40% down, 60% financing at 5.5% annual interest, and 2% closing costs.</Typography.Paragraph>
      <Descriptions
        bordered
        layout="vertical"
        column={{
          xs: 1,
          sm: 2,
          lg: 3
        }}
        items={[
          {
            key: 'price',
            label: 'Estimated land price / ha',
            children: money(purchase.pricePerHectare)
          },
          {
            key: 'total',
            label: 'Total land value',
            children: money(purchase.landValue)
          },
          {
            key: 'closing',
            label: 'Closing costs · 2%',
            children: money(purchase.closingCosts)
          },
          {
            key: 'down',
            label: 'Down payment · 40%',
            children: money(purchase.downPayment)
          },
          {
            key: 'loan',
            label: 'Amount financed · 60%',
            children: money(purchase.loan)
          },
          {
            key: 'cash',
            label: 'Initial cash required',
            children: money(purchase.cashRequired)
          },
          {
            key: 'interest',
            label: 'Annual interest cost',
            children: money(purchase.annualInterest)
          },
          {
            key: 'margin',
            label: 'Annual margin after interest',
            children: <Typography.Text
              strong
              className={purchase.annualMarginAfterInterest < 0 ? 'finance-negative' : 'finance-positive'}
            >
              {money(purchase.annualMarginAfterInterest)}
            </Typography.Text>
          },
          {
            key: 'return',
            label: 'Annual return on initial cash',
            children: `${purchase.cashReturnRate.toFixed(1)}%`
          },
        ]}
      />
      <Alert
        className="finance-assumptions"
        type={purchase.annualMarginAfterInterest < 0 ? 'warning' : 'info'}
        showIcon
        title={purchase.annualMarginAfterInterest < 0 ? 'The current crop margin does not cover the annual interest estimate.' : 'Compare the crop return with the cost of financing.'}
        description="This interest-only view excludes principal repayments and land resale gains. Existing annual insurance and land charges are included in operating costs."
      />
    </Card>
  );
}
