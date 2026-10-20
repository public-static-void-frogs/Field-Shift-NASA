import { Button, Card, Flex, Tag, Typography } from 'antd';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useFarm } from '../../hooks/useFarm';
import type { Navigate } from '../../types/navigation';

export function FieldInsight({ navigate }: { navigate: Navigate; }) {
  const { fields } = useFarm();
  const field = fields.find(item => item.status === 'Critical') || fields.find(item => item.status === 'Needs attention');
  return (
    <Card className="insight-card">
      <Flex justify="space-between" align="center">
        <Typography.Text>
          <Sparkles size={19} />
          A little insight
        </Typography.Text>
        <Tag>AI</Tag>
      </Flex>
      <Typography.Title level={4}>
        {field ? 'A little care can go a long way.' : 'Your fields are looking good.'}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        {field ? `${field.name} could use extra attention. A timely check can help keep growth on track.` : 'Keep your current care routine and check your fields again after the next rain.'}
      </Typography.Paragraph>
      <Button type="link" onClick={() => navigate(field ? `/fields/${field.id}` : '/fields')}>
        {field ? 'Take a look' : 'View your fields'}
        <ArrowRight size={18} />
      </Button>
    </Card>
  );
}
