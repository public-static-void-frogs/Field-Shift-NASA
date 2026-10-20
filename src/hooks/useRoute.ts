import { useEffect, useRef, useState } from 'react';

function readPath() {
  return window.location.hash.slice(1) || '/';
}

function isCalendarView(route: string) {
  return /^\/calendar(?:\/\d{4}-\d{2}-\d{2})?$/.test(route.split('?')[0]);
}

export function useRoute() {
  const [path, setPath] = useState(readPath);
  const previousPath = useRef(path);

  useEffect(() => {
    const onHashChange = () => {
      const nextPath = readPath();
      const preserveScroll = isCalendarView(previousPath.current) && isCalendarView(nextPath);
      previousPath.current = nextPath;
      setPath(nextPath);
      if (!preserveScroll) window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function navigate(nextPath: string) {
    window.location.hash = nextPath;
  }

  return { path, navigate };
}
