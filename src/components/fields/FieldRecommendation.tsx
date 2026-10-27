import { useEffect, useState } from 'react';
import { Card, Skeleton, Space, Tag, Typography } from 'antd';
import { Sparkles } from 'lucide-react';
import { getRecommendation } from '../../data/recommendations';
import type { Field } from '../../types/field';

export function FieldRecommendation({ field }: { field: Field; }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 850);
    return () => window.clearTimeout(timer);
  }, []);
  const recommendation = getRecommendation(field);
  return (
    <Card
      className="insight-card ai-insight-card"
      title={<Space>
        <Sparkles size={22} className="ai-insight-sparkle" aria-hidden="true" />
        Your field, explained
      </Space>}
      extra={<Tag className="ai-insight-tag">AI INSIGHT</Tag>}
    >
      {!ready ? <div aria-live="polite">
        <Typography.Paragraph type="secondary">Taking a look at your field…</Typography.Paragraph>
        <Skeleton
          active
          paragraph={{ rows: 3 }}
          title={false}
        />
      </div> : <><Typography.Title level={3}>
        {recommendation.title}
      </Typography.Title><Typography.Paragraph>
          {recommendation.description}
        </Typography.Paragraph></>}
    </Card>
  );
}
