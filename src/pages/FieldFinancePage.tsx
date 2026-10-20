import { Alert, Button, Card, Descriptions, Flex, Result, Select, Space, Tag, Typography } from 'antd';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { PageHeading } from '../components/common/PageHeading';
import { FinanceInsight } from '../components/finance/FinanceInsight';
import { FinanceStats } from '../components/finance/FinanceStats';
import { InputPrices } from '../components/finance/InputPrices';
import { LandPurchase } from '../components/finance/LandPurchase';
import { OperatingCosts } from '../components/finance/OperatingCosts';
import { RegionalPrices } from '../components/finance/RegionalPrices';
import { RotationFinance } from '../components/finance/RotationFinance';
import { money } from '../components/finance/format';
import { getFieldFinance } from '../data/finance';
import { useFarm } from '../hooks/useFarm';
import type { Navigate } from '../types/navigation';

export function FieldFinancePage({ fieldId, navigate }: { fieldId: number; navigate: Navigate; }) {
  const { fields, preferences } = useFarm();
  const field = fields.find(item => item.id === fieldId);
  if (!field) {
    return (
      <Result
        status="404"
        title="Field not found"
        subTitle="This field may have been removed from your farm."
        extra={<Button type="primary" onClick={() => navigate('/finance')}>Back to Finance</Button>}
      />
    );
  }
  const estimate = getFieldFinance(field);
  return (
    <>
      <Flex
        justify="space-between"
        align="center"
        gap={16}
        wrap
        className="finance-field-navigation"
      >
        <Button
          type="text"
          icon={<ArrowLeft size={20} />}
          onClick={() => navigate('/finance')}
        >Back to Finance</Button>
        <Space wrap>
          <Typography.Text type="secondary">View field</Typography.Text>
          <Select
            aria-label="Select financial field"
            value={field.id}
            onChange={id => navigate(`/finance/fields/${id}`)}
            options={fields.map(item => ({ value: item.id, label: item.name }))}
          />
        </Space>
      </Flex>
      <PageHeading
        title={`${field.name}, in numbers.`}
        description={`${field.crop} · ${field.area} hectares · 2026 financial outlook · USD`}
        eyebrow={`${preferences.farmName.toUpperCase()} · FINANCE`}
        actions={<><Tag>Beta</Tag><Button icon={<ArrowUpRight size={18} />} onClick={() => navigate(`/fields/${field.id}`)}>View field health</Button></>}
      />
      <FinanceStats {...estimate} scope="For this field’s current crop" />
      <div className="finance-stack">
        {estimate.margin < 0 && <Alert
          type="warning"
          showIcon
          title="This field is projected below operating break-even."
          description={`The budget exceeds the estimated crop revenue by ${money(-estimate.margin)}. Review yield recovery, input purchases, and next-season rotation options below.`}
        />}
        <FinanceInsight key={field.id} field={field} />
        <Card title="The assumptions behind the estimate">
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
                key: 'yield',
                label: 'Expected harvest yield',
                children: `${estimate.yieldPerHectare.toFixed(1)} t/ha`
              },
              {
                key: 'production',
                label: 'Total crop production',
                children: `${estimate.production.toFixed(1)} tonnes`
              },
              {
                key: 'buyer',
                label: 'Best net-price buyer',
                children: estimate.offer.buyer
              },
              {
                key: 'price',
                label: 'Net selling price',
                children: `${money(estimate.pricePerTonne)} / tonne`
              },
              {
                key: 'break-price',
                label: 'Break-even selling price',
                children: `${money(estimate.breakEvenPrice)} / tonne`
              },
              {
                key: 'break-yield',
                label: 'Break-even harvest yield',
                children: `${estimate.breakEvenYield.toFixed(2)} t/ha`
              },
              {
                key: 'margin',
                label: 'Operating margin per hectare',
                children: money(estimate.marginPerHectare)
              },
              {
                key: 'formula',
                label: 'Revenue estimate',
                children: 'Area × expected yield × net selling price'
              },
              {
                key: 'scope',
                label: 'Operating margin includes',
                children: 'Seasonal operating costs; land financing shown separately'
              },
            ]}
          />
        </Card>
        <OperatingCosts field={field} />
        <RegionalPrices crop={field.crop} />
        <InputPrices crop={field.crop} />
        <RotationFinance field={field} />
        <LandPurchase field={field} />
      </div>
    </>
  );
}
