import { Flex, Typography } from 'antd';
import type { ReactNode } from 'react';

const { Title, Paragraph, Text } = Typography;

interface PageHeadingProps {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export function PageHeading({ title, description, eyebrow = 'YOUR FARM, AT A GLANCE', actions }: PageHeadingProps) {
  return (
    <Flex
      className="page-heading"
      justify="space-between"
      align="center"
      gap={20}
      wrap
    >
      <div>
        {eyebrow && <Text className="eyebrow">
          {eyebrow}
        </Text>}
        <Title level={1}>
          {title}
        </Title>
        <Paragraph type="secondary">
          {description}
        </Paragraph>
      </div>
      {actions && <Flex gap={10} wrap>
        {actions}
      </Flex>}
    </Flex>
  );
}
