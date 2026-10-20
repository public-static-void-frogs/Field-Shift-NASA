import { useState } from 'react';
import type { Key } from 'react';
import { Button, Card, Flex, Space, Tag, Typography } from 'antd';
import { ArrowRight, CalendarDays, MapPin, Sparkles } from 'lucide-react';
import { PageHeading } from '../components/common/PageHeading';
import { FinanceStats } from '../components/finance/FinanceStats';
import { FinanceFieldsTable } from '../components/finance/FinanceFieldsTable';
import { InputPrices } from '../components/finance/InputPrices';
import { RegionalPrices } from '../components/finance/RegionalPrices';
import { getFinanceTotals, financeRegion } from '../data/finance';
import { useFarm } from '../hooks/useFarm';
import type { Navigate } from '../types/navigation';

export function FinancePage({ navigate }: { navigate: Navigate; }) {
  const { fields } = useFarm();
  const [selectedKeys, setSelectedKeys] = useState<Key[]>(() => fields.map(field => field.id));
  const selectedFields = fields.filter(field => selectedKeys.includes(field.id));
  const totals = getFinanceTotals(selectedFields);
  const selectedCount = selectedFields.length;
  return (
    <>
      <PageHeading
        title="Make every hectare count."
        description="A financial outlook for your fields, from the first input to the next harvest."
        eyebrow="FINANCE · 2026 SEASON"
        actions={<Space wrap>
          <Tag>Beta</Tag>
          <Tag icon={<MapPin size={15} />}>
            {financeRegion}
          </Tag>
          <Tag icon={<CalendarDays size={15} />}>USD · 2026</Tag>
        </Space>}
      />
      <Flex
        justify="space-between"
        align="center"
        gap={16}
        wrap
        className="section-gap"
      >
        <Typography.Title level={3} className="no-margin">Your season’s financial outlook</Typography.Title>
        <Space wrap>
          <Typography.Text type="secondary">
            {`${selectedCount} of ${fields.length} fields selected`}
          </Typography.Text>
          <Button type="link" onClick={() => setSelectedKeys(fields.map(field => field.id))}>Select all</Button>
          <Button type="link" onClick={() => setSelectedKeys([])}>Clear selection</Button>
        </Space>
      </Flex>
      <FinanceStats
        {...totals}
        scope={selectedCount ? `Across ${selectedCount} selected ${selectedCount === 1 ? 'field' : 'fields'}` : 'Select a field to compare'}
      />
      <div className="finance-stack">
        <Card className="insight-card">
          <Flex
            justify="space-between"
            align="center"
            gap={16}
            wrap
          >
            <div>
              <Typography.Title level={4} className="no-margin">
                <Space>
                  <Sparkles size={22} />
                  A clearer view of your next move.
                </Space>
              </Typography.Title>
              <Typography.Paragraph className="finance-insight-copy">Compare net selling prices, protect your input budget, and review the cost of rotating or buying land before the next season.</Typography.Paragraph>
            </div>
            <Tag>AI ESTIMATES</Tag>
          </Flex>
          {fields.some(field => field.id === 4) && <Button type="link" onClick={() => navigate('/finance/fields/4')}>
            Review East Ridge’s margin
            <ArrowRight size={18} />
          </Button>}
        </Card>
        <FinanceFieldsTable
          fields={fields}
          selectedKeys={selectedKeys}
          onSelectionChange={setSelectedKeys}
          navigate={navigate}
        />
        <RegionalPrices />
        <InputPrices />
      </div>
    </>
  );
}
