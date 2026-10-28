import { useState } from 'react';
import { getPagination } from '../utils/pagination.ts';

export function useTablePagination(total: number) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { currentPage, first, last } = getPagination(total, page, pageSize);
  function change(nextPage: number, nextSize: number) {
    setPage(nextSize === pageSize ? nextPage : 1);
    setPageSize(nextSize);
  }
  function reset() {
    setPage(1);
  }
  return { currentPage, pageSize, first, last, change, reset };
}
