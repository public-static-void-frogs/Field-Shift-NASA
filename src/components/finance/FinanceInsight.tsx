import { useEffect, useState } from 'react';
import { Card, Flex, Skeleton, Space, Tag, Typography } from 'antd';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { getFinanceInsight } from '../../data/finance';
import type { Field } from '../../types/field';

export function FinanceInsight({ field }: { field: Field; }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 750);
    return () => window.clearTimeout(timer);
  }, []);
  const insight = getFinanceInsight(field);
  return (
    <Card
      className="insight-card"
      title={<Space>
        <Sparkles size={22} />
        Your financial outlook, explained
      </Space>}
      extra={<Tag>AI ESTIMATE</Tag>}
    >
      {!ready ? <div aria-live="polite">
        <Typography.Paragraph>Looking at this field’s financial picture…</Typography.Paragraph>
        <Skeleton
          active
          title={false}
          paragraph={{ rows: 3 }}
        />
      </div> : (
        <>
          <Typography.Title level={3}>
            {insight.title}
          </Typography.Title>
          <Typography.Paragraph>
            {insight.description}
          </Typography.Paragraph>
          <div className="finance-insight-steps">
            {insight.steps.map(step => (
              <Flex
                key={step}
                gap={12}
                align="flex-start"
              >
                <CheckCircle2 size={20} />
                <Typography.Text>
                  {step}
                </Typography.Text>
              </Flex>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
