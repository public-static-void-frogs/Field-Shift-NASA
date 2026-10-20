import { useEffect, useState } from 'react';


export function useRoute() {
  const readPath = () => window.location.hash.slice(1) || '/';
  const [path, setPath] = useState(readPath);
  useEffect(() => {
    const onHashChange = () => {
      setPath(readPath());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  function navigate(nextPath: string) {
    window.location.hash = nextPath;
  }
  return { path, navigate };
}
