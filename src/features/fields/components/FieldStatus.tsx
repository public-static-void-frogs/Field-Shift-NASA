import { Tag } from 'antd';
import { fieldStatusPresentation } from '../utils/fieldPresentation.ts';
import type { FieldStatusProps } from '../../../types/fields/FieldStatus.types.ts';

export function FieldStatus({ status }: FieldStatusProps) {
  const { icon: Icon, color } = fieldStatusPresentation[status];

  return (
    <Tag color={color} icon={<Icon size={15} />}>
      {status}
    </Tag>
  );
}
