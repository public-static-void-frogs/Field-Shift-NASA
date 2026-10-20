import { Tag } from 'antd';
import { CheckCircle2, CircleAlert, TriangleAlert } from 'lucide-react';
import type { Field } from '../../types/field';

export function FieldStatus({ status }: { status: Field['status']; }) {
  const Icon = status === 'Healthy' ? CheckCircle2 : status === 'Critical' ? TriangleAlert : CircleAlert;
  const color = status === 'Healthy' ? 'success' : status === 'Critical' ? 'error' : 'warning';
  return (
    <Tag color={color} icon={<Icon size={15} />}>
      {status}
    </Tag>
  );
}
