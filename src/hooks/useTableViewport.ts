import { useEffect, useRef, useState } from 'react';

export function useTableViewport(enabled: boolean) {
  const tableViewport = useRef<HTMLDivElement>(null);
  const [tableBodyHeight, setTableBodyHeight] = useState(300);
  useEffect(() => {
    const viewport = tableViewport.current;
    if (!enabled || !viewport) {
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
  }, [enabled]);

  return { tableViewport, tableBodyHeight };
}
