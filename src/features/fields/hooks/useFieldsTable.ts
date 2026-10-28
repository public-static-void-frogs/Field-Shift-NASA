import { useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fieldQueries } from '../../../api/fields/fields.queries.ts';
import { useFarm } from '../../../hooks/useFarm.ts';
import { getPagination } from '../../../utils/pagination.ts';
import { filterFields } from '../utils/fieldFilters.ts';

export function useFieldsTable(overview: boolean) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { fields } = useFarm();
  const { data: cropOptions } = useSuspenseQuery(fieldQueries.crops());
  const tableViewport = useRef<HTMLDivElement>(null);
  const [tableBodyHeight, setTableBodyHeight] = useState(300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    const viewport = tableViewport.current;
    if (overview || !viewport) {
      return;
    }
    const header = viewport.querySelector('.ant-table-thead');
    const resize = () =>
      setTableBodyHeight(
        Math.max(80, viewport.clientHeight - (header?.getBoundingClientRect().height ?? 58) - 2),
      );
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    if (header) {
      observer.observe(header);
    }
    resize();
    return () => observer.disconnect();
  }, [overview]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All fields');
  const [crop, setCrop] = useState('All crops');
  const [filters, setFilters] = useState<string[]>([]);
  const filterOptions = [
    ...Array.from(
      new Set([...cropOptions.map((option) => option.value), ...fields.map((field) => field.crop)]),
    ).map((value) => ({ key: `crop:${value}`, label: t('Crop: {{value0}}', { value0: value }) })),
    { key: 'moisture:low', label: t('Soil moisture: below 40%') },
    { key: 'health:low', label: t('Crop health: below 70') },
    { key: 'area:large', label: t('Area: 25 ha or more') },
  ];
  const attention = fields.filter((field) => field.status !== 'Healthy').length;
  const visible = filterFields(fields, { overview, query, status, crop, filters });
  const { currentPage, first, last } = getPagination(visible.length, page, pageSize);
  function resetFilters() {
    setQuery('');
    setStatus('All fields');
    setCrop('All crops');
    setFilters([]);
  }
  function changePage(nextPage: number, nextSize: number) {
    setPage(nextSize === pageSize ? nextPage : 1);
    setPageSize(nextSize);
  }

  return {
    navigate,
    fields,
    cropOptions,
    tableViewport,
    tableBodyHeight,
    pageSize,
    query,
    setQuery,
    status,
    setStatus,
    crop,
    setCrop,
    filters,
    setFilters,
    filterOptions,
    attention,
    visible,
    currentPage,
    first,
    last,
    setPage,
    resetFilters,
    changePage,
  };
}
