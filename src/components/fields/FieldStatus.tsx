import { Tag } from 'antd';
import { CheckCircle2, CircleAlert, TriangleAlert } from 'lucide-react';
import type { FieldStatusProps } from '../../types/fields/FieldStatus.types.ts';

export function FieldStatus({ status }: FieldStatusProps) {
  const Icon =
    status === 'Healthy' ? CheckCircle2 : status === 'Critical' ? TriangleAlert : CircleAlert;
  const color = status === 'Healthy' ? 'success' : status === 'Critical' ? 'error' : 'warning';
  return (
    <Tag color={color} icon={<Icon size={15} />}>
      {status}
    </Tag>
  );
}
