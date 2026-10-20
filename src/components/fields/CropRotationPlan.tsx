import { Button, Col, Collapse, Flex, Row, Space, Statistic, Steps, Tag, Typography } from 'antd';
import { ArrowRight, CalendarDays, CheckCircle2, Sprout } from 'lucide-react';
import { calendarEventPath, getFieldPlanEvents, getRotationPlan } from '../../data/planning';
import { formatPlanDate } from '../../utils/planningDates';
import type { Field } from '../../types/field';

export function CropRotationPlan({ field }: { field: Field; }) {
  const plan = getRotationPlan(field);
  const events = getFieldPlanEvents(field);
  const nextRotation = events.find(event => event.id.endsWith('rotation-2027'))!;
  const followingRotation = events.find(event => event.id.endsWith('rotation-2028'))!;
  const nextAction = events[0];
  const content = (
    <>
      <Flex
        justify="space-between"
        align="center"
        gap={24}
        wrap
      >
        <div>
          <Typography.Text className="eyebrow">RECOMMENDED NEXT CROP · 2027 SEASON</Typography.Text>
          <Typography.Title level={2} className="rotation-crop-title">
            {plan.nextCrop}
          </Typography.Title>
          <Space wrap>
            <Tag color="success">
              {`${plan.confidence}% model confidence`}
            </Tag>
            <Tag>System scheduled</Tag>
          </Space>
        </div>
        <div className="rotation-date-callout">
          <Typography.Text strong>Calculated planting date</Typography.Text>
          <Button
            type="link"
            icon={<CalendarDays size={22} />}
            href={`#${calendarEventPath(nextRotation)}`}
          >
            {formatPlanDate(plan.sowingDate)}
          </Button>
          <Typography.Text type="secondary">
            {`Planting window through ${formatPlanDate(plan.windowEnd)}`}
          </Typography.Text>
        </div>
      </Flex>
      <Typography.Paragraph className="rotation-plan-intro">
        A predicted crop sequence based on this field’s current soil readings, crop history, and regional planting windows.
      </Typography.Paragraph>
      <Steps
        className="rotation-sequence"
        current={0}
        responsive
        items={[
          { title: field.crop, subTitle: '2026 · Current crop' },
          {
            title: plan.nextCrop,
            subTitle: '2027 · Recommended',
            content: <a href={`#${calendarEventPath(nextRotation)}`}>
              {formatPlanDate(plan.sowingDate)}
            </a>
          },
          {
            title: plan.followingCrop,
            subTitle: '2028 · Outlook',
            content: <a href={`#${calendarEventPath(followingRotation)}`}>
              {formatPlanDate(plan.followingDate)}
            </a>
          },
        ]}
      />
      <Typography.Title level={4}>Why this rotation fits your field</Typography.Title>
      <div className="rotation-reasons">
        {plan.reasons.map(reason => (
          <Flex
            key={reason}
            align="flex-start"
            gap={12}
          >
            <CheckCircle2 size={20} />
            <Typography.Text>
              {reason}
            </Typography.Text>
          </Flex>
        ))}
      </div>
      <div className="rotation-inputs">
        <Row gutter={[24, 20]}>
          {plan.inputs.map(input => (
            <Col key={input.label} xs={24} sm={12} lg={6}>
              <Statistic title={input.label} value={input.value} formatter={() => input.value} />
            </Col>
          ))}
        </Row>
      </div>
      <Typography.Paragraph type="secondary">
        {plan.dateExplanation}
      </Typography.Paragraph>
      <Flex
        justify="space-between"
        align="center"
        gap={16}
        wrap
        className="rotation-next-action"
      >
        <div>
          <Typography.Text strong>Next system-planned action</Typography.Text>
          <Typography.Paragraph>
            {nextAction.title}
          </Typography.Paragraph>
        </div>
        <Button icon={<CalendarDays size={18} />} href={`#${calendarEventPath(nextAction)}`}>
          {formatPlanDate(nextAction.date)}
          <ArrowRight size={18} />
        </Button>
      </Flex>
    </>
  );

  return (
    <div id="crop-rotation-plan" className="rotation-plan-anchor">
      <Collapse
        className="rotation-plan-card"
        defaultActiveKey={['rotation']}
        expandIconPlacement="end"
        items={[{
          key: 'rotation',
          label: (
            <Flex justify="space-between" align="center" gap={16} wrap>
              <Space>
                <Sprout size={24} />
                <Typography.Title level={4} className="rotation-plan-heading">Your next crop rotation</Typography.Title>
              </Space>
              <Space wrap>
                <Typography.Text strong>{`${plan.nextCrop} · 2027`}</Typography.Text>
                <Tag color="success">ML PREDICTION</Tag>
              </Space>
            </Flex>
          ),
          children: content,
        }]}
      />
    </div>
  );
}
