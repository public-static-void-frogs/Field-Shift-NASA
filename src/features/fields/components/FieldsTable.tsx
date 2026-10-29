import { useSuspenseQuery } from '@tanstack/react-query';
import type { TableColumnsType } from 'antd';
import {
  Badge,
  Button,
  Card,
  ConfigProvider,
  Dropdown,
  Empty,
  Flex,
  Input,
  Pagination,
  Progress,
  Segmented,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { ArrowUpRight, Droplets, ListFilter, Plus, Search, Wheat } from 'lucide-react';
import { type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fieldQueries } from '../../../api/fields/fields.queries.ts';
import { RouterButton } from '../../../components/common/RouterButton';
import { useTablePagination } from '../../../hooks/useTablePagination.ts';
import { useTableViewport } from '../../../hooks/useTableViewport.ts';
import type { Field } from '../../../types/fields/field.types.ts';

import { useFieldFilters } from '../hooks/useFieldFilters.ts';
import { getFieldFilterOptions } from '../utils/fieldFilterOptions.ts';
import { fieldStatusPresentation } from '../utils/fieldPresentation.ts';
import { FieldStatus } from './FieldStatus';

type FieldsTableProps = {
  overview?: boolean;
};

export function FieldsTable({ overview = false }: FieldsTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: fields } = useSuspenseQuery(fieldQueries.list());
  const { data: cropOptions } = useSuspenseQuery(fieldQueries.crops());
  const filtering = useFieldFilters(fields, overview);
  const { query, status, crop, filters } = filtering.criteria;
  const { visible } = filtering;
  const pagination = useTablePagination(visible.length);
  const { tableViewport, tableBodyHeight } = useTableViewport(!overview);
  const filterOptions = getFieldFilterOptions(cropOptions, fields, t);
  const attention = fields.filter((field) => field.status !== 'Healthy').length;
  const columns: TableColumnsType<Field> = [
    {
      title: t('Field name'),
      dataIndex: 'name',
      key: 'name',
      width: 235,
      render: (name: string, field, index) => (
        <Space size={12}>
          <span className={`field-thumb thumb-${index % 5}`} />
          <div>
            <RouterButton type="link" className="field-name-link" to={`/fields/${field.id}`}>
              {name}
            </RouterButton>
            <Typography.Text type="secondary" className="field-id">
              {t('Field')} {String(field.parcelId).padStart(2, '0')}
            </Typography.Text>
          </div>
        </Space>
      ),
    },
    {
      title: t('Crop type'),
      dataIndex: 'crop',
      key: 'crop',
      render: (value: string) => (
        <Space>
          <Wheat size={17} className="muted-icon" />
          {value}
        </Space>
      ),
    },
    {
      title: t('Area'),
      dataIndex: 'area',
      key: 'area',
      sorter: (a, b) => a.area - b.area,
      render: (value: number) => t('{{value0}} ha', { value0: value }),
    },
    {
      title: t('Crop health'),
      dataIndex: 'health',
      key: 'health',
      width: 165,
      sorter: (a, b) => a.health - b.health,
      render: (value: number, field) => (
        <div className="health-cell">
          <span>
            {value}
            <Typography.Text type="secondary">/100</Typography.Text>
          </span>
          <Progress
            percent={value}
            showInfo={false}
            size="small"
            strokeColor={fieldStatusPresentation[field.status].stroke}
          />
        </div>
      ),
    },
    {
      title: t('Soil moisture'),
      dataIndex: 'moisture',
      key: 'moisture',
      render: (value: number) => (
        <Space>
          <Droplets size={17} className="muted-icon" />
          {value}%
        </Space>
      ),
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      render: (value: Field['status']) => <FieldStatus status={value} />,
    },
    {
      title: '',
      key: 'open',
      width: 60,
      render: (_, field) => (
        <RouterButton
          type="text"
          aria-label={t('Open {{value0}}', { value0: field.name })}
          icon={<ArrowUpRight size={19} />}
          to={`/fields/${field.id}`}
        />
      ),
    },
  ];

  return (
    <div className={overview ? undefined : 'fields-workspace'}>
      {!overview && (
        <Tabs
          className="fields-view-tabs"
          activeKey={status}
          onChange={(status) => filtering.update({ status })}
          items={[
            { key: 'All fields', label: t('All fields ({{value0}})', { value0: fields.length }) },
            {
              key: 'Needs attention',
              label: t('Needs attention ({{value0}})', { value0: attention }),
            },
            {
              key: 'Healthy',
              label: t('Healthy ({{value0}})', {
                value0: fields.filter((field) => field.status === 'Healthy').length,
              }),
            },
            {
              key: 'Critical',
              label: t('Critical ({{value0}})', {
                value0: fields.filter((field) => field.status === 'Critical').length,
              }),
            },
          ]}
          tabBarExtraContent={
            <RouterButton type="primary" icon={<Plus size={18} />} to="/map/add">
              {t('Add field')}
            </RouterButton>
          }
        />
      )}
      {!overview && (
        <div className="fields-controls">
          <Flex className="fields-filter-row" gap={12} align="center">
            <Input
              className="fields-search"
              aria-label={t('Search fields')}
              prefix={<Search size={18} />}
              placeholder={t('Search by field name, ID or crop…')}
              value={query}
              onChange={(event) => filtering.update({ query: event.target.value })}
              allowClear
            />
            <Dropdown
              trigger={['click']}
              menu={{
                items: filterOptions.map((option) => ({
                  ...option,
                  disabled: filters.includes(option.key),
                })),
                onClick: ({ key }) =>
                  filtering.update({
                    filters: filters.includes(key) ? filters : [...filters, key],
                  }),
              }}
            >
              <Button icon={<ListFilter size={18} />}>{t('Add filter')}</Button>
            </Dropdown>
            {filters.length > 0 && (
              <Flex
                className="field-filter-chips"
                gap={12}
                align="center"
                aria-label={t('Active field filters')}
              >
                {filters.map((key) => (
                  <Tag
                    key={key}
                    closable
                    onClose={() =>
                      filtering.update({ filters: filters.filter((filter) => filter !== key) })
                    }
                  >
                    {filterOptions.find((option) => option.key === key)?.label}
                  </Tag>
                ))}
                <Button type="text" onClick={() => filtering.update({ filters: [] })}>
                  {t('Clear filters')}
                </Button>
              </Flex>
            )}
          </Flex>
        </div>
      )}
      <Card
        className="fields-card"
        title={
          overview ? (
            <Space wrap>
              {t('Your fields')} <Badge count={fields.length} color="#476b3c" />
              <Badge status="success" text={t('Live overview')} />
            </Space>
          ) : undefined
        }
        extra={
          overview ? (
            <RouterButton type="link" to="/fields">
              {t('View all fields')} <ArrowUpRight size={17} />
            </RouterButton>
          ) : undefined
        }
      >
        {overview && (
          <Flex className="table-toolbar" justify="space-between" align="center" gap={16} wrap>
            <Segmented
              value={status}
              onChange={(status) => filtering.update({ status })}
              options={[
                { value: 'All fields', label: t('All fields') },
                {
                  label: t('Needs attention ({{value0}})', { value0: attention }),
                  value: 'Needs attention',
                },
                { value: 'Healthy', label: t('Healthy') },
              ]}
            />
            <Flex gap={10} wrap className="table-filters">
              <Input
                aria-label={t('Find a field')}
                prefix={<Search size={18} />}
                placeholder={t('Find a field…')}
                value={query}
                onChange={(event) => filtering.update({ query: event.target.value })}
                allowClear
              />
              <Select
                aria-label={t('Filter by crop')}
                value={crop}
                onChange={(crop) => filtering.update({ crop })}
                options={[{ value: 'All crops', label: t('All crops') }, ...cropOptions]}
              />
            </Flex>
          </Flex>
        )}
        <div
          ref={tableViewport}
          className={overview ? undefined : 'fields-table-viewport'}
          style={
            overview
              ? undefined
              : ({ '--fields-table-body-height': `${tableBodyHeight}px` } as CSSProperties)
          }
        >
          <ConfigProvider
            theme={{
              components: {
                Table: {
                  headerBg: '#ffffff',
                  headerColor: '#314529',
                  headerSplitColor: '#dfe5d5',
                  headerSortActiveBg: '#ffffff',
                  headerSortHoverBg: '#ffffff',
                  colorTextDescription: '#627653',
                },
              },
            }}
          >
            <Table<Field>
              rowKey="id"
              columns={columns}
              dataSource={visible}
              scroll={{ x: 1080, ...(overview ? {} : { y: tableBodyHeight }) }}
              pagination={
                overview
                  ? false
                  : { current: pagination.currentPage, pageSize: pagination.pageSize, position: [] }
              }
              onChange={(_, __, ___, extra) => {
                if (extra.action === 'sort') {
                  pagination.reset();
                }
              }}
              onRow={(field) => ({
                onClick: (event) => {
                  if (!(event.target as HTMLElement).closest('a, button')) {
                    void navigate(`/fields/${field.id}`);
                  }
                },
                className: 'clickable-row',
              })}
              locale={{
                emptyText: (
                  <Empty description={t('No fields match your filters')}>
                    <Button onClick={filtering.reset}>{t('Clear filters')}</Button>
                  </Empty>
                ),
              }}
            />
          </ConfigProvider>
        </div>
        <Flex className="table-footer" justify="space-between" gap={12} wrap>
          <Typography.Text type="secondary">
            {overview
              ? t('Showing {{value0}} of {{value1}} fields', {
                  value0: visible.length,
                  value1: fields.length,
                })
              : t('{{value0}}–{{value1}} of {{value2}} fields', {
                  value0: pagination.first,
                  value1: pagination.last,
                  value2: visible.length,
                })}
          </Typography.Text>
          {overview ? (
            <Badge status="success" text={t('Last synced just now')} />
          ) : (
            <Pagination
              size="small"
              current={pagination.currentPage}
              pageSize={pagination.pageSize}
              total={visible.length}
              showSizeChanger={{ showSearch: false }}
              pageSizeOptions={[5, 10, 20, 50, 100]}
              onChange={pagination.change}
            />
          )}
        </Flex>
      </Card>
    </div>
  );
}
