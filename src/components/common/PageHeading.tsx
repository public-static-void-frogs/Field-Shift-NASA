import { Flex, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const { Title, Paragraph, Text } = Typography;

type PageHeadingProps = {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
};

export function PageHeading({ title, description, eyebrow, actions }: PageHeadingProps) {
  const { t } = useTranslation();
  const headingEyebrow = eyebrow ?? t('YOUR FARM, AT A GLANCE');

  return (
    <Flex className="page-heading" justify="space-between" align="center" gap={20} wrap>
      <div>
        {headingEyebrow && <Text className="eyebrow">{headingEyebrow}</Text>}
        <Title level={1}>{title}</Title>
        <Paragraph type="secondary">{description}</Paragraph>
      </div>
      {actions && (
        <Flex gap={10} wrap>
          {actions}
        </Flex>
      )}
    </Flex>
  );
}
