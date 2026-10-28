import { Tag } from 'antd';
import type { FieldStatusProps } from '../../../types/fields/FieldStatus.types.ts';
import { fieldStatusPresentation } from '../utils/fieldPresentation.ts';

export function FieldStatus({ status }: FieldStatusProps) {
  const { icon: Icon, color } = fieldStatusPresentation[status];

  return (
    <Tag color={color} icon={<Icon size={15} />}>
      {status}
    </Tag>
  );
}
