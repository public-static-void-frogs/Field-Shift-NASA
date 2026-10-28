import { Tag } from 'antd';
import type { Field } from '../../../types/fields/field.types.ts';

import { fieldStatusPresentation } from '../utils/fieldPresentation.ts';

type FieldStatusProps = { status: Field['status'] };

export function FieldStatus({ status }: FieldStatusProps) {
  const { icon: Icon, color } = fieldStatusPresentation[status];

  return (
    <Tag color={color} icon={<Icon size={15} />}>
      {status}
    </Tag>
  );
}
